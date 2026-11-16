import { Rarity, cellFromRandom, resolveCast } from "@nephelimna/rules";
import { CHART } from "../chart.js";

const CELLS = CHART.cells * CHART.cells;
const NETTABLE = [Rarity.Common, Rarity.Uncommon];

export function createLake(random) {
  return { cells: Array.from({ length: CELLS }, () => cellFromRandom(Math.floor(random() * 0x10000))) };
}

export function cellIndexAt(x, z) {
  const size = (CHART.half * 2) / CHART.cells;
  const col = Math.floor((x + CHART.half) / size);
  const row = Math.floor((z + CHART.half) / size);
  if (col < 0 || row < 0 || col >= CHART.cells || row >= CHART.cells) return -1;
  return row * CHART.cells + col;
}

export function tryCast(lake, index, depth, bait) {
  if (index < 0) return { caught: false, rarity: Rarity.None, commit: () => lake };
  const result = resolveCast(lake.cells[index], depth, bait);
  const commit = () => ({ cells: lake.cells.map((cell, i) => (i === index ? result.cell : cell)) });
  return { caught: result.caught, rarity: result.rarity, commit };
}

export function haulNet(lake, index, limit = Infinity) {
  if (index < 0) return { lake, catches: [] };
  const catches = [];
  const cell = lake.cells[index].map((layer, depth) => {
    if (!NETTABLE.includes(layer.rarity) || layer.stock === 0) return layer;
    let taken = 0;
    while (taken < layer.stock && catches.length < limit) {
      catches.push({ rarity: layer.rarity, depth });
      taken++;
    }
    return { ...layer, stock: layer.stock - taken };
  });
  return { lake: { cells: lake.cells.map((c, i) => (i === index ? cell : c)) }, catches };
}

export function haulNetArea(lake, index, limit) {
  if (index < 0) return { lake, catches: [] };
  const col = index % CHART.cells;
  const row = Math.floor(index / CHART.cells);
  const order = [index];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = col + dc;
      const r = row + dr;
      if ((dr || dc) && c >= 0 && r >= 0 && c < CHART.cells && r < CHART.cells) order.push(r * CHART.cells + c);
    }
  }
  let current = lake;
  const catches = [];
  for (const cell of order) {
    if (catches.length >= limit) break;
    const haul = haulNet(current, cell, limit - catches.length);
    current = haul.lake;
    catches.push(...haul.catches);
  }
  return { lake: current, catches };
}

export function stockAt(lake, index) {
  if (index < 0) return 0;
  return lake.cells[index].reduce((sum, layer) => sum + layer.stock, 0);
}
