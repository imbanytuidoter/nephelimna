import * as THREE from "three";
import { FREEBOARD, HULL } from "./tuning.js";

const SEG_LENGTH = 30;
const SEG_HEIGHT = 6;
const SEG_BEAM = 10;

export function hullPoint(u, v, w, out) {
  const t = u + 0.5;
  const side = Math.abs(2 * w);
  const rise = v + 0.5;
  const plan = t < 0.45 ? 0.7 + 0.3 * Math.sin((t / 0.45) * Math.PI * 0.5) : Math.max(0.03, 1 - ((t - 0.45) / 0.55) ** 2.1);
  const bow = Math.max(0, (t - 0.35) / 0.65);
  const sheer = 0.62 + 0.42 * bow * bow;
  const keel = -0.42 + 0.34 * Math.max(0, (t - 0.55) / 0.45) ** 1.7;
  const bottom = keel + 0.3 * side ** 1.6;
  return out.set(u * HULL.length, bottom + (sheer - bottom) * rise, 2 * w * HULL.halfBeam * plan * (0.74 + 0.26 * rise));
}

function solidStats(geometry) {
  const p = geometry.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  let momentX = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const part = a.dot(b.cross(c)) / 6;
    volume += part;
    momentX += (part * (a.x + b.x + c.x)) / 4;
  }
  return { volume, centerX: momentX / volume };
}

export function hullMetrics() {
  const box = new THREE.BoxGeometry(1, 1, 1, SEG_LENGTH, SEG_HEIGHT, SEG_BEAM);
  const pos = box.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    hullPoint(pos.getX(i), pos.getY(i), pos.getZ(i), p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  const solid = box.toNonIndexed();
  const { volume, centerX } = solidStats(solid);
  solid.computeBoundingBox();
  const size = solid.boundingBox.getSize(new THREE.Vector3());
  const samples = [];
  for (let i = 0; i < 5; i++) {
    for (const v of [-0.25, 0.25]) {
      for (const w of [-0.25, 0.25]) {
        const s = hullPoint((i + 0.5) / 5 - 0.5, v, w, new THREE.Vector3());
        s.x -= centerX;
        samples.push(s);
      }
    }
  }
  const probes = [];
  const rim = (u, w, shift = 0) => {
    const p = hullPoint(u, 0.5, w, new THREE.Vector3());
    p.x += shift - centerX;
    probes.push(p);
  };
  for (const u of [-0.5, -0.27, -0.03, 0.22, 0.4]) {
    rim(u, -0.5);
    rim(u, 0.5);
  }
  rim(0.5, 0);
  const bowProbes = probes.length - 3;
  rim(0.5, 0, FREEBOARD.ahead);
  return { size, volume, samples, centerX, probes, bowProbes };
}
