import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Stage, TABLE, packChoice } from "@nephelimna/rules";
import { type Hex, type PrivateKeyAccount, keccak256, parseEventLogs, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type Chain, abi } from "./chain.js";
import type { Config } from "./config.js";
import { type RoundView, type Step, type Timers, botCastTimes, nextStep } from "./plan.js";

const BOT_NAMES = ["Mara", "Okon", "Sile", "Brann", "Ilse", "Teo", "Wren", "Juno", "Kai"];
const HEAVY_GAS = 16_000_000n;
const LIGHT_GAS = 1_500_000n;
const DECRYPT_TIMEOUT_MS = 60_000;
const LAKE_CHUNK = 16;
const LAKE_TRIES = 8;
const LAKE_RETRY_MS = 15_000;
const BOT_FLOOR_WEI = 300_000_000_000_000n;
const BOT_TOPUP_WEI = 2_000_000_000_000_000n;
const LOG_SPAN = 400n;
/** A node one block behind the head refuses a log query for a block it has not seen, so the cast log trails the head by a block. */
const LOG_LAG = 1n;

export interface SeatView {
  readonly seat: number;
  readonly player: Hex;
  readonly name: string | null;
  readonly bot: boolean;
  readonly castsLeft: number;
  readonly netsSet: boolean;
  readonly finalScore: number;
}

export interface Final {
  readonly round: number;
  readonly scores: readonly number[];
  readonly names: readonly (string | null)[];
  readonly players: readonly Hex[];
  readonly lake: readonly number[] | null;
  readonly leviathan: number | null;
  readonly casts: readonly { readonly seat: number; readonly cell: number; readonly tide: number }[];
  readonly fromBlock: number | null;
  readonly toBlock: number | null;
}

export interface Snapshot {
  readonly table: Hex;
  readonly now: number;
  readonly round: (RoundView & { readonly lobbyEndsAt: number | null; readonly tideEndsAt: number | null }) | null;
  readonly seats: readonly SeatView[];
  readonly casts: readonly { readonly seat: number; readonly cell: number; readonly tide: number }[];
  readonly final: Final | null;
  readonly busy: string | null;
}

interface Saved {
  round: number;
  firstJoinAt: number | null;
  tideStartedAt: number | null;
  startBlock?: number | null;
  endBlock?: number | null;
  final: Final | null;
}

interface Job {
  readonly round: number;
  readonly tide: number;
  readonly at: number;
  readonly run: () => Promise<void>;
}

