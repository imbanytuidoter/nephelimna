import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { islandHeight } from "../../ocean/scene/islandHeight.js";
import { fbm } from "../../ocean/scene/noise.js";
import { seeded } from "./random.js";

const BLADES = 5;
const SEGMENTS = 5;
const SHALLOW = -1.5;
const DEEP = -8.5;
const TIP_CLEARANCE = 0.55;
const PATCH_THRESHOLD = 0.02;

function clumpGeometry(random) {
  const blades = [];
  const root = new THREE.Color(0x1d3a22);
  const tip = new THREE.Color(0x7c9a3c);
  const c = new THREE.Color();
  for (let b = 0; b < BLADES; b++) {
    const width = 0.07 + random() * 0.07;
    const blade = new THREE.PlaneGeometry(width, 1, 1, SEGMENTS).translate(0, 0.5, 0);
    const pos = blade.attributes.position;
    const lean = 0.15 + random() * 0.35;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 - 0.75 * h));
      pos.setZ(i, lean * h * h);
      c.copy(root).lerp(tip, h);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    blade.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    blade.rotateY(random() * Math.PI * 2);
    blade.translate((random() - 0.5) * 0.35, 0, (random() - 0.5) * 0.35);
    blade.scale(1, 0.6 + random() * 0.4, 1);
    blades.push(blade);
  }
  const geometry = mergeGeometries(blades);
  geometry.computeVertexNormals();
  return geometry;
}

function plant(site, random, count) {
  const spots = [];
  const tryAdd = (x, z, always) => {
    const bed = islandHeight(x, z);
    if (bed > SHALLOW || bed < DEEP) return;
    if (!always && fbm(x * 0.02, z * 0.02, 3, 5) < PATCH_THRESHOLD) return;
    spots.push({ x, z, bed });
  };
  for (let i = 0; i < count * 2 && spots.length < count * 0.3; i++) {
    const a = random() * Math.PI * 2;
    const r = 6 + random() * 80;
    tryAdd(site.head.center.x + Math.cos(a) * r, site.head.center.z + Math.sin(a) * r, random() < 0.5);
  }
  for (let i = 0; i < count * 30 && spots.length < count; i++) {
    const a = random() * Math.PI * 2;
    const r = 280 + random() * 330;
    tryAdd(Math.cos(a) * r, Math.sin(a) * r, false);
  }
  return spots;
}

export function createSeaweed({ scene, patchMaterial, site, count }) {
  const random = seeded(913);
  const spots = plant(site, random, count);
  const sway = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  patchMaterial(material);
  const patched = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    patched(shader, renderer);
    shader.uniforms.uSway = sway;
    shader.vertexShader = `uniform float uSway;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  {
    float bend = position.y * position.y;
    vec2 where = instanceMatrix[3].xz * 0.31;
    transformed.x += sin(uSway * 1.1 + where.x + position.y * 1.6) * 0.34 * bend;
    transformed.z += cos(uSway * 0.83 + where.y + position.y * 1.3) * 0.28 * bend;
  }`,
    );
  };
  material.customProgramCacheKey = () => "gelatin-prop-seaweed";

  const mesh = new THREE.InstancedMesh(clumpGeometry(random), material, spots.length);
  mesh.name = "seaweed";
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((spot, i) => {
    const room = -spot.bed - TIP_CLEARANCE;
    const height = Math.min(room, 1.1 + random() * 1.7);
    const girth = 0.8 + random() * 0.7;
    q.setFromAxisAngle(up, random() * Math.PI * 2);
    m.compose(p.set(spot.x, spot.bed - 0.05, spot.z), q, s.set(girth, height, girth));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  return {
    count: spots.length,
    update(time) {
      sway.value = time;
    },
  };
}
