import { CHART } from "../chart.js";

export function cellIndexAt(x, z) {
  const size = (CHART.half * 2) / CHART.cells;
  const col = Math.floor((x + CHART.half) / size);
  const row = Math.floor((z + CHART.half) / size);
  if (col < 0 || row < 0 || col >= CHART.cells || row >= CHART.cells) return -1;
  return row * CHART.cells + col;
}