export function createKeeper(config: Config, chain: Chain, log: (entry: Record<string, unknown>) => void) {
  const keeper = privateKeyToAccount(config.keeperKey);
  const bots: PrivateKeyAccount[] = BOT_NAMES.map((_, i) => privateKeyToAccount(keccak256(toHex(`${config.botSeed}:${i}`))));
  const botIndex = new Map(bots.map((bot, i) => [bot.address.toLowerCase(), i]));
  const saved: Saved = existsSync(config.stateFile) ? (JSON.parse(readFileSync(config.stateFile, "utf8")) as Saved) : { round: 0, firstJoinAt: null, tideStartedAt: null, final: null };
  const persist = () => writeFileSync(config.stateFile, JSON.stringify(saved));
  const floor = { id: 0, stage: 0, seats: 0, generated: 0, tide: 0, lakeOpened: false };
  let seats: SeatView[] = [];
  let casts: { seat: number; cell: number; tide: number }[] = [];
  let logsFrom: bigint | null = null;
  let view: RoundView | null = null;
  let busy: string | null = null;
  let jobs: Job[] = [];
  let plannedTide = "";
  let lakeTask: Promise<void> | null = null;
  const random = Math.random;

  const timers = (): Timers => ({ firstJoinAt: saved.firstJoinAt, tideStartedAt: saved.tideStartedAt });
  const pace = { lobbyMs: config.lobbyMs, tideMs: config.tideMs, botSeats: config.botSeats };

  /** Public nodes lag each other, so a read right after our own transaction can show the state from before it; the stage, tide, seat and lake counters only ever grow inside a round, so the highest value seen wins. */
  async function readView(): Promise<RoundView | null> {
    const id = Math.max(Number(await chain.read<number>("roundCount", [])), floor.id);
    if (id === 0) return null;
    if (id !== floor.id) Object.assign(floor, { id, stage: 0, seats: 0, generated: 0, tide: 0, lakeOpened: false });
    const [stage, seatCount, generated, tide] = await chain.read<readonly [number, number, number, number]>("roundInfo", [id]);
    floor.stage = Math.max(floor.stage, stage);
    floor.seats = Math.max(floor.seats, seatCount);
    floor.generated = Math.max(floor.generated, generated);
    floor.tide = Math.max(floor.tide, tide);
    floor.lakeOpened = floor.lakeOpened || (floor.stage === Stage.Revealed && (await chain.read<boolean>("lakeOpened", [id])));
    const list: SeatView[] = [];
    for (let seat = 0; seat < floor.seats; seat++) {
      const [player, , castsLeft, netsSet, finalScore] = await chain.read<readonly [Hex, Hex, number, boolean, number]>("seatInfo", [id, seat]);
      const bot = botIndex.get(player.toLowerCase());
      list.push({ seat, player, name: bot === undefined ? null : BOT_NAMES[bot]!, bot: bot !== undefined, castsLeft, netsSet, finalScore });
    }
    if (list.every((seat) => !/^0x0+$/.test(seat.player))) seats = list;
    const humans = seats.filter((seat) => !seat.bot).length;
    return { id, stage: floor.stage, seats: seats.length, generated: floor.generated, tide: floor.tide, lakeOpened: floor.lakeOpened, humans };
  }

  async function readCasts(round: number) {
    const head = (await chain.publicClient.getBlockNumber()) - LOG_LAG;
    if (logsFrom === null) logsFrom = head > LOG_SPAN ? head - LOG_SPAN : 0n;
    if (head < logsFrom) return;
    const to = head - logsFrom > LOG_SPAN ? logsFrom + LOG_SPAN : head;
    const logs = await chain.publicClient.getLogs({ address: chain.table, fromBlock: logsFrom, toBlock: to });
    for (const event of parseEventLogs({ abi, logs, eventName: "CastMade" })) {
      if (Number(event.args.round) === round) casts.push({ seat: event.args.seat, cell: event.args.cell, tide: event.args.tide });
    }
    logsFrom = to + 1n;
  }

  async function seatBots(round: number, wanted: number) {
    const seated = new Set(seats.map((seat) => seat.player.toLowerCase()));
    const free = bots.filter((bot) => !seated.has(bot.address.toLowerCase())).slice(0, wanted);
    for (const bot of free) {
      if ((await chain.publicClient.getBalance({ address: bot.address })) < BOT_FLOOR_WEI) await chain.pay(keeper, bot.address, BOT_TOPUP_WEI);
      await chain.send(bot, "join", [round, bot.address], TABLE.joinGas);
      floor.seats += 1;
    }
  }

  async function encrypt(values: number[], user: Hex) {
    return chain.sdk.encrypt({ values: values.map((value) => ({ type: "euint8" as const, value: BigInt(value) })), contractAddress: chain.table, userAddress: user });
  }

  function planBots(round: number, tide: number, startedAt: number) {
    const key = `${round}:${tide}`;
    if (plannedTide === key) return;
    plannedTide = key;
    jobs = [];
    for (const seat of seats.filter((s) => s.bot)) {
      const bot = bots[botIndex.get(seat.player.toLowerCase())!]!;
      const cell = () => Math.floor(random() * TABLE.cells);
      jobs.push({
        round,
        tide,
        at: startedAt + 2000 + Math.floor(random() * 15_000),
        run: async () => {
          const enc = await encrypt([cell(), cell()], bot.address);
          await chain.send(bot, "setNets", [round, seat.seat, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof], TABLE.netsGas);
        },
      });
      for (const at of botCastTimes(startedAt, config.tideMs, config.botCasts, random)) {
        jobs.push({
          round,
          tide,
          at,
          run: async () => {
            const enc = await encrypt([packChoice(Math.floor(random() * 3), Math.floor(random() * 3))], bot.address);
            await chain.send(bot, "cast", [round, seat.seat, cell(), enc.encryptedValues[0]!, enc.inputProof], TABLE.castGas);
          },
        });
      }
    }
    jobs.sort((a, b) => a.at - b.at);
  }

  async function revealScores(round: number) {
    const handles: Hex[] = [];
    for (let seat = 0; seat < seats.length; seat++) handles.push(await chain.read<Hex>("scoreHandle", [round, seat]));
    const res = await chain.sdk.decryption.decryptPublicValues(handles, { timeout: DECRYPT_TIMEOUT_MS });
    await chain.send(keeper, "revealScores", [round, res.abiEncodedClearValues, res.decryptionProof], LIGHT_GAS);
    saved.final = {
      round,
      scores: handles.map((handle) => Number(res.clearValues[handle])),
      names: seats.map((seat) => seat.name),
      players: seats.map((seat) => seat.player),
      lake: null,
      leviathan: null,
      casts: [...casts],
      fromBlock: saved.startBlock ?? null,
      toBlock: saved.endBlock ?? null,
    };
    persist();
  }

  async function readLake(round: number) {
    const values: number[] = [];
    for (let from = 0; from < TABLE.cells; from += LAKE_CHUNK) {
      const handles: Hex[] = [];
      for (let cell = from; cell < from + LAKE_CHUNK; cell++) handles.push(await chain.read<Hex>("cellHandle", [round, cell]));
      const res = await retry(() => chain.sdk.decryption.decryptPublicValues(handles, { timeout: DECRYPT_TIMEOUT_MS }));
      values.push(...handles.map((handle) => Number(res.clearValues[handle])));
    }
    const levHandle = await chain.read<Hex>("leviathanHandle", [round]);
    const lev = await retry(() => chain.sdk.decryption.decryptPublicValues([levHandle], { timeout: DECRYPT_TIMEOUT_MS }));
    if (saved.final?.round === round) {
      saved.final = { ...saved.final, lake: values, leviathan: Number(lev.clearValues[levHandle]) };
      persist();
    }
    log({ event: "lake-revealed", round });
  }

  async function retry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (attempt >= LAKE_TRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, LAKE_RETRY_MS));
      }
    }
  }

  async function execute(step: Step, current: RoundView | null, now: number) {
    const id = current?.id ?? 0;
    if (step.kind === "open") {
      await chain.send(keeper, "openRound", [], LIGHT_GAS);
      Object.assign(floor, { id: id + 1, stage: Stage.Lobby, seats: 0, generated: 0, tide: 0, lakeOpened: false });
      seats = [];
      casts = [];
      Object.assign(saved, { round: id + 1, firstJoinAt: null, tideStartedAt: null });
    } else if (step.kind === "fill") {
      await chain.send(keeper, "fillLake", [id, step.count], HEAVY_GAS);
      floor.generated += step.count;
    } else if (step.kind === "seatBots") {
      await seatBots(id, step.count);
    } else if (step.kind === "start") {
      saved.startBlock = Number((await chain.send(keeper, "startRound", [id], LIGHT_GAS)).blockNumber);
      Object.assign(floor, { stage: Stage.Fishing, tide: 1 });
      saved.tideStartedAt = Date.now();
    } else if (step.kind === "turnTide") {
      const turned = await chain.send(keeper, "turnTide", [id], LIGHT_GAS);
      if (floor.tide >= TABLE.tides) {
        floor.stage = Stage.Finished;
        saved.endBlock = Number(turned.blockNumber);
      }
      if (floor.stage !== Stage.Finished) floor.tide += 1;
      saved.tideStartedAt = Date.now();
    } else if (step.kind === "requestScores") {
      await chain.send(keeper, "requestScores", [id], HEAVY_GAS);
      floor.stage = Stage.Revealing;
    } else if (step.kind === "revealScores") {
      await revealScores(id);
      floor.stage = Stage.Revealed;
    } else if (step.kind === "openLake") {
      await chain.send(keeper, "openLake", [id], HEAVY_GAS);
      floor.lakeOpened = true;
      lakeTask = readLake(id).catch((error: unknown) => log({ event: "lake-reveal-failed", round: id, error: String(error).slice(0, 300) }));
    }
    persist();
    log({ event: "step", step: step.kind, round: floor.id, ms: Date.now() - now });
  }

  async function tick() {
    const now = Date.now();
    view = await readView();
    if (view && view.stage === Stage.Lobby && view.humans > 0 && saved.firstJoinAt === null) {
      saved.firstJoinAt = now;
      persist();
    }
    if (view && view.stage === Stage.Fishing) {
      await readCasts(view.id).catch((error: unknown) => log({ event: "cast-log-skipped", error: String(error).slice(0, 120) }));
      if (saved.tideStartedAt !== null) planBots(view.id, view.tide, saved.tideStartedAt);
    }
    const step = nextStep(view, timers(), now, pace);
    if (step.kind === "wait") return;
    busy = step.kind;
    try {
      await execute(step, view, now);
    } finally {
      busy = null;
    }
  }

  async function botTick() {
    const now = Date.now();
    const due = jobs.find((job) => job.at <= now);
    if (!due) return;
    jobs = jobs.filter((job) => job !== due);
    if (!view || view.id !== due.round || view.tide !== due.tide || view.stage !== Stage.Fishing) return;
    await due.run();
  }

  function snapshot(): Snapshot {
    const now = Date.now();
    const lobbyEndsAt = view?.stage === Stage.Lobby && saved.firstJoinAt !== null ? saved.firstJoinAt + config.lobbyMs : null;
    const tideEndsAt = view?.stage === Stage.Fishing && saved.tideStartedAt !== null ? saved.tideStartedAt + config.tideMs : null;
    return { table: chain.table, now, round: view ? { ...view, lobbyEndsAt, tideEndsAt } : null, seats, casts, final: saved.final, busy };
  }

  return { tick, botTick, snapshot, keeper, lakeTask: () => lakeTask };
}
