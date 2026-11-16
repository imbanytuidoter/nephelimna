export const DOLPHIN = {
  count: 2,
  cruiseDepth: -1.1,
  jumpHeight: 2.9,
  jumpTime: 1.5,
  breathHeight: 1.75,
  breathTime: 1.1,
  jumpEvery: 3,
  speed: 6.5,
  minRadius: 7,
  maxRadius: 13,
  minPeriod: 4.5,
  maxPeriod: 8,
  podSpeed: 10,
  podDistance: 22,
  minDepth: -2.5,
  swimBeat: 10,
  swimSway: 0.13,
  airSway: 0.03,
};

export function createDolphin(random) {
  return {
    radius: DOLPHIN.minRadius + random() * (DOLPHIN.maxRadius - DOLPHIN.minRadius),
    period: DOLPHIN.minPeriod + random() * (DOLPHIN.maxPeriod - DOLPHIN.minPeriod),
    phase: random() * Math.PI * 2,
    offset: random() * 10,
    turn: random() < 0.5 ? -1 : 1,
    order: Math.floor(random() * DOLPHIN.jumpEvery),
  };
}

export function dolphinPose(dolphin, pod, time, out) {
  const angle = dolphin.phase + (dolphin.turn * DOLPHIN.speed * time) / dolphin.radius;
  const clock = time + dolphin.offset;
  const cycle = clock % dolphin.period;
  const leap = (Math.floor(clock / dolphin.period) + dolphin.order) % DOLPHIN.jumpEvery === 0;
  const height = leap ? DOLPHIN.jumpHeight : DOLPHIN.breathHeight;
  const span = leap ? DOLPHIN.jumpTime : DOLPHIN.breathTime;
  const airborne = cycle < span;
  const s = airborne ? cycle / span : 0;
  const launch = (height * 4) / span;
  const rise = airborne ? launch * (1 - 2 * s) : 0;
  out.x = pod.x + Math.cos(angle) * dolphin.radius;
  out.z = pod.z + Math.sin(angle) * dolphin.radius;
  out.y = DOLPHIN.cruiseDepth + (airborne ? height * 4 * s * (1 - s) : 0);
  out.yaw = Math.atan2(-Math.cos(angle) * dolphin.turn, -Math.sin(angle) * dolphin.turn);
  out.pitch = Math.atan2(rise, DOLPHIN.speed);
  out.airborne = airborne;
  out.leap = airborne && leap;
  out.bend = airborne ? (-2 * Math.atan2(launch, DOLPHIN.speed)) / (DOLPHIN.speed * span) : 0;
  out.sway = airborne ? DOLPHIN.airSway : DOLPHIN.swimSway;
  out.beat = clock * DOLPHIN.swimBeat;
  return out;
}

export function stepPod(pod, boat, heading, dt, depthAt) {
  const tx = boat.x + Math.cos(heading) * DOLPHIN.podDistance * 0.6 - Math.sin(heading) * DOLPHIN.podDistance;
  const tz = boat.z + Math.sin(heading) * DOLPHIN.podDistance * 0.6 + Math.cos(heading) * DOLPHIN.podDistance;
  const dx = tx - pod.x;
  const dz = tz - pod.z;
  const gap = Math.hypot(dx, dz);
  if (gap < 1e-3) return;
  const step = Math.min(gap, DOLPHIN.podSpeed * dt);
  const nx = pod.x + (dx / gap) * step;
  const nz = pod.z + (dz / gap) * step;
  if (depthAt(nx, nz) > DOLPHIN.minDepth) return;
  pod.x = nx;
  pod.z = nz;
}

export const VISIT = { firstIn: [30, 50], every: [180, 300], retry: [10, 20], stay: 45, leave: 14, spawnDistance: 45 };

const between = (random, [low, high]) => low + random() * (high - low);

export function createVisit(random) {
  return { phase: "away", timer: between(random, VISIT.firstIn) };
}

export function stepVisit(visit, dt, random) {
  const timer = visit.timer - dt;
  if (timer > 0) return { visit: { ...visit, timer }, event: null };
  if (visit.phase === "away") return { visit: { phase: "near", timer: VISIT.stay }, event: "arrive" };
  if (visit.phase === "near") return { visit: { phase: "leaving", timer: VISIT.leave }, event: "leave" };
  return { visit: { phase: "away", timer: between(random, VISIT.every) }, event: "gone" };
}

export function skipVisit(random) {
  return { phase: "away", timer: between(random, VISIT.retry) };
}

export function stepAway(pod, boat, dt, depthAt) {
  const dx = pod.x - boat.x;
  const dz = pod.z - boat.z;
  const gap = Math.hypot(dx, dz) || 1;
  const nx = pod.x + (dx / gap) * DOLPHIN.podSpeed * dt;
  const nz = pod.z + (dz / gap) * DOLPHIN.podSpeed * dt;
  if (depthAt(nx, nz) > DOLPHIN.minDepth) return;
  pod.x = nx;
  pod.z = nz;
}
