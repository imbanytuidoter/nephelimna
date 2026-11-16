import { describe, expect, test } from "vitest";
import { TRACK, createTrack } from "../src/game/track.js";

function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function deliveries({ speed, seconds, random, latency = 0.06 }) {
  const out = [];
  const server = [];
  for (let t = 0; t <= seconds; t += 0.25) server.push({ t, at: t + latency * random() });
  let poll = 0.1;
  while (poll < seconds + 1) {
    const arrive = poll + latency * (0.5 + random());
    const latest = server.filter((s) => s.at <= poll).at(-1);
    if (latest) out.push({ receive: arrive, age: poll - latest.at, boat: { x: latest.t * speed, y: 0, z: 0, yaw: 0, t: latest.t + 1000 } });
    poll += 0.25 + 0.05 * random();
  }
  return out;
}

describe("remote boat track", () => {
  test("a boat sailing at a steady speed moves the same distance every frame, with no stalls or double steps", () => {
    const speed = 6;
    const random = lcg(7);
    const queue = deliveries({ speed, seconds: 12, random });
    const track = createTrack();
    const steps = [];
    let last = null;
    for (let now = 0; now < 12; now += 1 / 60) {
      while (queue.length && queue[0].receive <= now) {
        const { boat, age, receive } = queue.shift();
        track.push({ ...boat, age: age * 1000 }, receive);
      }
      const state = track.at(now);
      if (state && now > 2 && last) steps.push(state.x - last.x);
      if (state) last = state;
    }
    const expected = speed / 60;
    expect(steps.length).toBeGreaterThan(400);
    expect(Math.min(...steps)).toBeGreaterThan(expected * 0.7);
    expect(Math.max(...steps)).toBeLessThan(expected * 1.3);
  });

  test("the boat is drawn a short moment behind its last report and never far ahead of it", () => {
    const track = createTrack();
    track.push({ x: 0, y: 0, z: 0, yaw: 0, t: 50, age: 0 }, 10);
    track.push({ x: 10, y: 0, z: 0, yaw: 0, t: 51, age: 0 }, 11);
    expect(track.at(11).x).toBeCloseTo(10 * (1 - TRACK.delay), 5);
    expect(track.at(20).x).toBeLessThanOrEqual(10 + 10 * TRACK.ahead + 1e-9);
  });

  test("a repeated report and one from the past are ignored, and the heading turns the short way across north", () => {
    const track = createTrack();
    track.push({ x: 0, y: 0, z: 0, yaw: Math.PI - 0.1, t: 1, age: 0 }, 0);
    track.push({ x: 4, y: 0, z: 0, yaw: -Math.PI + 0.1, t: 2, age: 0 }, 1);
    track.push({ x: 99, y: 0, z: 0, yaw: 0, t: 2, age: 0 }, 1.2);
    track.push({ x: -99, y: 0, z: 0, yaw: 0, t: 1.5, age: 0 }, 1.3);
    const mid = track.at(1 + TRACK.delay - 0.5);
    expect(mid.x).toBeCloseTo(2, 5);
    expect(Math.abs(Math.cos(mid.yaw) + 1)).toBeLessThan(1e-6);
  });

  test("a boat from an old client without a clock still shows where it was reported", () => {
    const track = createTrack();
    track.push({ x: 3, y: 1, z: -60, yaw: 0.5 }, 4);
    expect(track.at(4)).toMatchObject({ x: 3, y: 1, z: -60, yaw: 0.5 });
  });
});
