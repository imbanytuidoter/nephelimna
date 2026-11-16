import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Bait, Depth, Rarity, cellFromRandom, isHot, mulberry32, packCell, resolveCast, stockFor, unpackCell, type Cell } from "../src/index.js";

describe("cellFromRandom", () => {
  it("maps all-zero bits to an empty cell", () => {
    expect(cellFromRandom(0)).toEqual([{ rarity: Rarity.None, stock: 0 }, { rarity: Rarity.None, stock: 0 }, { rarity: Rarity.None, stock: 0 }]);
  });

  it("uses four bits per depth and the depth thresholds", () => {
    const r = 15 | (8 << 4) | (14 << 8);
    expect(cellFromRandom(r).map((l) => l.rarity)).toEqual([Rarity.Rare, Rarity.Common, Rarity.Mythic]);
  });

  it("only gives Mythic at the surface with no random value", () => {
    const surface = Array.from({ length: 16 }, (_, u) => cellFromRandom(u)[0].rarity);
    expect(surface).not.toContain(Rarity.Mythic);
  });

  it("always yields stock that matches the rarity and packs into 15 bits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff }), (r) => {
        const cell = cellFromRandom(r);
        for (const layer of cell) expect(layer.stock).toBe(stockFor(layer.rarity));
        expect(unpackCell(packCell(cell))).toEqual(cell);
      }),
    );
  });

  it("rejects values outside 16 bits", () => {
    expect(() => cellFromRandom(0x10000)).toThrow(RangeError);
    expect(() => cellFromRandom(-1)).toThrow(RangeError);
  });

  it("marks a cell hot only for live Rare or Mythic", () => {
    expect(isHot([{ rarity: Rarity.Rare, stock: 1 }, { rarity: Rarity.None, stock: 0 }, { rarity: Rarity.None, stock: 0 }])).toBe(true);
    expect(isHot([{ rarity: Rarity.Rare, stock: 0 }, { rarity: Rarity.Uncommon, stock: 2 }, { rarity: Rarity.None, stock: 0 }])).toBe(false);
  });
});

describe("resolveCast", () => {
  const cell: Cell = [{ rarity: Rarity.Common, stock: 2 }, { rarity: Rarity.Rare, stock: 1 }, { rarity: Rarity.Mythic, stock: 1 }];

  it("catches with matching bait and scores that layer's rarity", () => {
    expect(resolveCast(cell, Depth.Middle, Bait.Spoon)).toEqual({ caught: true, rarity: Rarity.Rare, points: 8 });
  });

  it("catches nothing on a wrong bait", () => {
    expect(resolveCast(cell, Depth.Middle, Bait.Worm)).toEqual({ caught: false, rarity: Rarity.None, points: 0 });
  });

  it("finds nothing in an empty layer", () => {
    const empty: Cell = [cell[0], cell[1], { rarity: Rarity.Mythic, stock: 0 }];
    expect(resolveCast(empty, Depth.Bottom, Bait.LiveFish).caught).toBe(false);
  });
});

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
