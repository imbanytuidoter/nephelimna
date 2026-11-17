import { dirname, join } from "node:path";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createChain } from "./chain.js";
import { readConfig } from "./config.js";
import { createHttp } from "./http.js";
import { createSeaKeeper } from "./sea.js";

const TICK_MS = 2500;
const ERROR_PAUSE_MS = 6000;

const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
const config = readConfig(process.env);
const keeperAccount = privateKeyToAccount(config.keeperKey);
const chain = createChain(config.rpcUrl, config.table, keeperAccount);
const keeper = createSeaKeeper(config, chain, log);
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

const server = createHttp({ state: keeper.snapshot, drip, rpcUrl: config.rpcUrl, dailyDrips: config.dailyDrips, savesFile: join(dirname(config.stateFile), "saves.json"), log });
server.listen(config.port, "127.0.0.1", () => log({ event: "listening", port: config.port, sea: config.table, keeper: keeperAccount.address }));
void loop("keeper", keeper.tick, TICK_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    server.close();
    chain.sdk.terminate();
    setTimeout(() => process.exit(0), 500);
  });
}
