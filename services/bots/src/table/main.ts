import { dirname, join } from "node:path";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createChain } from "./chain.js";
import { readConfig } from "./config.js";
import { createHttp } from "./http.js";
import { createSeaKeeper } from "./sea.js";
import { createAnglers } from "./anglers.js";
import { createPresence } from "./presence.js";

const TICK_MS = 2500;
const ANGLER_TICK_MS = 1000;
const ERROR_PAUSE_MS = 6000;

const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
const config = readConfig(process.env);
const keeperAccount = privateKeyToAccount(config.keeperKey);
const chain = createChain(config.rpcUrl, config.table, keeperAccount);
const keeper = createSeaKeeper(config, chain, log);
const presence = createPresence();
const bestPerson = () => keeper.snapshot(anglers.isRetired).board.filter((row) => !anglers.isBot(row.player)).reduce((best, row) => Math.max(best, row.score), 0);
/** Bots keep the sea busy for people, so a bot only posts while its last posted score is below the best person's. */
const mayPost = (player: string) => (keeper.snapshot().board.find((row) => row.player.toLowerCase() === player.toLowerCase())?.score ?? 0) < bestPerson();
const anglers = createAnglers(join(dirname(config.stateFile), "anglers.json"), chain, keeperAccount, presence, log, config.keeperReserveWei, mayPost);
const state = () => {
  const snapshot = keeper.snapshot(anglers.isRetired);
  const best = bestPerson();
  const board = snapshot.board
    .filter((row) => !anglers.isBot(row.player) || row.score <= best)
    .map((row, i) => ({ ...row, rank: i + 1, name: anglers.nameOf(row.player) ?? row.name, bot: anglers.isBot(row.player) }));
  const recent = snapshot.recent.filter((entry) => !anglers.isRetired(entry.player)).map((entry) => ({ ...entry, name: anglers.nameOf(entry.player) ?? entry.name, bot: anglers.isBot(entry.player) }));
  return { ...snapshot, board, recent };
};
let stopping = false;

async function loop(name: string, run: () => Promise<void>, everyMs: number) {
  while (!stopping) {
    try {
      await run();
      await new Promise((resolve) => setTimeout(resolve, everyMs));
    } catch (error) {
      log({ event: "loop-error", loop: name, error: String(error).slice(0, 400) });
      await new Promise((resolve) => setTimeout(resolve, ERROR_PAUSE_MS));
    }
  }
}

async function drip(address: Hex) {
  const balance = await chain.publicClient.getBalance({ address });
  if (balance >= config.dripFloorWei) return { ok: true };
  const reserve = await chain.publicClient.getBalance({ address: keeperAccount.address });
  if (reserve < config.keeperReserveWei + config.dripWei) {
    log({ event: "drip-refused-reserve", reserve: reserve.toString() });
    return { ok: false, reason: "the faucet is empty for today" };
  }
  await chain.pay(keeperAccount, address, config.dripWei);
  log({ event: "drip", address });
  return { ok: true };
}

const server = createHttp({ state, presence, drip, rpcUrl: config.rpcUrl, dailyDrips: config.dailyDrips, savesFile: join(dirname(config.stateFile), "saves.json"), log });
server.listen(config.port, "127.0.0.1", () => log({ event: "listening", port: config.port, sea: config.table, keeper: keeperAccount.address }));
void loop("keeper", keeper.tick, TICK_MS);
void loop("anglers", anglers.tick, ANGLER_TICK_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    server.close();
    chain.sdk.terminate();
    setTimeout(() => process.exit(0), 500);
  });
}
