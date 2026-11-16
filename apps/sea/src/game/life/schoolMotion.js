export const SCHOOL = { flee: 15, fleeDistance: 13, fleeRate: 1.6, swimDepth: -0.7, minSeabed: -2.3, spread: 2.6 };

export function createSchool(random, x, z, size) {
  return {
    x,
    z,
    fleeX: 0,
    fleeZ: 0,
    wander: 5 + random() * 7,
    rate: 0.12 + random() * 0.1,
    phase: random() * 10,
    fish: Array.from({ length: size }, () => ({
      radius: 0.4 + random() * SCHOOL.spread,
      rate: (0.5 + random() * 0.7) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      depth: random() * 0.7,
      squash: 0.5 + random() * 0.5,
    })),
  };
}

export function schoolCenter(school, time, out) {
  const a = school.phase + time * school.rate;
  out.x = school.x + Math.cos(a) * school.wander + school.fleeX;
  out.z = school.z + Math.sin(a * 1.31) * school.wander * 0.7 + school.fleeZ;
  return out;
}

export function stepFlee(school, center, boat, dt) {
  const dx = center.x - boat.x;
  const dz = center.z - boat.z;
  const gap = Math.hypot(dx, dz);
  const scared = gap < SCHOOL.flee && gap > 1e-3;
  const wantX = scared ? school.fleeX + (dx / gap) * SCHOOL.fleeDistance : 0;
  const wantZ = scared ? school.fleeZ + (dz / gap) * SCHOOL.fleeDistance : 0;
  const k = 1 - Math.exp(-(scared ? SCHOOL.fleeRate : SCHOOL.fleeRate * 0.15) * dt);
  school.fleeX += (wantX - school.fleeX) * k;
  school.fleeZ += (wantZ - school.fleeZ) * k;
}

export function fishOffset(fish, time, out) {
  const a = fish.phase + time * fish.rate;
  out.x = Math.cos(a) * fish.radius;
  out.z = Math.sin(a) * fish.radius * fish.squash;
  out.y = SCHOOL.swimDepth - fish.depth;
  out.yaw = Math.atan2(-Math.cos(a) * fish.squash * Math.sign(fish.rate), -Math.sin(a) * Math.sign(fish.rate));
  return out;
}

export const FOLLOW = { distance: 22, rate: 0.35, slow: 2.5 };

export function stepFollow(school, boat, speed, side, dt, depthAt) {
  if (Math.abs(speed) > FOLLOW.slow) return;
  const tx = boat.x + Math.cos(side) * FOLLOW.distance;
  const tz = boat.z + Math.sin(side) * FOLLOW.distance;
  if (depthAt(tx, tz) > SCHOOL.minSeabed) return;
  const k = 1 - Math.exp(-FOLLOW.rate * dt);
  school.x += (tx - school.x) * k;
  school.z += (tz - school.z) * k;
}
