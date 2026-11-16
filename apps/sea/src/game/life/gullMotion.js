export const GULL = {
  beat: 19,
  flapTime: 3.2,
  glideInner: 0.16,
  glideOuter: -0.3,
  flapInner: 0.55,
  flapOuter: 0.62,
  outerLag: 1.0,
  blendRate: 2.5,
};

export function createGull(random, anchors) {
  return {
    anchor: Math.floor(random() * anchors),
    radius: 16 + random() * 30,
    height: 6 + random() * 13,
    speed: 8.5 + random() * 2.5,
    phase: random() * Math.PI * 2,
    turn: random() < 0.5 ? -1 : 1,
    glide: 3 + random() * 5,
    offset: random() * 20,
    drift: 0.1 + random() * 0.12,
    flapping: 0,
  };
}

export function isFlapping(gull, time) {
  return (time + gull.offset) % (GULL.flapTime + gull.glide) < GULL.flapTime;
}

export function wingAngles(gull, time, dt, out) {
  const target = isFlapping(gull, time) ? 1 : 0;
  gull.flapping += (target - gull.flapping) * (1 - Math.exp(-GULL.blendRate * dt));
  const beat = (time + gull.offset) * GULL.beat;
  const f = gull.flapping;
  out.inner = GULL.glideInner * (1 - f) + (0.12 + GULL.flapInner * Math.sin(beat)) * f;
  out.outer = (GULL.glideOuter + 0.04 * Math.sin(time * 1.7 + gull.offset)) * (1 - f) + (-0.15 + GULL.flapOuter * Math.sin(beat - GULL.outerLag)) * f;
  return out;
}

export function gullPose(gull, anchor, time, out) {
  const reach = gull.radius * (1 + 0.3 * Math.sin(time * gull.drift + gull.offset));
  const angle = gull.phase + (gull.turn * gull.speed * time) / gull.radius;
  const climb = Math.cos(time * 0.33 + gull.offset) * 0.33 * 2.2;
  out.x = anchor.x + Math.cos(angle) * reach;
  out.z = anchor.z + Math.sin(angle) * reach;
  out.y = gull.height + Math.sin(time * 0.33 + gull.offset) * 2.2;
  out.yaw = Math.atan2(-Math.cos(angle) * gull.turn, -Math.sin(angle) * gull.turn);
  out.pitch = Math.atan2(climb, gull.speed);
  out.roll = -gull.turn * Math.min(0.5, (gull.speed * gull.speed) / (9.81 * reach));
  return out;
}
