import * as THREE from "three";
import { FREEBOARD } from "./tuning.js";

const beam = new THREE.Vector3();
const fwd = new THREE.Vector3();

export function createFreeboardGuard(bowProbes) {
  return (body, force, torque) => {
    const last = body.probes.length - 1;
    let port = 0;
    let starboard = 0;
    let bow = 0;
    let stern = 0;
    for (let i = 0; i <= last; i++) {
      const water = body.probeWater[i];
      if (Number.isNaN(water)) continue;
      const short = water + (i === last ? FREEBOARD.aheadMargin : FREEBOARD.margin) - body.probeWorld[i].y;
      if (short <= 0) continue;
      if (i >= bowProbes) bow = Math.max(bow, short);
      else if (i < 2) stern = Math.max(stern, short);
      if (i < last - 1) {
        if (i % 2) starboard = Math.max(starboard, short);
        else port = Math.max(port, short);
      }
    }
    const worst = Math.max(port, starboard, bow, stern);
    if (worst <= 0) return;
    const shared = Math.max(Math.min(port, starboard), Math.min(bow, stern)) + FREEBOARD.share * worst;
    const w = FREEBOARD.spring;
    force.y += body.mass * (w * w * shared + 2 * w * Math.max(0, -body.vel.y) * Math.min(1, shared * 4));
    const t = FREEBOARD.tiltSpring;
    beam.set(0, 0, 1).applyQuaternion(body.quat);
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    torque.addScaledVector(beam, (1 / body.invInertia.z) * t * t * (bow - stern));
    torque.addScaledVector(fwd, (-1 / body.invInertia.x) * t * t * (starboard - port));
  };
}
