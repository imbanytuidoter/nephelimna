import { HULL } from "./tuning.js";

export const DECK = {
  floor: 0.26,
  eye: 1.62,
  speed: 1.7,
  radius: 0.27,
  aft: -2.72,
  fore: -0.8,
  wall: 0.88,
  wallGap: 0.06,
  sway: 0.45,
  near: 0.22,
  fov: 62,
  anchorSpeed: 1.6,
  railReach: 0.35,
  start: { x: -1.9, z: 0.25, yaw: Math.PI * 0.62 },
  blocks: [
    { x: -1.35, z: -0.52, r: 0.52 },
    { x: -0.8, z: 0.62, r: 0.44 },
  ],
};

function plan(t) {
  return t < 0.45 ? 0.7 + 0.3 * Math.sin((t / 0.45) * Math.PI * 0.5) : Math.max(0.03, 1 - ((t - 0.45) / 0.55) ** 2.1);
}

export function deckHalfWidth(x) {
  return DECK.wall * HULL.halfBeam * plan(x / HULL.length + 0.5) - DECK.wallGap - DECK.radius;
}

export function createWalker() {
  return { x: DECK.start.x, z: DECK.start.z, yaw: DECK.start.yaw, pitch: -0.05 };
}

export function stepWalker(walker, move, dt) {
  const fx = Math.cos(walker.yaw);
  const fz = Math.sin(walker.yaw);
  const length = Math.hypot(move.forward, move.strafe);
  const scale = length > 1 ? 1 / length : 1;
  let x = walker.x + (fx * move.forward - fz * move.strafe) * scale * DECK.speed * dt;
  let z = walker.z + (fz * move.forward + fx * move.strafe) * scale * DECK.speed * dt;
  for (const block of DECK.blocks) {
    const dx = x - block.x;
    const dz = z - block.z;
    const gap = Math.hypot(dx, dz);
    const reach = block.r + DECK.radius;
    if (gap < reach && gap > 1e-6) {
      x = block.x + (dx / gap) * reach;
      z = block.z + (dz / gap) * reach;
    }
  }
  x = Math.min(DECK.fore - DECK.radius, Math.max(DECK.aft + DECK.radius, x));
  const half = deckHalfWidth(x);
  z = Math.min(half, Math.max(-half, z));
  return { ...walker, x, z };
}

export function turnWalker(walker, turn, tilt) {
  return { ...walker, yaw: walker.yaw + turn, pitch: Math.min(1.1, Math.max(-1.2, walker.pitch + tilt)) };
}
