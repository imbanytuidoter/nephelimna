import { describe, expect, it } from "vitest";
import { parseSession, serializeSession } from "../src/game/session.js";

const sizes = { depths: 3, baits: 3 };
const snap = { x: 100, z: -200, heading: 1.5, depth: 2, bait: 1, net: { phase: "out", x: 90, z: -190, time: 20 } };

describe("session", () => {
  it("restores position, gear and a net that kept filling while away", () => {
    const saved = serializeSession(snap, 1_000_000);
    const back = parseSession(saved, 1_000_000 + 30_000, sizes);
    expect(back).toMatchObject({ x: 100, z: -200, heading: 1.5, depth: 2, bait: 1 });
    expect(back.net).toEqual({ phase: "out", x: 90, z: -190, time: 50 });
  });

  it("has no net when none was out", () => {
    const saved = serializeSession({ ...snap, net: { phase: "stowed", time: 0, x: 0, z: 0 } }, 0);
    expect(parseSession(saved, 10, sizes).net).toBeNull();
  });

  it("caps the time spent away", () => {
    const saved = serializeSession(snap, 0);
    expect(parseSession(saved, 1e12, sizes).net.time).toBe(20 + 6 * 3600);
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
