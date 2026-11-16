export const LAKE_SIZE = 8;
export const CELL_COUNT = LAKE_SIZE * LAKE_SIZE;
export const LAYER_BITS = 5;
export const RARITY_BITS = 3;
export const STOCK_BITS = 2;
export const MAX_STOCK = (1 << STOCK_BITS) - 1;

export const Depth = { Surface: 0, Middle: 1, Bottom: 2 } as const;
export type Depth = (typeof Depth)[keyof typeof Depth];
export const DEPTHS: readonly Depth[] = [Depth.Surface, Depth.Middle, Depth.Bottom];

export const Rarity = { None: 0, Common: 1, Uncommon: 2, Rare: 3, Mythic: 4 } as const;
export type Rarity = (typeof Rarity)[keyof typeof Rarity];

export interface Layer {
  readonly rarity: Rarity;
  readonly stock: number;
}

export type Cell = readonly [Layer, Layer, Layer];

function packLayer(layer: Layer): number {
  if (layer.stock < 0 || layer.stock > MAX_STOCK || !Number.isInteger(layer.stock)) throw new RangeError(`stock out of range: ${layer.stock}`);
  return (layer.rarity << STOCK_BITS) | layer.stock;
}

function unpackLayer(bits: number): Layer {
  const rarity = bits >> STOCK_BITS;
  if (rarity > Rarity.Mythic) throw new RangeError(`rarity out of range: ${rarity}`);
  return { rarity: rarity as Rarity, stock: bits & MAX_STOCK };
}

export function packCell(cell: Cell): number {
  return cell.reduce((acc, layer, depth) => acc | (packLayer(layer) << (depth * LAYER_BITS)), 0);
}

export function unpackCell(packed: number): Cell {
  const mask = (1 << LAYER_BITS) - 1;
  const layers = DEPTHS.map((depth) => unpackLayer((packed >> (depth * LAYER_BITS)) & mask));
  return [layers[0]!, layers[1]!, layers[2]!];
}

export function layerStep(depth: Depth): number {
  return 1 << (depth * LAYER_BITS);
}
