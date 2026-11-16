import { existsSync } from "node:fs";

export interface GasBudget {
  readonly dayStart: number;
  readonly spent: bigint;
  readonly limit: bigint;
}

const DAY_MS = 86_400_000;

export function rollBudget(budget: GasBudget, nowMs: number): GasBudget {
  if (nowMs - budget.dayStart < DAY_MS) return budget;
  return { ...budget, dayStart: nowMs - ((nowMs - budget.dayStart) % DAY_MS), spent: 0n };
}

export function canSpend(budget: GasBudget, gas: bigint): boolean {
  return budget.spent + gas <= budget.limit;
}

export function spend(budget: GasBudget, gas: bigint): GasBudget {
  return { ...budget, spent: budget.spent + gas };
}

export function stopRequested(env: NodeJS.ProcessEnv, stopFile: string): boolean {
  return env.KEEPER_STOP === "1" || existsSync(stopFile);
}

export function belowAlert(balance: bigint, threshold: bigint): boolean {
  return balance < threshold;
}
