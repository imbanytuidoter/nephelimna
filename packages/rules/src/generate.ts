import { DEPTHS, Rarity, type Cell, type Depth, type Layer } from "./lake.js";

export const RANDOM_BITS_PER_LAYER = 4;

export const RARITY_THRESHOLDS: Readonly<Record<Depth, readonly [number, number, number, number]>> = {
  0: [6, 11, 14, 16],
  1: [5, 9, 13, 15],
  2: [4, 7, 11, 14],
};

export function stockFor(rarity: Rarity): number {
  if (rarity === Rarity.None) return 0;
  return rarity >= Rarity.Rare ? 1 : 2;
}

function rarityFor(depth: Depth, u: number): Rarity {
  return RARITY_THRESHOLDS[depth].filter((t) => u >= t).length as Rarity;
}

export function cellFromRandom(random16: number): Cell {
  if (!Number.isInteger(random16) || random16 < 0 || random16 > 0xffff) throw new RangeError(`random16 out of range: ${random16}`);
  const mask = (1 << RANDOM_BITS_PER_LAYER) - 1;
  const layers = DEPTHS.map((depth): Layer => {
    const rarity = rarityFor(depth, (random16 >> (depth * RANDOM_BITS_PER_LAYER)) & mask);
    return { rarity, stock: stockFor(rarity) };
  });
  return [layers[0]!, layers[1]!, layers[2]!];
}

export function isHot(cell: Cell): boolean {
  return cell.some((layer) => layer.rarity >= Rarity.Rare && layer.stock > 0);
}
