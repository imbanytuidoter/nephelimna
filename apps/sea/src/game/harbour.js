import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { islandHeight } from "../ocean/scene/islandHeight.js";

const REFLECTION_LAYER = 1;
const DECK_THICKNESS = 0.16;
const PILE_RADIUS = 0.17;
const PILE_SPACING = 3.6;
const PLANK_TILE = 2.2;
const LAMP_SPACING = 14;

function planks(loader, base, repeatX, repeatY) {
  const load = (file, color) => {
    const t = loader.load(`${base}textures/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return new THREE.MeshStandardMaterial({ map: load("planks_diff.jpg", true), normalMap: load("planks_nor.jpg", false), roughness: 0.85 });
}

function prepare(object, patchMaterial) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.layers.enable(REFLECTION_LAYER);
    for (const material of [node.material].flat()) patchMaterial(material);
  });
  return object;
}

function deckSlab(length, width, material) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, DECK_THICKNESS, width), material);
  slab.position.y = -DECK_THICKNESS / 2;
  return slab;
}

function pilePositions(site) {
  const spots = [];
  const row = (center, axis, length, width) => {
    const count = Math.max(2, Math.round(length / PILE_SPACING) + 1);
    for (let i = 0; i < count; i++) {
      const along = -length / 2 + (length * i) / (count - 1);
      for (const across of [-width / 2 + 0.25, width / 2 - 0.25]) {
        spots.push({ x: center.x + axis.x * along - axis.z * across, z: center.z + axis.z * along + axis.x * across });
      }
    }
  };
  row(site.stem.center, site.out, site.stem.length, site.stem.width);
  row(site.head.center, site.side, site.head.length, site.head.width);
  return spots;
}

function buildPiles(site, material) {
  const spots = pilePositions(site);
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(PILE_RADIUS, PILE_RADIUS * 1.15, 1, 10), material, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  spots.forEach((spot, i) => {
    const bed = Math.min(islandHeight(spot.x, spot.z), site.deckTop - 0.6) - 0.8;
    const top = site.deckTop + (i % 4 === 0 ? 0.55 : 0.05);
    m.compose(p.set(spot.x, (top + bed) / 2, spot.z), q, s.set(1, top - bed, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export const LAMP_TOP = 2.84;

export function lampSpots(site) {
  const count = Math.max(2, Math.floor(site.stem.length / LAMP_SPACING) + 1);
  const across = site.stem.width / 2 - 0.25;
  return Array.from({ length: count }, (_, i) => {
    const along = -site.stem.length / 2 + 2 + ((site.stem.length - 4) * i) / (count - 1);
    return { x: site.stem.center.x + site.out.x * along - site.out.z * across, z: site.stem.center.z + site.out.z * along + site.out.x * across, y: site.deckTop + LAMP_TOP };
  });
}

function buildLamps(site, patchMaterial) {
  const group = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46a, emissiveIntensity: 5, roughness: 0.4 });
  patchMaterial(pole);
  patchMaterial(glow);
  for (const { x, z } of lampSpots(site)) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.6, 8), pole);
    post.position.set(x, site.deckTop + 1.3, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow);
    lamp.position.set(x, site.deckTop + 2.68, z);
    group.add(post, lamp);
  }
  return group;
}

export function createHarbour({ scene, site, patchMaterial, baseUrl, onChanged }) {
  const group = new THREE.Group();
  group.name = "harbour";
  const textures = new THREE.TextureLoader();
  const yaw = -site.bearing;

  const stem = deckSlab(site.stem.length, site.stem.width, planks(textures, baseUrl, site.stem.length / PLANK_TILE, site.stem.width / PLANK_TILE));
  stem.position.set(site.stem.center.x, site.deckTop - DECK_THICKNESS / 2, site.stem.center.z);
  stem.rotation.y = yaw;
  const head = deckSlab(site.head.width, site.head.length, planks(textures, baseUrl, site.head.width / PLANK_TILE, site.head.length / PLANK_TILE));
  head.position.set(site.head.center.x, site.deckTop - DECK_THICKNESS / 2, site.head.center.z);
  head.rotation.y = yaw;

  const timber = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
  group.add(stem, head, buildPiles(site, timber));
  prepare(group, patchMaterial);
  group.add(buildLamps(site, patchMaterial));
  scene.add(group);

  const loader = new GLTFLoader();
  const place = (file, spot, sink, turn) => {
    loader.load(
      `${baseUrl}models/${file}`,
      (gltf) => {
        gltf.scene.position.set(spot.x, spot.y - sink, spot.z);
        gltf.scene.rotation.y = turn;
        group.add(prepare(gltf.scene, patchMaterial));
        onChanged();
      },
      undefined,
      (error) => console.error(`${file} failed to load`, error),
    );
  };
  place("lighthouse.glb", site.lighthouse, 0.6, yaw);
  place("shed.glb", site.shed, 0.35, yaw);
  onChanged();
  return group;
}
