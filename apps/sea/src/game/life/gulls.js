import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { withVertexFlex } from "./flex.js";
import { createGull, gullPose, wingAngles } from "./gullMotion.js";
import { seeded } from "./random.js";

const REFLECTION_LAYER = 1;
const SIZE = 1.5;
const PERCH_LOOK = 0.7;
const PERCH_HOLD = 2.6;
const WING_GLSL = `  {
    float side = sign(position.z);
    float span = abs(position.z);
    vec2 q = vec2(span, position.y);
    vec2 wrist = vec2(0.33, 0.04);
    vec2 root = vec2(0.03, 0.034);
    float outer = uWing.y * smoothstep(0.2, 0.46, span);
    vec2 d = q - wrist;
    q = wrist + vec2(d.x * cos(outer) - d.y * sin(outer), d.x * sin(outer) + d.y * cos(outer));
    float inner = uWing.x * smoothstep(0.0, 0.14, span - root.x);
    d = q - root;
    q = root + vec2(d.x * cos(inner) - d.y * sin(inner), d.x * sin(inner) + d.y * cos(inner));
    transformed.z = side * q.x;
    transformed.y = q.y;
  }`;

export function createGulls({ scene, patchMaterial, baseUrl, anchors, count, perches = [] }) {
  const random = seeded(404);
  const group = new THREE.Group();
  group.name = "gulls";
  scene.add(group);
  const flock = Array.from({ length: count }, () => ({
    motion: createGull(random, anchors.length),
    bird: null,
    wing: { value: new THREE.Vector2() },
  }));
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  const angles = { inner: 0, outer: 0 };

  new GLTFLoader().load(
    `${baseUrl}models/gull.glb`,
    (gltf) => {
      for (const member of flock) {
        const bird = gltf.scene.clone(true);
        bird.traverse((node) => {
          if (!node.isMesh) return;
          node.layers.enable(REFLECTION_LAYER);
          node.frustumCulled = false;
          const material = node.material.clone();
          material.vertexColors = material.name === "plumage";
          if (material.name === "wing") {
            node.material = withVertexFlex(material, patchMaterial, "gullwing", { uWing: member.wing }, "uniform vec2 uWing;", WING_GLSL);
          } else {
            patchMaterial(material);
            node.material = material;
          }
        });
        bird.rotation.order = "YZX";
        bird.scale.setScalar(SIZE * (0.9 + random() * 0.25));
        member.bird = bird;
        group.add(bird);
      }
    },
    undefined,
    (error) => console.error("gull model failed to load", error),
  );

  const perched = perches.map((spot, i) => ({ spot, bird: null, yaw: random() * Math.PI * 2, offset: i * 7 + random() * 5 }));
  new GLTFLoader().load(
    `${baseUrl}models/gull-perch.glb`,
    (gltf) => {
      for (const member of perched) {
        const bird = gltf.scene.clone(true);
        bird.traverse((node) => {
          if (!node.isMesh) return;
          node.layers.enable(REFLECTION_LAYER);
          node.castShadow = true;
          node.material = node.material.clone();
          patchMaterial(node.material);
        });
        bird.position.set(member.spot.x, member.spot.y, member.spot.z);
        bird.scale.setScalar(SIZE);
        member.bird = bird;
        group.add(bird);
      }
    },
    undefined,
    (error) => console.error("perched gull model failed to load", error),
  );

  return {
    flock,
    perched,
    update(dt, time) {
      for (const member of perched) {
        if (member.bird) member.bird.rotation.y = member.yaw + PERCH_LOOK * Math.sin(Math.floor((time + member.offset) / PERCH_HOLD) * 2.3);
      }
      for (const member of flock) {
        if (!member.bird) continue;
        gullPose(member.motion, anchors[member.motion.anchor], time, pose);
        member.bird.position.set(pose.x, pose.y, pose.z);
        member.bird.rotation.set(pose.roll, pose.yaw, pose.pitch);
        wingAngles(member.motion, time, dt, angles);
        member.wing.value.set(angles.inner, angles.outer);
      }
    },
  };
}
