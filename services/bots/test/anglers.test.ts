import { describe, expect, test } from "vitest";
import { packChoice } from "@nephelimna/rules";
import { STYLES, cellOf, nextSpot, pickChoice, stepBoat } from "../src/table/anglers.js";

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe("AI anglers", () => {
  test("each style only picks depth and bait pairs it lists", () => {
    for (const style of STYLES) {
      const allowed = new Set(style.choices.map(([depth, bait]) => packChoice(depth, bait)));
      for (let i = 0; i < 200; i++) expect(allowed.has(pickChoice(style, i / 200))).toBe(true);
    }
  });

  test("every angler name fits the boat tag with its AI suffix", () => {
    for (const style of STYLES) expect(`${style.name} AI`.length).toBeLessThanOrEqual(20);
  });

  test("a cast is made from the chart square the boat floats in", () => {
    expect(cellOf(-1599, -1599)).toBe(0);
    expect(cellOf(1599, 1599)).toBe(63);
    expect(cellOf(-1, 1)).toBe(4 * 8 + 3);
  });

  test("boats stay in open water away from the island and inside the chart", () => {
    const random = seeded(7);
    let at = { x: 900, z: 0 };
    for (let i = 0; i < 500; i++) {
      const next = nextSpot(at.x, at.z, random);
      const r = Math.hypot(next.x, next.z);
      expect(r).toBeGreaterThanOrEqual(700);
      expect(r).toBeLessThanOrEqual(1500);
      for (let k = 0; k <= 20; k++) expect(Math.hypot(at.x + ((next.x - at.x) * k) / 20, at.z + ((next.z - at.z) * k) / 20)).toBeGreaterThan(500);
      at = next;
    }
  });

  test("a boat sails to its spot, then anchors and waits before its first cast", () => {
    const random = seeded(3);
    let boat = { x: 1000, z: 0, yaw: 0, sailing: true, tx: 1060, tz: 0, fishUntil: 0, castAt: 0 };
    let now = 1_000_000;
    for (let i = 0; i < 20 && boat.sailing; i++) {
      now += 1000;
      boat = stepBoat(boat, 1, now, random);
    }
    expect(boat.sailing).toBe(false);
    expect(boat.castAt).toBeGreaterThan(now);
    expect(boat.fishUntil).toBeGreaterThan(boat.castAt);
  });
});

describe("AI angler strength", () => {
  test("no AI angler fishes with live bait, so the Leviathan and mythic fish stay for people", () => {
    for (const style of STYLES) for (const [, bait] of style.choices) expect(bait).not.toBe(2);
  });
});

describe("waking the fleet", () => {
  test("an anchored boat casts within a minute and a half of a person arriving", async () => {
    const { wake } = await import("../src/table/anglers.js");
    const now = 5_000_000;
    const boat = wake({ x: 900, z: 0, yaw: 0, sailing: false, tx: 900, tz: 0, fishUntil: 0, castAt: 0 }, now, () => 0.5);
    expect(boat.castAt - now).toBeLessThanOrEqual(90_000);
    expect(boat.fishUntil).toBeGreaterThan(boat.castAt);
  });
});
