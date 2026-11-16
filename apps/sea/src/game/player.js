import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createDrive } from "./drive.js";
import { createFreeboardGuard } from "./freeboard.js";
import { hullMetrics } from "./hull.js";
import { DRIVE, HULL } from "./tuning.js";

const REFLECTION_LAYER = 1;

function mountModel(group, url, centerX, patchMaterial, onError) {
  new GLTFLoader().load(
    url,
    (gltf) => {
      gltf.scene.position.x = -centerX;
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = true;
        node.layers.enable(REFLECTION_LAYER);
        for (const material of [node.material].flat()) patchMaterial(material);
      });
      group.add(gltf.scene);
    },
    undefined,
    onError,
  );
}

export function createPlayerDescriptor(helm, patchMaterial, model, blockPush) {
  const { size, volume, samples, centerX, probes, bowProbes } = hullMetrics();
  const object = new THREE.Group();
  object.name = "player-boat";
  if (model) mountModel(object, model.url, centerX, patchMaterial, model.onError);
  return {
    kind: "player",
    pinned: true,
    object,
    size,
    volume,
    density: HULL.density,
    samples,
    probes,
    cellHeight: HULL.cellHeight,
    hullDrag: DRIVE.hullDrag,
    inertiaScale: new THREE.Vector3(HULL.inertiaScale.x, HULL.inertiaScale.y, HULL.inertiaScale.z),
    queryLead: HULL.queryLead,
    get waterSmoothing() {
      return HULL.waterSmoothing;
    },
    get heaveLimit() {
      return HULL.heaveLimit;
    },
    drive: createDrive(helm, HULL.length, blockPush, createFreeboardGuard(bowProbes)),
  };
}
