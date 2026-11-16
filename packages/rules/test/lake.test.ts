import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Depth, Rarity, layerStep, packCell, unpackCell, type Cell } from "../src/index.js";

const layer = fc.record({ rarity: fc.constantFrom(Rarity.None, Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.Mythic), stock: fc.integer({ min: 0, max: 3 }) });

describe("cell packing", () => {
  it("round-trips every valid cell", () => {
    fc.assert(fc.property(fc.tuple(layer, layer, layer), (cell) => {
        expect(unpackCell(packCell(cell as Cell))).toEqual(cell);
      }));
  });

  it("fits three layers in 15 bits", () => {
    const full: Cell = [{ rarity: Rarity.Mythic, stock: 3 }, { rarity: Rarity.Mythic, stock: 3 }, { rarity: Rarity.Mythic, stock: 3 }];
    expect(packCell(full)).toBeLessThan(1 << 15);
  });

  it("rejects stock above three", () => {
    expect(() => packCell([{ rarity: Rarity.Common, stock: 4 }, { rarity: Rarity.None, stock: 0 }, { rarity: Rarity.None, stock: 0 }])).toThrow(RangeError);
  });

  it("rejects rarity bits above mythic", () => {
    expect(() => unpackCell(0b11100)).toThrow(RangeError);
  });

  it("decrements one fish of the chosen layer with its step", () => {
    const cell: Cell = [{ rarity: Rarity.Common, stock: 2 }, { rarity: Rarity.Rare, stock: 1 }, { rarity: Rarity.Mythic, stock: 3 }];
    const after = unpackCell(packCell(cell) - layerStep(Depth.Bottom));
    expect(after[2]).toEqual({ rarity: Rarity.Mythic, stock: 2 });
    expect(after.slice(0, 2)).toEqual(cell.slice(0, 2));
  });
});
