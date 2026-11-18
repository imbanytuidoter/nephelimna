import { describe, expect, it } from "vitest";
import { type BoardState, applyEvents, emptyBoard, fillCount, rankBoard } from "../src/table/board.js";

const A = "0x00000000000000000000000000000000000000aa" as const;
const B = "0x00000000000000000000000000000000000000bb" as const;
const C = "0x00000000000000000000000000000000000000cc" as const;

describe("filling the sea", () => {
  it("asks for full batches until the last few squares, then stops", () => {
    expect(fillCount(0)).toBe(4);
    expect(fillCount(62)).toBe(2);
    expect(fillCount(64)).toBe(0);
  });
});

describe("leaderboard", () => {
  it("counts anglers and casts, waits for a requested post, and lists the confirmed total under the chosen name", () => {
    let state: BoardState = emptyBoard();
    state = applyEvents(state, [
      { kind: "joined", player: A, block: 10, tx: "0x1" },
      { kind: "joined", player: B, block: 10, tx: "0x2" },
      { kind: "cast", player: A, block: 11, tx: "0x3" },
      { kind: "cast", player: A, block: 12, tx: "0x4" },
      { kind: "requested", player: A, name: "  Old   Salt ", block: 13, tx: "0x5" },
    ]);
    expect(state.anglers).toBe(2);
    expect(state.casts).toBe(2);
    expect(state.pending).toEqual([A]);
    expect(rankBoard(state)).toEqual([]);
    state = applyEvents(state, [{ kind: "posted", player: A, score: 12, block: 14, tx: "0x6" }]);
    expect(state.pending).toEqual([]);
    expect(rankBoard(state)).toEqual([{ rank: 1, player: A, name: "Old Salt", score: 12, block: 14, tx: "0x6" }]);
    expect(rankBoard(state, 50, (player) => player === A)).toEqual([]);
  });

  it("keeps each player's latest post, ranks by score then by who posted first, and drops names that would not show cleanly", () => {
    const state = applyEvents(emptyBoard(), [
      { kind: "requested", player: A, name: "<b>x</b>", block: 1, tx: "0x1" },
      { kind: "posted", player: A, score: 30, block: 2, tx: "0x2" },
      { kind: "requested", player: B, name: "Mara", block: 3, tx: "0x3" },
      { kind: "posted", player: B, score: 30, block: 4, tx: "0x4" },
      { kind: "requested", player: C, name: "Wren", block: 5, tx: "0x5" },
      { kind: "posted", player: C, score: 8, block: 6, tx: "0x6" },
      { kind: "requested", player: C, name: "Wren", block: 7, tx: "0x7" },
      { kind: "posted", player: C, score: 41, block: 8, tx: "0x8" },
    ]);
    expect(rankBoard(state).map((row) => [row.rank, row.player, row.name, row.score])).toEqual([
      [1, C, "Wren", 41],
      [2, A, null, 30],
      [3, B, "Mara", 30],
    ]);
  });

  it("does not count the same event twice when a block range is read again", () => {
    const events = [
      { kind: "cast", player: A, block: 11, tx: "0x3", index: 0 },
      { kind: "cast", player: A, block: 11, tx: "0x3", index: 0 },
    ] as const;
    expect(applyEvents(emptyBoard(), [...events]).casts).toBe(1);
  });
});
