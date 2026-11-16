import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { belowAlert, canSpend, rollBudget, spend, stopRequested } from "../src/keeper/safety.js";

describe("keeper safety", () => {
  const budget = { dayStart: 0, spent: 0n, limit: 1_000n };

  it("caps daily gas and resets after a day", () => {
    const used = spend(budget, 900n);
    expect(canSpend(used, 100n)).toBe(true);
    expect(canSpend(used, 101n)).toBe(false);
    expect(rollBudget(used, 1_000)).toBe(used);
    const next = rollBudget(used, 86_400_000 * 2 + 5);
    expect(next.spent).toBe(0n);
    expect(next.dayStart).toBe(86_400_000 * 2);
  });

  it("stops on the env flag or the stop file", () => {
    const dir = mkdtempSync(join(tmpdir(), "keeper-"));
    const file = join(dir, "STOP");
    expect(stopRequested({}, file)).toBe(false);
    expect(stopRequested({ KEEPER_STOP: "1" }, file)).toBe(true);
    writeFileSync(file, "");
    expect(stopRequested({}, file)).toBe(true);
  });

  it("alerts on a low balance", () => {
    expect(belowAlert(5n, 10n)).toBe(true);
    expect(belowAlert(10n, 10n)).toBe(false);
  });
});
