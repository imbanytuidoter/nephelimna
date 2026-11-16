import { describe, expect, test } from "vitest";
import { launchOnSea } from "./sea.js";

describe("player boat in a seaway", () => {
  test("rides at anchor with dry gunwales and a gentle motion", () => {
    const sea = launchOnSea(1);
    sea.run(5);
    const m = sea.run(20);
    expect(m.awash).toBe(0);
    expect(m.rollRms).toBeLessThan(4);
    expect(m.rollMax).toBeLessThan(8);
    expect(m.pitchRms).toBeLessThan(5);
    expect(m.rollRateRms).toBeLessThan(9);
    expect(m.rollRms).toBeGreaterThan(0.4);
  });

  test("stays in the water with dry gunwales at full speed", () => {
    const sea = launchOnSea(1);
    sea.run(5);
    const m = sea.run(20, 1);
    expect(m.speed).toBeGreaterThan(10);
    expect(m.awash).toBe(0);
    expect(m.airborne).toBeLessThan(0.01);
    expect(m.pitchMax).toBeLessThan(14);
    expect(m.rollMax).toBeLessThan(10);
    expect(m.heaveRms).toBeLessThan(2);
  });

  test("leans into a fast turn without capsizing", () => {
    const sea = launchOnSea(1);
    sea.run(5);
    sea.run(10, 1);
    const m = sea.run(10, 1, 0.7);
    expect(m.rollMax).toBeLessThan(18);
    expect(m.rollRms).toBeGreaterThan(3);
    expect(m.airborne).toBeLessThan(0.01);
  });

  test("never puts a rail or the bow under in tall waves, at anchor or under way", () => {
    const sea = launchOnSea(2.2);
    sea.run(5);
    const anchored = sea.run(30);
    const cruising = sea.run(30, 1);
    const weaving = sea.run(20, 0.4, -0.3);
    expect(anchored.awash).toBeLessThan(0.005);
    expect(cruising.awash).toBeLessThan(0.005);
    expect(weaving.awash).toBeLessThan(0.01);
    expect(cruising.airborne).toBeLessThan(0.01);
    expect(cruising.rollMax).toBeLessThan(20);
    expect(cruising.pitchMax).toBeLessThan(26);
    expect(cruising.heaveRms).toBeLessThan(2);
  });

  test("keeps its rails clear through a fast turn in tall waves", () => {
    const sea = launchOnSea(2.2);
    sea.run(5);
    sea.run(10, 1);
    const m = sea.run(20, 1, 0.6);
    expect(m.awash).toBeLessThan(0.03);
    expect(m.rollMax).toBeLessThan(24);
  });

  test("follows the slope of tall waves instead of staying level", () => {
    const sea = launchOnSea(2.2);
    sea.run(5);
    const m = sea.run(20);
    expect(m.pitchRms).toBeGreaterThan(5);
    expect(m.pitchMax).toBeLessThan(24);
  });
});
