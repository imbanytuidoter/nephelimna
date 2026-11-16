import { describe, expect, test } from "vitest";
import { addCatch, createHold, holdValue, sellAll } from "../src/game/hold.js";
import { DOLPHIN, createDolphin, dolphinPose, stepPod } from "../src/game/life/dolphinMotion.js";
import { createGull, gullPose, isFlapping, wingAngles } from "../src/game/life/gullMotion.js";
import { seeded } from "../src/game/life/random.js";
import { waveScaleAt } from "../src/game/sea.js";
import { SCHOOL, createSchool, schoolCenter, stepFlee } from "../src/game/life/schoolMotion.js";
import { canTrade, marketSpot } from "../src/game/market.js";
import { harbourSite } from "../src/game/site.js";

describe("dolphins", () => {
  const dolphin = createDolphin(seeded(1));
  const pod = { x: 100, z: -50 };
  const pose = {};

  const scan = () => {
    const rows = [];
    for (let t = 0; t < 90; t += 0.02) rows.push({ ...dolphinPose(dolphin, pod, t, pose) });
    return rows;
  };

  test("swim below the surface, come up to breathe and sometimes leap clear", () => {
    const rows = scan();
    expect(rows.some((r) => !r.airborne && r.y === DOLPHIN.cruiseDepth)).toBe(true);
    const tops = rows.filter((r) => r.airborne).map((r) => r.y);
    expect(Math.max(...tops)).toBeGreaterThan(1.5);
    expect(rows.some((r) => r.airborne && !r.leap && r.y > 0.3 && r.y < 0.8)).toBe(true);
    expect(rows.every((r) => r.y < 2)).toBe(true);
  });

  test("point up when leaving the water, down when coming back, and arch over the top", () => {
    const rows = scan();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].airborne || !rows[i - 1].airborne) continue;
      const rising = rows[i].y > rows[i - 1].y;
      if (Math.abs(rows[i].pitch) > 0.1) expect(rows[i].pitch > 0).toBe(rising);
      expect(rows[i].bend).toBeLessThan(0);
    }
    expect(rows.find((r) => !r.airborne).bend).toBe(0);
  });

  test("the pod follows the boat but never enters shallow water", () => {
    const deep = { x: 0, z: 0 };
    for (let i = 0; i < 600; i++) stepPod(deep, { x: 500, z: 0 }, 0, 1 / 60, () => -20);
    expect(deep.x).toBeGreaterThan(80);
    const blocked = { x: 0, z: 0 };
    for (let i = 0; i < 600; i++) stepPod(blocked, { x: 500, z: 0 }, 0, 1 / 60, () => -1);
    expect(blocked.x).toBe(0);
  });
});

describe("fish schools", () => {
  test("move away from a boat that comes close and drift back afterwards", () => {
    const school = createSchool(seeded(2), 0, 0, 10);
    const center = { x: 0, z: 0 };
    schoolCenter(school, 0, center);
    const boat = { x: center.x - 4, z: center.z };
    for (let i = 0; i < 180; i++) {
      schoolCenter(school, 0, center);
      stepFlee(school, center, boat, 1 / 60);
    }
    expect(Math.hypot(center.x - boat.x, center.z - boat.z)).toBeGreaterThan(SCHOOL.flee * 0.8);
    const scared = Math.hypot(school.fleeX, school.fleeZ);
    for (let i = 0; i < 1800; i++) {
      schoolCenter(school, 0, center);
      stepFlee(school, center, { x: 900, z: 900 }, 1 / 60);
    }
    expect(Math.hypot(school.fleeX, school.fleeZ)).toBeLessThan(scared * 0.1);
  });
});

describe("market", () => {
  const site = harbourSite();
  const spot = marketSpot(site);

  test("trading needs the boat close to the stall and nearly stopped", () => {
    expect(canTrade(spot, spot.berth, 0.5)).toBe(true);
    expect(canTrade(spot, spot.berth, 8)).toBe(false);
    expect(canTrade(spot, { x: spot.berth.x + 200, z: spot.berth.z }, 0)).toBe(false);
  });

  test("selling turns the whole hold into coins by rarity", () => {
    let hold = createHold();
    hold = addCatch(hold, { name: "Bream", rarity: "common" });
    hold = addCatch(hold, { name: "Bream", rarity: "common" });
    hold = addCatch(hold, { name: "Moon eel", rarity: "rare" });
    expect(hold.items).toHaveLength(2);
    expect(holdValue(hold)).toBe(6 * 2 + 38);
    const sold = sellAll(hold);
    expect(sold.coins).toBe(50);
    expect(sold.items).toHaveLength(0);
  });

  test("rejects a catch with an unknown rarity", () => {
    expect(() => addCatch(createHold(), { name: "Boot", rarity: "junk" })).toThrow();
  });
});

