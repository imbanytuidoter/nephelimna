import { describe, expect, test } from "vitest";
import { Stage } from "@nephelimna/rules";
import { castsLeftNow, describeRound, mySeat, rankFinal } from "../src/game/round/status.js";

const ME = "0xAbC0000000000000000000000000000000000001";
const BOT = "0x00000000000000000000000000000000000000b2";
const snapshot = (round, seats = []) => ({ now: 1000, receivedAt: 5000, round: { id: 3, seats: seats.length, generated: 64, tide: 0, lobbyEndsAt: null, tideEndsAt: null, ...round }, seats, final: null });
const local = { joining: null, distance: 10, castsLeft: 4, points: 9 };
const seat = (player, over = {}) => ({ seat: 0, player, name: null, bot: false, castsLeft: 6, netsSet: false, finalScore: 0, ...over });

describe("round status", () => {
  test("offers to join only in an open lobby with a stocked lake and near the harbour", () => {
    expect(describeRound(snapshot({ stage: Stage.Lobby, generated: 20 }), ME, local, 5000).canJoin).toBe(false);
    expect(describeRound(snapshot({ stage: Stage.Lobby }), ME, local, 5000).canJoin).toBe(true);
    expect(describeRound(snapshot({ stage: Stage.Lobby }), ME, { ...local, distance: 900 }, 5000).canJoin).toBe(false);
    expect(describeRound(snapshot({ stage: Stage.Fishing, tide: 1 }), ME, local, 5000).canJoin).toBe(false);
    expect(describeRound(null, ME, local, 0).phase).toBe("offline");
  });

  test("counts down on the server clock, whatever the local clock says", () => {
    const seated = snapshot({ stage: Stage.Lobby, lobbyEndsAt: 31_000 }, [seat(ME)]);
    expect(describeRound(seated, ME, local, 5000).line).toBe("Starts in 0:30");
    expect(describeRound(seated, ME, local, 15_000).line).toBe("Starts in 0:20");
    const fishing = snapshot({ stage: Stage.Fishing, tide: 2, tideEndsAt: 91_000 }, [seat(ME)]);
    expect(describeRound(fishing, ME, local, 5000).line).toBe("Tide 2 of 3 · 1:30");
    expect(describeRound(fishing, ME, local, 5000).detail).toContain("Casts 4 of 6");
  });

  test("finds the player by address regardless of letter case", () => {
    const s = snapshot({ stage: Stage.Fishing, tide: 1 }, [seat(BOT, { bot: true, name: "Mara" }), seat(ME.toLowerCase(), { seat: 1 })]);
    expect(mySeat(s, ME).seat).toBe(1);
    expect(mySeat(s, null)).toBe(null);
    expect(describeRound(snapshot({ stage: Stage.Fishing, tide: 1 }, [seat(BOT)]), ME, local, 5000).phase).toBe("watching");
  });

  test("never shows more casts than the contract or the local count allows", () => {
    expect(castsLeftNow(seat(ME, { castsLeft: 6 }), 2)).toBe(4);
    expect(castsLeftNow(seat(ME, { castsLeft: 3 }), 1)).toBe(3);
    expect(castsLeftNow(seat(ME, { castsLeft: 6 }), 9)).toBe(0);
    expect(castsLeftNow(null, 0)).toBe(0);
  });

  test("ranks the final table by score and marks the player", () => {
    const rows = rankFinal({ scores: [3, 25, 3], names: ["Mara", null, null], players: [BOT, ME, "0x1234000000000000000000000000000000000000"] }, ME);
    expect(rows.map((row) => row.name)).toEqual(["You", "Mara", "Angler 1234"]);
    expect(rows[0]).toMatchObject({ rank: 1, score: 25, mine: true });
  });
});

import { packCell } from "@nephelimna/rules";
import { checkRound, lakeRows } from "../src/game/round/verify.js";

describe("round verification", () => {
  const cell = packCell([{ rarity: 1, stock: 2 }, { rarity: 3, stock: 1 }, { rarity: 0, stock: 0 }]);
  const lake = Array.from({ length: 64 }, () => cell);
  const final = { round: 2, scores: [8, 3], players: [ME, BOT], names: [null, "Mara"], lake, leviathan: 48, fromBlock: 1, toBlock: 9 };
  const chain = { scores: [8, 3], players: [ME.toLowerCase(), BOT], casts: [{ seat: 0, cell: 1, tide: 1 }, { seat: 1, cell: 2, tide: 1 }], lake: [...lake], leviathan: 48 };

  test("passes when chain data agrees with the table the server showed", () => {
    expect(checkRound(final, chain).every((check) => check.ok)).toBe(true);
  });

  test("flags a score, a lake square or a cast count that does not match", () => {
    const failing = (over) => checkRound(final, { ...chain, ...over }).filter((check) => !check.ok).map((check) => check.label);
    expect(failing({ scores: [9, 3] })).toEqual(["Scores match the contract"]);
    expect(failing({ lake: [0, ...lake.slice(1)] })).toEqual(["The opened lake matches a fresh decryption"]);
    expect(failing({ casts: Array.from({ length: 19 }, () => ({ seat: 0, cell: 0, tide: 1 })) })).toEqual(["No boat cast more than the rules allow"]);
    expect(checkRound({ ...final, scores: [200, 3] }, { ...chain, scores: [200, 3] }).filter((check) => !check.ok).map((check) => check.label)).toEqual(["Total score fits the number of casts"]);
  });

  test("reads the three depths of a revealed square", () => {
    expect(lakeRows(cell)).toEqual([{ rarity: 1, stock: 2 }, { rarity: 3, stock: 1 }, { rarity: 0, stock: 0 }]);
  });
});
