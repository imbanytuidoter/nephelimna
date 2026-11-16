import { SEA } from "./tuning.js";

export function waveScaleAt(distance) {
  const t = Math.min(1, Math.max(0, (distance - SEA.nearDistance) / (SEA.farDistance - SEA.nearDistance)));
  const step = Math.round(t * SEA.steps) / SEA.steps;
  return SEA.near + (SEA.far - SEA.near) * step;
}