describe("gulls", () => {
  test("beat their wings in bursts and hold them still while gliding", () => {
    const gull = createGull(seeded(5), 3);
    const wing = {};
    const sweep = (from) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = from; t < from + 1; t += 1 / 60) {
        wingAngles(gull, t, 1 / 60, wing);
        lo = Math.min(lo, wing.inner);
        hi = Math.max(hi, wing.inner);
      }
      return hi - lo;
    };
    let flapStart = 0;
    while (!isFlapping(gull, flapStart) || !isFlapping(gull, flapStart + 2)) flapStart += 0.1;
    let glideStart = flapStart;
    while (isFlapping(gull, glideStart) || isFlapping(gull, glideStart + 2)) glideStart += 0.1;
    for (let t = flapStart - 3; t < flapStart; t += 1 / 60) wingAngles(gull, t, 1 / 60, wing);
    expect(sweep(flapStart + 1)).toBeGreaterThan(0.6);
    for (let t = glideStart - 1; t < glideStart + 1.5; t += 1 / 60) wingAngles(gull, t, 1 / 60, wing);
    expect(sweep(glideStart + 1.5)).toBeLessThan(0.15);
  });

  test("stay above the water and bank into their turn", () => {
    const gull = createGull(seeded(6), 1);
    const pose = {};
    for (let t = 0; t < 120; t += 0.7) {
      gullPose(gull, { x: 0, z: 0 }, t, pose);
      expect(pose.y).toBeGreaterThan(3);
      expect(Math.sign(pose.roll)).toBe(-gull.turn);
    }
  });
});

describe("sea state", () => {
  test("is calm by the island and a little higher far out, never rough", () => {
    expect(waveScaleAt(0)).toBe(0.03);
    expect(waveScaleAt(400)).toBe(0.03);
    expect(waveScaleAt(1000)).toBeGreaterThan(0.03);
    expect(waveScaleAt(5000)).toBe(0.07);
    expect(waveScaleAt(900)).toBeLessThanOrEqual(waveScaleAt(1200));
  });
});

describe("dolphin visits", () => {
  test("a pair arrives now and then, stays a while, then leaves for minutes", async () => {
    const { DOLPHIN, VISIT, createVisit, stepVisit } = await import("../src/game/life/dolphinMotion.js");
    expect(DOLPHIN.count).toBe(2);
    let visit = createVisit(() => 0.5);
    const events = [];
    for (let t = 0; t < 900; t += 0.5) {
      const step = stepVisit(visit, 0.5, () => 0.5);
      visit = step.visit;
      if (step.event) events.push([step.event, t]);
    }
    expect(events[0][0]).toBe("arrive");
    expect(events[0][1]).toBeGreaterThanOrEqual(VISIT.firstIn[0] - 1);
    const firstLeave = events.find(([e]) => e === "leave")[1];
    expect(firstLeave - events[0][1]).toBeCloseTo(VISIT.stay, 0);
    const arrivals = events.filter(([e]) => e === "arrive").map(([, t]) => t);
    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    expect(arrivals[1] - arrivals[0]).toBeGreaterThan(VISIT.every[0]);
  });
});

describe("schools near the boat", () => {
  test("a follower school settles beside an anchored boat and stays put while it moves fast", async () => {
    const { FOLLOW, createSchool, stepFollow } = await import("../src/game/life/schoolMotion.js");
    const school = createSchool(seeded(3), 0, 0, 4);
    const boat = { x: 200, z: 0 };
    for (let i = 0; i < 1200; i++) stepFollow(school, boat, 8, 0, 1 / 60, () => -20);
    expect(school.x).toBe(0);
    for (let i = 0; i < 3600; i++) stepFollow(school, boat, 0, 0, 1 / 60, () => -20);
    expect(Math.hypot(school.x - boat.x, school.z - boat.z)).toBeCloseTo(FOLLOW.distance, 0);
  });
});
