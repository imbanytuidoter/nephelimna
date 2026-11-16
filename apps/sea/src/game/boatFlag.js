import * as THREE from "three";
import { DEFAULT_FLAG, drawFlag } from "./flags.js";

const WIDTH = 0.95;
const HEIGHT = 0.6;
const STREAM = -0.12;
const STAFF_LEAN = 0.25;
const COLUMNS = 12;
const ROWS = 5;
const STAFF_TOP = { x: -3.87, y: 1.86, z: -0.8 };

export function createBoatFlag({ boat, patchMaterial, centerX }) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.85 });
  patchMaterial(material);
  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, COLUMNS, ROWS);
  geometry.translate(-WIDTH / 2, -HEIGHT / 2, 0);
  const rest = geometry.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = STREAM;
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  const hoist = new THREE.Group();
  hoist.position.set(STAFF_TOP.x - centerX, STAFF_TOP.y, STAFF_TOP.z);
  hoist.rotation.z = STAFF_LEAN;
  hoist.add(mesh);
  boat.add(hoist);
  let shown = null;

  return {
    set(id) {
      if (id === shown) return;
      shown = id;
      drawFlag(ctx, id ?? DEFAULT_FLAG, canvas.width, canvas.height);
      texture.needsUpdate = true;
    },
    update(time, speed) {
      const pos = geometry.attributes.position;
      const gust = 1 + Math.min(1.2, Math.abs(speed) * 0.12);
      for (let i = 0; i < pos.count; i++) {
        const along = -rest[i * 3] / WIDTH;
        const wave = Math.sin(time * 5 * gust - along * 6.5) * 0.07 * along + Math.sin(time * 2.3 - along * 3) * 0.04 * along;
        pos.setZ(i, wave);
        pos.setY(i, rest[i * 3 + 1] - 0.06 * along * along + Math.sin(time * 3.1 - along * 5) * 0.012 * along);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}
