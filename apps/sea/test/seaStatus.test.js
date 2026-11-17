import { describe, expect, test } from "vitest";
import { describeSea, markBoard } from "../src/game/sea/status.js";

const ME = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0x00000000000000000000000000000000000000b2";
const snap = (over = {}) => ({ ready: true, generated: 64, anglers: 7, casts: 40, board: [], posting: [], ...over });
const local = (over = {}) => ({ joining: null, joined: false, total: null, posting: false, failure: null, ...over });

describe("sea status", () => {
  test("says when the server is out of reach and while the sea is still being sealed", () => {
    expect(describeSea(null, local()).phase).toBe("offline");
    const filling = describeSea(snap({ ready: false, generated: 24 }), local());
    expect(filling.phase).toBe("filling");
    expect(filling.detail).toBe("24 of 64 squares encrypted on chain");
  });

  test("tells a new player where to cast and that the first cast puts the boat on chain", () => {
    const view = describeSea(snap(), local());
    expect(view.phase).toBe("open");
    expect(view.line).toBe("Nephelimna · 7 anglers");
    expect(view.detail).toContain("Cast inside the chart squares");
    expect(view.canPost).toBe(false);
  });

  test("shows what is happening while joining, then the player's own total and when it can be posted", () => {
    expect(describeSea(snap(), local({ joining: "Getting test ETH" })).line).toBe("Getting test ETH");
    const fresh = describeSea(snap(), local({ joined: true, total: 0 }));
    expect(fresh.line).toBe("Your total: 0 pts");
    expect(fresh.canPost).toBe(false);
    const fishing = describeSea(snap(), local({ joined: true, total: 23 }));
    expect(fishing.line).toBe("Your total: 23 pts");
    expect(fishing.detail).toBe("Only you can see it until you post it");
    expect(fishing.canPost).toBe(true);
    const unknown = describeSea(snap(), local({ joined: true, total: null }));
    expect(unknown.line).toBe("Your total: reading");
    const posting = describeSea(snap(), local({ joined: true, total: 23, posting: true }));
    expect(posting.canPost).toBe(false);
    expect(posting.detail).toBe("Posting your score with a proof");
  });

  test("shows a failure in place of the hint until the next success", () => {
    expect(describeSea(snap(), local({ failure: "The faucet is busy." })).detail).toBe("The faucet is busy.");
  });

  test("marks the player's own row on the board regardless of letter case", () => {
    const rows = markBoard([{ rank: 1, player: OTHER, name: "Mara", score: 40 }, { rank: 2, player: ME.toLowerCase(), name: null, score: 12 }], ME);
    expect(rows.map((row) => [row.name, row.mine])).toEqual([["Mara", false], ["Angler abc0", true]]);
  });
});
