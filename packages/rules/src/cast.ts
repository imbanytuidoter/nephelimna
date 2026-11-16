import { POINTS, bites, type Bait } from "./bait.js";
import { Rarity, type Cell, type Depth } from "./lake.js";

export interface CastResult {
  readonly caught: boolean;
  readonly rarity: Rarity;
  readonly points: number;
  readonly cell: Cell;
}

export function resolveCast(cell: Cell, depth: Depth, bait: Bait): CastResult {
  const layer = cell[depth];
  const caught = layer.stock > 0 && bites(bait, layer.rarity);
  if (!caught) return { caught, rarity: Rarity.None, points: 0, cell };
  const next = cell.map((l, d) => (d === depth ? { ...l, stock: l.stock - 1 } : l));
  return { caught, rarity: layer.rarity, points: POINTS[layer.rarity], cell: [next[0]!, next[1]!, next[2]!] };
}
