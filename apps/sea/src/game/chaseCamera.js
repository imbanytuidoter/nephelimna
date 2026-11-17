import * as THREE from "three";
import { CAMERA } from "./tuning.js";

const target = new THREE.Vector3();
const want = new THREE.Vector3();
const fwd = new THREE.Vector3();

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

export function createChaseCamera(camera) {
  const rig = { yaw: 0, baseY: 0, ready: false };

  return {
    update(body, look, waterAtCamera, dt, reducedMotion) {
      fwd.set(1, 0, 0).applyQuaternion(body.quat);
      const heading = Math.atan2(fwd.z, fwd.x);
      const speed = Math.max(0, body.vel.dot(fwd));
      if (!rig.ready) {
        rig.yaw = heading;
        rig.baseY = body.pos.y;
        rig.ready = true;
      }
      rig.yaw += wrap(heading - rig.yaw) * ease(CAMERA.follow, dt);
      rig.baseY += (body.pos.y - rig.baseY) * ease(CAMERA.lift, dt);

      const portrait = camera.aspect < 1;
      const pull = reducedMotion ? 0 : speed * CAMERA.speedPull;
      const distance = (portrait ? CAMERA.portraitDistance : CAMERA.distance) + pull;
      const yaw = rig.yaw + look.lookYaw;
      const pitch = look.lookPitch;
      const flat = distance * Math.cos(pitch);

      target.set(body.pos.x, rig.baseY + CAMERA.lookHeight, body.pos.z);
      want.set(
        target.x - Math.cos(yaw) * flat,
        rig.baseY + CAMERA.height + distance * Math.sin(pitch),
        target.z - Math.sin(yaw) * flat,
      );
      want.y = Math.max(want.y, waterAtCamera + CAMERA.minAboveWater);
      camera.position.copy(want);
      camera.lookAt(target);
    },
  };
}
