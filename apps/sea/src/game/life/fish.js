import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { islandHeight } from "../../ocean/scene/islandHeight.js";
import { SCHOOL, createSchool, fishOffset, schoolCenter, stepFlee, stepFollow } from "./schoolMotion.js";
import { seeded } from "./random.js";

const WIGGLE = 0.22;
const FOLLOWERS = 2;
const FLASH = { base: 0.95, gain: 0.8 };
const SKIN = { roughness: 0.35, metalness: 0.4 };

function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 10, 6).scale(0.42, 0.11, 0.05).toNonIndexed();
  const tail = new THREE.ConeGeometry(0.09, 0.14, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.25).translate(-0.25, 0, 0).toNonIndexed();
  const geometry = mergeGeometries([body, tail]);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const back = new THREE.Color(0x1f4a52);
  const flank = new THREE.Color(0xe4eef2);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(flank).lerp(back, THREE.MathUtils.smoothstep(pos.getY(i), -0.01, 0.045));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function schoolSpots(site, random, count) {
  const spots = [];
  const tryAdd = (x, z) => {
    if (islandHeight(x, z) < SCHOOL.minSeabed && islandHeight(x, z) > -11) spots.push({ x, z });
  };
  for (let i = 0; i < 400 && spots.length < Math.ceil(count * 0.45); i++) {
    const a = random() * Math.PI * 2;
    const r = 14 + random() * 55;
    tryAdd(site.head.center.x + Math.cos(a) * r, site.head.center.z + Math.sin(a) * r);
  }
  for (let i = 0; i < 2000 && spots.length < count; i++) {
    const a = random() * Math.PI * 2;
    const r = 320 + random() * 260;
    tryAdd(Math.cos(a) * r, Math.sin(a) * r);
  }
  return spots;
}

export function createFish({ scene, patchMaterial, site, schools, perSchool, baseUrl }) {
  const random = seeded(77);
  const list = schoolSpots(site, random, schools).map((spot) => createSchool(random, spot.x, spot.z, perSchool));
  const followers = Array.from({ length: FOLLOWERS }, (_, i) => ({ school: createSchool(random, site.berth.x, site.berth.z, perSchool), side: i * Math.PI + 0.8 }));
  const all = [...list, ...followers.map((f) => f.school)];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.55 });
  patchMaterial(material);
  const mesh = new THREE.InstancedMesh(fishGeometry(), material, all.length * perSchool);
  const tint = new THREE.Color();
  mesh.name = "fish";
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  new GLTFLoader().load(
    `${baseUrl}models/school-fish.glb`,
    (gltf) => {
      let model = null;
      gltf.scene.traverse((node) => {
        if (node.isMesh && !model) model = node;
      });
      if (!model) return;
      const skin = new THREE.MeshStandardMaterial({ map: model.material.map, roughness: SKIN.roughness, metalness: SKIN.metalness });
      patchMaterial(skin);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.geometry = model.geometry;
      mesh.material = skin;
    },
    undefined,
    (error) => console.error("school fish model failed to load", error),
  );

  const center = { x: 0, z: 0 };
  const offset = { x: 0, y: 0, z: 0, yaw: 0 };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    schools: list,
    followers,
    update(dt, time, boat, heading = 0, speed = 0) {
      for (const f of followers) stepFollow(f.school, boat, speed, heading + f.side, dt, islandHeight);
      let index = 0;
      for (const school of all) {
        schoolCenter(school, time, center);
        stepFlee(school, center, boat, dt);
        for (const fish of school.fish) {
          fishOffset(fish, time, offset);
          const size = 0.7 + fish.squash * 0.6;
          q.setFromAxisAngle(up, offset.yaw + Math.sin(time * 9 + fish.phase) * WIGGLE);
          m.compose(p.set(center.x + offset.x, offset.y, center.z + offset.z), q, s.set(size, size, size));
          mesh.setMatrixAt(index, m);
          mesh.setColorAt(index++, tint.setScalar(FLASH.base + FLASH.gain * Math.max(0, Math.sin(offset.yaw * 2 + time * 0.7 + fish.phase)) ** 6));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
