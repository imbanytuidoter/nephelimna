import * as THREE from "three";
import { DRIVE } from "./tuning.js";

const fwd = new THREE.Vector3();
const up = new THREE.Vector3();
const arm = new THREE.Vector3();
const push = new THREE.Vector3();
const twist = new THREE.Vector3();
const beam = new THREE.Vector3();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (value, target, step) => value + clamp(target - value, -step, step);

export function createHelm() {
  return { throttle: 0, rudder: 0, wantThrottle: 0, wantRudder: 0, anchor: null, brake: false };
}

export function stepHelm(helm, dt) {
  helm.throttle = approach(helm.throttle, clamp(helm.wantThrottle, -1, 1), DRIVE.throttleRate * dt);
  helm.rudder = approach(helm.rudder, clamp(helm.wantRudder, -1, 1), DRIVE.rudderRate * dt);
}

const scratch = { push: new THREE.Vector3(), arm: new THREE.Vector3(), cross: new THREE.Vector3() };

export function createDrive(helm, length, blockPush, freeboard) {
  return (body, h, force, torque) => {
    if (blockPush) blockPush(body, force, torque, scratch, h);
    if (freeboard) freeboard(body, force, torque);
    if (helm.anchor) {
      force.x += body.mass * (DRIVE.anchorPull * (helm.anchor.x - body.pos.x) - DRIVE.anchorDamp * body.vel.x);
      force.z += body.mass * (DRIVE.anchorPull * (helm.anchor.z - body.pos.z) - DRIVE.anchorDamp * body.vel.z);
    }
    if (helm.brake) {
      force.x -= body.mass * DRIVE.brakeDamp * body.vel.x;
      force.z -= body.mass * DRIVE.brakeDamp * body.vel.z;
    }
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    up.set(0, 1, 0).applyQuaternion(body.quat);
    const speed = body.vel.dot(fwd);
    const grip = clamp(body.submerged * 3, 0, 1);
    const gear = helm.throttle >= 0 ? 1 : DRIVE.reverse;

    push.copy(fwd).multiplyScalar(helm.throttle * gear * DRIVE.thrust * body.mass * grip);
    arm.copy(fwd).multiplyScalar(DRIVE.propOffset.x * length).addScaledVector(up, DRIVE.propOffset.y);
    force.add(push);
    torque.add(twist.copy(arm).cross(push));

    const cells = body.world.length;
    let level = 0;
    let rising = 0;
    for (let i = 0; i < cells; i++) {
      level += body.water[i * 4];
      rising += body.water[i * 4 + 2];
    }
    const closing = rising / cells - body.vel.y;
    const sag = level / cells + (rising / cells) * DRIVE.rideLead + DRIVE.rideHeight - body.pos.y;
    force.y += body.mass * (DRIVE.rideSpring * DRIVE.rideSpring * sag + 2 * DRIVE.rideDamping * DRIVE.rideSpring * closing);

    force.addScaledVector(fwd, -DRIVE.quadDrag * body.mass * speed * Math.abs(speed) * grip);

    const yawInertia = 1 / body.invInertia.y;
    const rollInertia = 1 / body.invInertia.x;
    const pitchInertia = 1 / body.invInertia.z;
    const bite = clamp(speed / DRIVE.steerSpeed, -1, 1) + DRIVE.propWash * helm.throttle;
    torque.addScaledVector(up, yawInertia * grip * (-helm.rudder * DRIVE.steerRate * bite - DRIVE.yawDamp * body.angVel.dot(up)));

    beam.set(0, 0, 1).applyQuaternion(body.quat);
    const samples = body.desc.samples;
    let alongSum = 0;
    let alongNorm = 0;
    let acrossSum = 0;
    let acrossNorm = 0;
    const mean = level / cells;
    for (let i = 0; i < cells; i++) {
      const lift = body.water[i * 4] - mean;
      alongSum += samples[i].x * lift;
      alongNorm += samples[i].x * samples[i].x;
      acrossSum += samples[i].z * lift;
      acrossNorm += samples[i].z * samples[i].z;
    }
    const plane = clamp(speed / DRIVE.planeSpeed, 0, 1);
    const wantPitch = Math.atan(alongSum / alongNorm) * DRIVE.pitchFollow + DRIVE.planeAngle * plane * plane;
    const wantRoll = -Math.atan(acrossSum / acrossNorm) * DRIVE.rollFollow + DRIVE.bankAngle * helm.rudder * clamp(speed / DRIVE.bankSpeed, 0, 1);
    const pitch = Math.asin(clamp(fwd.y, -1, 1));
    const roll = -Math.asin(clamp(beam.y, -1, 1));
    const ps = DRIVE.pitchSpring;
    const rs = DRIVE.rollSpring;
    torque.addScaledVector(beam, pitchInertia * (ps * ps * (wantPitch - pitch) - 2 * DRIVE.trimDamping * ps * body.angVel.dot(beam)));
    torque.addScaledVector(fwd, rollInertia * (rs * rs * (wantRoll - roll) - 2 * DRIVE.trimDamping * rs * body.angVel.dot(fwd)));
  };
}
