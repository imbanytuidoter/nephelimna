import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { SEA } from "@nephelimna/rules";
import { type Hex, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createTableBackoff } from "../keeper/backoff.js";
import { type BoardState, type Row, type SeaEvent, applyEvents, emptyBoard, fillCount, rankBoard } from "./board.js";
import { type Chain, abi } from "./chain.js";
import type { Config } from "./config.js";

const DECRYPT_TIMEOUT_MS = 60_000;
const LOG_SPAN = 400n;
const SPANS_PER_TICK = 10;
/** The RPC balances across nodes, and one a few blocks behind refuses a log range past its own head, so the log reader trails the head by a few blocks. */
const LOG_LAG = 4n;

export interface Snapshot {
  readonly sea: Hex;
  readonly now: number;
  readonly generated: number;
  readonly ready: boolean;
  readonly anglers: number;
  readonly casts: number;
  readonly posting: readonly Hex[];
  readonly board: readonly Row[];
  readonly busy: string | null;
}

interface Saved {
  readonly cursor: number | null;
  readonly board: BoardState;
}

export function toEvents(logs: Parameters<typeof parseEventLogs>[0]["logs"]): SeaEvent[] {
  const events: SeaEvent[] = [];
  for (const log of parseEventLogs({ abi, logs })) {
    const base = { player: (log.args as { player: Hex }).player, block: Number(log.blockNumber), tx: log.transactionHash, index: log.logIndex };
    if (log.eventName === "Joined") events.push({ ...base, kind: "joined" });
    else if (log.eventName === "CastMade") events.push({ ...base, kind: "cast" });
    else if (log.eventName === "ScorePostRequested") events.push({ ...base, kind: "requested", name: log.args.name });
    else if (log.eventName === "ScorePosted") events.push({ ...base, kind: "posted", score: Number(log.args.score) });
  }
  return events;
}

/** A crash mid write used to leave half a JSON file that stopped the keeper on every restart, so a broken file is set aside and the logs are read again from the start block. */
function loadSaved(config: Config, log: (entry: Record<string, unknown>) => void): Saved {
  const fresh: Saved = { cursor: config.startBlock, board: emptyBoard() };
  if (!existsSync(config.stateFile)) return fresh;
  try {
    return JSON.parse(readFileSync(config.stateFile, "utf8")) as Saved;
  } catch (error) {
    renameSync(config.stateFile, `${config.stateFile}.broken-${Date.now()}`);
    log({ event: "state-reset", error: String(error).slice(0, 160) });
    return fresh;
  }
}

export function createSeaKeeper(config: Config, chain: Chain, log: (entry: Record<string, unknown>) => void) {
  const keeper = privateKeyToAccount(config.keeperKey);
  let saved: Saved = loadSaved(config, log);
  const persist = () => {
    const temp = `${config.stateFile}.tmp`;
    writeFileSync(temp, JSON.stringify(saved));
    renameSync(temp, config.stateFile);
  };
  const backoff = createTableBackoff();
  let generated = 0;
  let busy: string | null = null;

  async function readLogs() {
    const head = (await chain.publicClient.getBlockNumber()) - LOG_LAG;
    let from = saved.cursor === null ? (head > LOG_SPAN ? head - LOG_SPAN : 0n) : BigInt(saved.cursor);
    for (let i = 0; i < SPANS_PER_TICK && from <= head; i++) {
      const to = head - from > LOG_SPAN ? from + LOG_SPAN : head;
      const logs = await chain.publicClient.getLogs({ address: chain.table, fromBlock: from, toBlock: to });
      saved = { cursor: Number(to + 1n), board: applyEvents(saved.board, toEvents(logs)) };
      persist();
      from = to + 1n;
    }
  }

  async function confirm(player: Hex) {
    const id = BigInt(player);
    const now = Date.now();
    if (!backoff.ready(id, now)) return;
    try {
      const [, , posting] = await chain.read<readonly [Hex, number, boolean, number, bigint]>("anglerInfo", [player]);
      if (!posting) return;
      const handle = await chain.read<Hex>("postHandle", [player]);
      const res = await chain.sdk.decryption.decryptPublicValues([handle], { timeout: DECRYPT_TIMEOUT_MS });
      await chain.send(keeper, "confirmScore", [player, res.abiEncodedClearValues, res.decryptionProof], SEA.confirmGas);
      backoff.clear(id);
      log({ event: "score-confirmed", player, score: Number(res.clearValues[handle]) });
    } catch (error) {
      const wait = backoff.fail(id, now);
      log({ event: "score-confirm-retry", player, waitMs: wait, error: String(error).slice(0, 200) });
    }
  }

  /** Public nodes lag each other, so a read right after our own fill can show the count from before it; the count only grows, so the highest value seen wins. */
  async function readGenerated() {
    generated = Math.max(generated, Number(await chain.read<number>("generated", [])));
  }

  async function tick() {
    await readGenerated();
    const count = fillCount(generated);
    if (count > 0) {
      busy = "fill";
      try {
        await chain.send(keeper, "fillSea", [count], SEA.fillGas);
        generated += count;
        log({ event: "sea-filled", generated });
      } finally {
        busy = null;
      }
      return;
    }
    await readLogs().catch((error: unknown) => log({ event: "log-read-skipped", error: String(error).slice(0, 160) }));
    for (const player of saved.board.pending) await confirm(player);
  }

  function snapshot(): Snapshot {
    const board = saved.board;
    return {
      sea: chain.table,
      now: Date.now(),
      generated,
      ready: generated >= SEA.cells,
      anglers: board.anglers,
      casts: board.casts,
      posting: board.pending,
      board: rankBoard(board),
      busy,
    };
  }

  return { tick, snapshot, keeper };
}
