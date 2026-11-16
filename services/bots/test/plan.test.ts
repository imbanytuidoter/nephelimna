import { describe, expect, test } from "vitest";
import { Stage } from "@nephelimna/rules";
import { botCastTimes, nextStep, type RoundView } from "../src/table/plan.js";

const pace = { lobbyMs: 40_000, tideMs: 150_000, botSeats: 4 };
const idle = { firstJoinAt: null, tideStartedAt: null };
const view = (over: Partial<RoundView>): RoundView => ({ id: 2, stage: Stage.Lobby, seats: 0, generated: 64, tide: 0, lakeOpened: false, humans: 0, ...over });

describe("keeper plan", () => {
  test("opens a round when there is none or the last one is fully revealed", () => {
    expect(nextStep(null, idle, 0, pace).kind).toBe("open");
    expect(nextStep(view({ stage: Stage.Revealed, lakeOpened: true }), idle, 0, pace).kind).toBe("open");
  });

  test("fills the lake in bounded batches before anything else in the lobby", () => {
    expect(nextStep(view({ generated: 0, humans: 1, seats: 1 }), idle, 0, pace)).toEqual({ kind: "fill", count: 4 });
    expect(nextStep(view({ generated: 62 }), idle, 0, pace)).toEqual({ kind: "fill", count: 2 });
  });

  test("waits with a ready lake until a person joins, then seats bots and starts on the timer", () => {
    expect(nextStep(view({}), idle, 0, pace).kind).toBe("wait");
    expect(nextStep(view({ humans: 1, seats: 1 }), { ...idle, firstJoinAt: 0 }, 1000, pace)).toEqual({ kind: "seatBots", count: 4 });
    expect(nextStep(view({ humans: 1, seats: 5 }), { ...idle, firstJoinAt: 0 }, 39_000, pace).kind).toBe("wait");
    expect(nextStep(view({ humans: 1, seats: 5 }), { ...idle, firstJoinAt: 0 }, 40_000, pace).kind).toBe("start");
  });

  test("never seats more bots than the table has room for and starts a full table at once", () => {
    expect(nextStep(view({ humans: 8, seats: 8 }), { ...idle, firstJoinAt: 0 }, 0, pace)).toEqual({ kind: "seatBots", count: 2 });
    expect(nextStep(view({ humans: 10, seats: 10 }), { ...idle, firstJoinAt: 0 }, 0, pace).kind).toBe("start");
  });

  test("turns the tide only when its time is up, then walks through the reveal in order", () => {
    const fishing = view({ stage: Stage.Fishing, tide: 1, humans: 1, seats: 5 });
    expect(nextStep(fishing, { firstJoinAt: 0, tideStartedAt: 0 }, 149_000, pace).kind).toBe("wait");
    expect(nextStep(fishing, { firstJoinAt: 0, tideStartedAt: 0 }, 150_000, pace).kind).toBe("turnTide");
    expect(nextStep(fishing, idle, 0, pace).kind).toBe("turnTide");
    expect(nextStep(view({ stage: Stage.Finished }), idle, 0, pace).kind).toBe("requestScores");
    expect(nextStep(view({ stage: Stage.Revealing }), idle, 0, pace).kind).toBe("revealScores");
    expect(nextStep(view({ stage: Stage.Revealed }), idle, 0, pace).kind).toBe("openLake");
  });

  test("spreads bot casts inside the tide, in order", () => {
    const times = botCastTimes(1000, 150_000, 4, () => 0.5);
    expect(times).toHaveLength(4);
    expect(times[0]).toBeGreaterThan(1000);
    expect(times[3]).toBeLessThan(151_000);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
