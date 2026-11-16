import { describe, expect, it } from "vitest";
import { parseSession, serializeSession } from "../src/game/session.js";

const sizes = { depths: 3, baits: 3 };
const snap = { x: 100, z: -200, heading: 1.5, depth: 2, bait: 1 };

describe("session", () => {
  it("restores position and gear, and still reads a save from before nets went on chain", () => {
    const saved = serializeSession(snap, 1_000_000);
    expect(parseSession(saved, 1_000_000 + 30_000, sizes)).toEqual({ x: 100, z: -200, heading: 1.5, depth: 2, bait: 1 });
    const old = JSON.stringify({ ...JSON.parse(saved), net: { x: 90, z: -190, time: 20 } });
    expect(parseSession(old, 1_000_000, sizes)).toEqual({ x: 100, z: -200, heading: 1.5, depth: 2, bait: 1 });
  });

  it("rejects garbage and positions outside the chart", () => {
    expect(parseSession("{", 0, sizes)).toBeNull();
    expect(parseSession(null, 0, sizes)).toBeNull();
    expect(parseSession(serializeSession({ ...snap, x: 5000 }, 0), 0, sizes)).toBeNull();
    expect(parseSession(serializeSession({ ...snap, x: Number.NaN }, 0), 0, sizes)).toBeNull();
  });

  it("falls back to the first depth and bait when indexes are invalid", () => {
    const saved = serializeSession({ ...snap, depth: 9, bait: -1 }, 0);
    expect(parseSession(saved, 0, sizes)).toMatchObject({ depth: 0, bait: 0 });
  });
});
