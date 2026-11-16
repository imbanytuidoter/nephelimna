import * as THREE from "three";
import { Floaters } from "../src/ocean/scene/floaters.js";
import { createHelm, stepHelm } from "../src/game/drive.js";
import { hullMetrics, hullPoint } from "../src/game/hull.js";
import { createPlayerDescriptor } from "../src/game/player.js";

const FRAME = 1 / 60;
const { centerX } = hullMetrics();
const GUNWALE = [];
for (const u of [-0.5, -0.38, -0.25, -0.12, 0, 0.12, 0.25, 0.38, 0.46]) {
  for (const w of [-0.5, 0.5]) {
    const p = hullPoint(u, 0.5, w, new THREE.Vector3());
    p.x -= centerX;
    GUNWALE.push(p);
  }
}
GUNWALE.push(hullPoint(0.5, 0.5, 0, new THREE.Vector3()).setX(hullPoint(0.5, 0.5, 0, new THREE.Vector3()).x - centerX));
const rim = new THREE.Vector3();
const LATENCY_FRAMES = 2;

const TRAINS = [
  { amp: 0.6, length: 60, dir: 0.3 },
  { amp: 0.3, length: 22, dir: -0.5 },
  { amp: 0.1, length: 8, dir: 1.1 },
  { amp: 0.03, length: 3, dir: -1.4 },
];

export function seaHeight(x, z, t, scale = 1) {
  let h = 0;
  for (const w of TRAINS) {
    const k = (2 * Math.PI) / w.length;
    h += w.amp * Math.sin(k * (x * Math.cos(w.dir) + z * Math.sin(w.dir)) - Math.sqrt(9.81 * k) * t);
  }
  return h * scale;
}

export function launchOnSea(scale = 1) {
  const helm = createHelm();
  const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
  const body = floaters.addBody(createPlayerDescriptor(helm, () => {}), new THREE.Vector3(0, 0.2, 0), 0);
  const pending = [];
  let time = 0;
  const log = [];
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  let lastVy = 0;

  const frame = () => {
    const due = pending.length >= LATENCY_FRAMES ? pending.shift() : null;
    if (due) floaters.ingest({ resultTag: floaters.layout, resultTime: due.time, result: due.result, resultCount: due.count }, 0);
    stepHelm(helm, FRAME);
    floaters.step(FRAME);
    time += FRAME;
    const pts = floaters.collectPoints([]);
    const count = floaters.count;
    const result = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) result[i * 4] = seaHeight(pts[i * 2], pts[i * 2 + 1], time, scale);
    pending.push({ time, result, count });
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    side.set(0, 0, 1).applyQuaternion(body.quat);
    let awash = 0;
    for (const g of GUNWALE) {
      rim.copy(g).applyQuaternion(body.quat).add(body.pos);
      if (seaHeight(rim.x, rim.z, time, scale) > rim.y) awash = 1;
    }
    log.push({
      awash,
      pitch: Math.asin(fwd.y),
      roll: Math.asin(side.y),
      heave: (body.vel.y - lastVy) / FRAME,
      ride: body.pos.y - seaHeight(body.pos.x, body.pos.z, time, scale),
      sub: body.submerged,
      speed: body.vel.dot(fwd),
    });
    lastVy = body.vel.y;
  };

  return {
    body,
    run(seconds, throttle = 0, rudder = 0) {
      helm.wantThrottle = throttle;
      helm.wantRudder = rudder;
      const from = log.length;
      for (let t = 0; t < seconds; t += FRAME) frame();
      return summarize(log.slice(from));
    },
  };
}

function summarize(rows) {
  const rms = (key) => Math.sqrt(rows.reduce((a, r) => a + r[key] * r[key], 0) / rows.length);
  const max = (key) => rows.reduce((a, r) => Math.max(a, Math.abs(r[key])), 0);
  const deg = 180 / Math.PI;
  let pitchRate = 0;
  let rollRate = 0;
  for (let i = 1; i < rows.length; i++) {
    pitchRate += ((rows[i].pitch - rows[i - 1].pitch) / FRAME) ** 2;
    rollRate += ((rows[i].roll - rows[i - 1].roll) / FRAME) ** 2;
  }
  return {
    pitchRms: rms("pitch") * deg,
    pitchMax: max("pitch") * deg,
    rollRms: rms("roll") * deg,
    rollMax: max("roll") * deg,
    pitchRateRms: Math.sqrt(pitchRate / rows.length) * deg,
    rollRateRms: Math.sqrt(rollRate / rows.length) * deg,
    heaveRms: rms("heave"),
    heaveMax: max("heave"),
    rideMin: rows.reduce((a, r) => Math.min(a, r.ride), 9),
    rideMax: rows.reduce((a, r) => Math.max(a, r.ride), -9),
    awash: rows.filter((r) => r.awash).length / rows.length,
    airborne: rows.filter((r) => r.sub < 0.03).length / rows.length,
    speed: rows[rows.length - 1].speed,
  };
}
