import { type Hex, isAddress, isHex } from "viem";

export interface Config {
  readonly rpcUrl: string;
  readonly keeperKey: Hex;
  readonly table: Hex;
  readonly port: number;
  readonly stateFile: string;
  readonly startBlock: number | null;
  readonly dripWei: bigint;
  readonly dripFloorWei: bigint;
  readonly keeperReserveWei: bigint;
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
  const table = need(env, "SEA_ADDRESS");
  if (!isHex(keeperKey) || keeperKey.length !== 66) throw new Error("DEPLOYER_PRIVATE_KEY must be a 32 byte hex key");
  if (!isAddress(table)) throw new Error("SEA_ADDRESS must be an address");
  return {
    rpcUrl: need(env, "SEPOLIA_RPC_URL"),
    keeperKey,
    table,
    port: count(env, "TABLE_PORT", 3430, 1024, 65535),
    stateFile: need(env, "SEA_STATE_FILE"),
    startBlock: env.SEA_START_BLOCK === undefined ? null : count(env, "SEA_START_BLOCK", 0, 0, 1e12),
    dripWei: BigInt(count(env, "DRIP_GWEI", 2_000_000, 1000, 50_000_000)) * 1_000_000_000n,
    dripFloorWei: BigInt(count(env, "DRIP_FLOOR_GWEI", 500_000, 1000, 50_000_000)) * 1_000_000_000n,
    keeperReserveWei: BigInt(count(env, "KEEPER_RESERVE_GWEI", 50_000_000, 0, 1_000_000_000)) * 1_000_000_000n,
    dailyDrips: count(env, "DAILY_DRIPS", 400, 1, 100_000),
  };
}
