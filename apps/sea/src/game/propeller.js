import * as THREE from "three";

const HUB = { x: -4.4, y: -0.4, z: 0 };
const BLADES = 3;
const ROOT = 0.035;
const TIP = 0.175;
const CHORD = 0.062;
const PITCH = 0.62;
const RAKE = 0.02;
const SPAN_STEPS = 10;
const CHORD_STEPS = 6;
const MAX_SPIN = 30;
const SPIN_EASE = 4;
const IDLE_SPIN = 3;

function bladeGeometry() {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= SPAN_STEPS; i++) {
    const t = i / SPAN_STEPS;
    const radius = ROOT + (TIP - ROOT) * t;
    const width = CHORD * (0.45 + 1.5 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.35 * t));
    const pitch = PITCH * (1.25 - 0.6 * t);
    for (let j = 0; j <= CHORD_STEPS; j++) {
      const c = (j / CHORD_STEPS) * 2 - 1;
      const sweep = (c * width * Math.cos(pitch)) / radius + 0.35 * t * t;
      positions.push(c * width * Math.sin(pitch) - RAKE * t, radius * Math.cos(sweep), radius * Math.sin(sweep));
    }
  }
  const row = CHORD_STEPS + 1;
  for (let i = 0; i < SPAN_STEPS; i++) {
    for (let j = 0; j < CHORD_STEPS; j++) {
      const a = i * row + j;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createPropeller({ boat, patchMaterial, centerX }) {
  const material = new THREE.MeshStandardMaterial({ color: 0xb8a070, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
  patchMaterial(material);
  const spinner = new THREE.Group();
  spinner.position.set(HUB.x - centerX, HUB.y, HUB.z);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.11, 14), material);
  hub.rotation.z = Math.PI / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 14), material);
  cone.rotation.z = Math.PI / 2;
  cone.position.x = -0.1;
  spinner.add(hub, cone);
  const geometry = bladeGeometry();
  for (let i = 0; i < BLADES; i++) {
    const blade = new THREE.Mesh(geometry, material);
    blade.rotation.x = (i * 2 * Math.PI) / BLADES;
    spinner.add(blade);
  }
  spinner.traverse((node) => node.isMesh && node.layers.enable(1));
  boat.add(spinner);
  let spin = 0;

  return {
    spinner,
    update(dt, throttle, running) {
      const target = running ? Math.sign(throttle || 1) * (IDLE_SPIN + (MAX_SPIN - IDLE_SPIN) * Math.abs(throttle)) : 0;
      spin += (target - spin) * Math.min(1, SPIN_EASE * dt);
      spinner.rotation.x += spin * dt;
      return spin;
    },
  };
}
