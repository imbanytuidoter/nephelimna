import { describe, expect, it } from "vitest";
import { Bait, POINTS, Rarity, bites } from "../src/index.js";

describe("bait", () => {
  it.each([
    [Bait.Worm, [Rarity.Common, Rarity.Uncommon]],
    [Bait.Spoon, [Rarity.Uncommon, Rarity.Rare, Rarity.Mythic]],
    [Bait.LiveFish, [Rarity.Mythic]],
  ])("bait %i bites only its rarities", (bait, expected) => {
    const all = [Rarity.None, Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.Mythic];
    expect(all.filter((r) => bites(bait, r))).toEqual(expected);
  });

  it("scores rarities 0, 1, 3, 8, 25", () => {
    expect([Rarity.None, Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.Mythic].map((r) => POINTS[r])).toEqual([0, 1, 3, 8, 25]);
  });
});
