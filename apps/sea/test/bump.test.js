import { describe, expect, test } from "vitest";
import { BUMP, createBump } from "../src/game/bump.js";

describe("collision knock", () => {
  test("a hard hit knocks loud and low, a soft one quiet", () => {
    const played = [];
    const bump = createBump((volume, rate) => played.push({ volume, rate }));
    expect(bump(1 / 60, BUMP.fullSpeed * 2)).toBe(1);
    bump(1, 0);
    expect(bump(1 / 60, BUMP.minSpeed)).toBe(BUMP.quiet);
    expect(played[0].rate).toBeLessThan(played[1].rate);
  });

  test("resting against the obstacle does not repeat the knock every step", () => {
    const played = [];
    const bump = createBump((volume) => played.push(volume));
    for (let t = 0; t < 3; t += 1 / 60) bump(1 / 60, 3);
    expect(played).toHaveLength(1);
    for (let t = 0; t < BUMP.gap + 0.05; t += 1 / 60) bump(1 / 60, 0);
    bump(1 / 60, 3);
    expect(played).toHaveLength(2);
  });

  test("gliding along below the threshold is silent", () => {
    const played = [];
    const bump = createBump((volume) => played.push(volume));
    for (let t = 0; t < 2; t += 1 / 60) bump(1 / 60, BUMP.minSpeed * 0.5);
    expect(played).toHaveLength(0);
  });
});
