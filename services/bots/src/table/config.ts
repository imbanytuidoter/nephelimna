import { type Hex, isAddress, isHex } from "viem";

export interface Config {
  readonly rpcUrl: string;
  readonly keeperKey: Hex;
  readonly table: Hex;
  readonly botSeed: string;
  readonly port: number;
  readonly stateFile: string;
  readonly lobbyMs: number;
  readonly tideMs: number;
  readonly botSeats: number;
  readonly botCasts: number;
  readonly dripWei: bigint;
  readonly dripFloorWei: bigint;
  readonly dailyDrips: number;
}

function need(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function count(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const keeperKey = need(env, "DEPLOYER_PRIVATE_KEY");
  const table = need(env, "TABLE_ADDRESS");
  if (!isHex(keeperKey) || keeperKey.length !== 66) throw new Error("DEPLOYER_PRIVATE_KEY must be a 32 byte hex key");
  if (!isAddress(table)) throw new Error("TABLE_ADDRESS must be an address");
  return {
    rpcUrl: need(env, "SEPOLIA_RPC_URL"),
    keeperKey,
    table,
    botSeed: need(env, "BOT_SEED"),
    port: count(env, "TABLE_PORT", 3430, 1024, 65535),
    stateFile: need(env, "TABLE_STATE_FILE"),
    lobbyMs: count(env, "LOBBY_SECONDS", 40, 5, 600) * 1000,
    tideMs: count(env, "TIDE_SECONDS", 150, 30, 900) * 1000,
    botSeats: count(env, "BOT_SEATS", 4, 0, 9),
    botCasts: count(env, "BOT_CASTS", 4, 0, 6),
    dripWei: BigInt(count(env, "DRIP_GWEI", 2_000_000, 1000, 50_000_000)) * 1_000_000_000n,
    dripFloorWei: BigInt(count(env, "DRIP_FLOOR_GWEI", 500_000, 1000, 50_000_000)) * 1_000_000_000n,
    dailyDrips: count(env, "DAILY_DRIPS", 400, 1, 100_000),
  };
}
