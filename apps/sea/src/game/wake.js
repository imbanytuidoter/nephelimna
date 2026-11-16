import * as THREE from "three";
import { HULL, WAKE } from "./tuning.js";

const stern = new THREE.Vector3();
const fwd = new THREE.Vector3();

export function createWake(slots) {
  const count = slots.length;
  const trail = [];
  const last = new THREE.Vector3(Infinity, 0, Infinity);

  return {
    update(body, time) {
      fwd.set(1, 0, 0).applyQuaternion(body.quat);
      const speed = Math.abs(body.vel.dot(fwd));
      stern.copy(body.pos).addScaledVector(fwd, -HULL.length * 0.46);
      const moved = Math.hypot(stern.x - last.x, stern.z - last.z);
      if (speed > WAKE.minSpeed && body.wet && moved > WAKE.spacing) {
        const width = HULL.halfBeam * (0.55 + 0.6 * Math.min(1, speed / 9));
        trail.unshift({ x: stern.x, z: stern.z, born: time, width });
        if (trail.length > count - 1) trail.length = count - 1;
        last.copy(stern);
      }
      while (trail.length && time - trail[trail.length - 1].born > WAKE.life) trail.pop();

      let slot = 0;
      if (trail.length && speed > WAKE.minSpeed) {
        slots[slot++].set(stern.x, stern.z, 0, trail[0].width);
      }
      for (const p of trail) {
        if (slot >= count) break;
        slots[slot++].set(p.x, p.z, time - p.born, p.width);
      }
      for (; slot < count; slot++) slots[slot].w = 0;
    },
  };
}
