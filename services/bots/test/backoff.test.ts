import { describe, expect, it } from "vitest";
import { createTableBackoff } from "../src/keeper/backoff.js";

describe("table backoff", () => {
  it("lets a table run until it fails", () => {
    const backoff = createTableBackoff();
    expect(backoff.ready(1n, 0)).toBe(true);
  });

  it("doubles the wait on each failure up to two minutes", () => {
    const backoff = createTableBackoff();
    expect(backoff.fail(1n, 0)).toBe(4_000);
    expect(backoff.fail(1n, 0)).toBe(8_000);
    for (let i = 0; i < 10; i++) backoff.fail(1n, 0);
    expect(backoff.fail(1n, 0)).toBe(120_000);
  });

  it("skips only the failing table while it waits", () => {
    const backoff = createTableBackoff();
    backoff.fail(1n, 1_000);
    expect(backoff.ready(1n, 2_000)).toBe(false);
    expect(backoff.ready(2n, 2_000)).toBe(true);
    expect(backoff.ready(1n, 5_000)).toBe(true);
  });

  it("forgets the failures once the table moves on", () => {
    const backoff = createTableBackoff();
    backoff.fail(1n, 0);
    backoff.fail(1n, 0);
    backoff.clear(1n);
    expect(backoff.ready(1n, 0)).toBe(true);
    expect(backoff.fail(1n, 0)).toBe(4_000);
  });
});
