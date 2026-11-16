import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { islandHeight } from "../../ocean/scene/islandHeight.js";
import { DOLPHIN, VISIT, createDolphin, createVisit, dolphinPose, skipVisit, stepAway, stepPod, stepVisit } from "./dolphinMotion.js";
import { withVertexFlex } from "./flex.js";
import { seeded } from "./random.js";

const REFLECTION_LAYER = 1;
const SPLASH = { leap: 0.12, breath: 0.05, size: 0.8 };
const FLEX_GLSL = `  {
    float along = position.x;
    float rear = smoothstep(0.25, -1.25, along);
    transformed.y += 0.5 * uFlex.x * along * along + uFlex.y * rear * rear * sin(uFlex.z + along * 2.4);
  }`;

export function createDolphins({ scene, patchMaterial, baseUrl, floaters, start }) {
  const random = seeded(31);
  const pod = { x: start.x, z: start.z };
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, airborne: false, leap: false, bend: 0, sway: 0, beat: 0 };
  const members = Array.from({ length: DOLPHIN.count }, () => ({
    motion: createDolphin(random),
    object: null,
    airborne: false,
    flex: { value: new THREE.Vector3() },
  }));
  const group = new THREE.Group();
  group.name = "dolphins";
  group.visible = false;
  let visit = createVisit(random);
  const SPAWN_TRIES = 8;
  scene.add(group);

  new GLTFLoader().load(
    `${baseUrl}models/dolphin.glb`,
    (gltf) => {
      for (const member of members) {
        const object = gltf.scene.clone(true);
        object.traverse((node) => {
          if (!node.isMesh) return;
          node.layers.enable(REFLECTION_LAYER);
          node.receiveShadow = true;
          node.frustumCulled = false;
          node.material = withVertexFlex(node.material.clone(), patchMaterial, "dolphin", { uFlex: member.flex }, "uniform vec3 uFlex;", FLEX_GLSL);
        });
        object.rotation.order = "YZX";
        object.scale.setScalar(1.1 + random() * 0.3);
        member.object = object;
        group.add(object);
      }
    },
    undefined,
    (error) => console.error("dolphin model failed to load", error),
  );

  const splash = (x, z, amp) => {
    floaters.impacts.push({ x, z, t: floaters.time, amp, size: SPLASH.size });
    if (floaters.impacts.length > 8) floaters.impacts.shift();
  };

  return {
    pod,
    members,
    get visit() {
      return visit;
    },
    update(dt, time, boat, heading) {
      const step = stepVisit(visit, dt, random);
      visit = step.visit;
      if (step.event === "arrive") {
        const start = random() * Math.PI * 2;
        const spot = Array.from({ length: SPAWN_TRIES }, (_, i) => start + (i * Math.PI * 2) / SPAWN_TRIES)
          .map((angle) => ({ x: boat.x + Math.cos(angle) * VISIT.spawnDistance, z: boat.z + Math.sin(angle) * VISIT.spawnDistance }))
          .find((p) => islandHeight(p.x, p.z) < DOLPHIN.minDepth);
        if (spot) {
          pod.x = spot.x;
          pod.z = spot.z;
          group.visible = true;
        } else visit = skipVisit(random);
      }
      if (step.event === "gone") group.visible = false;
      if (!group.visible) return;
      if (visit.phase === "near") stepPod(pod, boat, heading, dt, islandHeight);
      else stepAway(pod, boat, dt, islandHeight);
      for (const member of members) {
        if (!member.object) continue;
        dolphinPose(member.motion, pod, time, pose);
        member.object.position.set(pose.x, pose.y, pose.z);
        member.object.rotation.set(0, pose.yaw, pose.pitch);
        member.flex.value.set(pose.bend, pose.sway, pose.beat);
        if (pose.airborne !== member.airborne) splash(pose.x, pose.z, pose.leap || member.leap ? SPLASH.leap : SPLASH.breath);
        member.airborne = pose.airborne;
        member.leap = pose.leap;
      }
    },
  };
}
