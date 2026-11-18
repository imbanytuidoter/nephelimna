import * as THREE from "three";
import { createBoatFlag } from "./boatFlag.js";
import { createCollisions } from "./blocks.js";
import { DECK, createWalker } from "./deck.js";
import { createHelm, stepHelm } from "./drive.js";
import { createGear } from "./fishing/gear.js";
import { REST_ELEVATION } from "./fishing/index.js";
import { createHarbour } from "./harbour.js";
import { hullMetrics } from "./hull.js";
import { createLife } from "./life/index.js";
import { placeStall } from "./market.js";
import { createPlayerDescriptor } from "./player.js";
import { createPropeller } from "./propeller.js";
import { harbourSite } from "./site.js";
import { CAMERA, HULL } from "./tuning.js";
import { createWake } from "./wake.js";
import { islandHeight } from "../ocean/scene/islandHeight.js";

const VIEW_TURN = 0.2;
const VIEW_CLOSER = 0.85;
const VIEW_LOWER = 0.85;
const UNIT = new THREE.Vector3(1, 1, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const eye = new THREE.Vector3();
const aim = new THREE.Vector3();
const base = new THREE.Vector3();
const direction = new THREE.Vector3();

export function createView({ camera, scene, floaters, patchMaterial, water, onStaticChanged, rocks, light }) {
  const site = harbourSite();
  const baseUrl = import.meta.env.BASE_URL;
  createHarbour({ scene, site, patchMaterial, baseUrl, onChanged: onStaticChanged });
  placeStall({ scene, site, patchMaterial, baseUrl, onChanged: onStaticChanged });
  const helm = createHelm();
  const model = { url: `${baseUrl}models/boat.glb`, onError: (error) => console.error("boat model failed to load", error) };
  const push = createCollisions({ blocks: site.blocks, deckTop: site.deckTop, rocks, heightAt: islandHeight, vessels: () => [] });
  const berth = new THREE.Vector3(site.berth.x, 0.3, site.berth.z);
  const body = floaters.addBody(createPlayerDescriptor(helm, patchMaterial, model, push), berth, site.berth.yaw);
  helm.anchor = { x: berth.x, z: berth.z };
  const { centerX } = hullMetrics();
  water.uHull.value.set(HULL.length, HULL.halfBeam, centerX, 1);
  water.uShoreWave.value.x = 0;
  const wake = createWake(water.uWake.value);
  const life = createLife({ scene, patchMaterial, baseUrl, site, floaters, light, boat: body.pos });
  const flag = createBoatFlag({ boat: body.object, patchMaterial, centerX });
  const propeller = createPropeller({ boat: body.object, patchMaterial, centerX });
  const gear = createGear({ scene, patchMaterial, baseUrl });
  gear.showRod(true);
  const walker = createWalker();

  const frame = () => {
    const portrait = camera.aspect < 1;
    const distance = (portrait ? CAMERA.portraitDistance : CAMERA.distance) * VIEW_CLOSER;
    const heading = -site.berth.yaw;
    const target = new THREE.Vector3(berth.x, berth.y + CAMERA.lookHeight, berth.z);
    camera.position.set(target.x - Math.cos(heading) * distance, berth.y + CAMERA.height * VIEW_LOWER, target.z - Math.sin(heading) * distance);
    camera.lookAt(target);
    camera.rotateY(portrait ? 0 : VIEW_TURN);
    camera.updateMatrixWorld();
  };
  frame();
  addEventListener("resize", frame);

  const holdRod = () => {
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    eye.set(walker.x - centerX, DECK.floor + DECK.eye, walker.z).applyQuaternion(body.quat).add(body.pos);
    aim.set(Math.cos(walker.yaw), 0, Math.sin(walker.yaw)).applyQuaternion(body.quat).setY(0).normalize();
    right.set(-aim.z, 0, aim.x);
    base.copy(eye).addScaledVector(aim, 0.55).addScaledVector(right, 0.34).addScaledVector(WORLD_UP, -0.5);
    direction.copy(aim).multiplyScalar(Math.cos(REST_ELEVATION)).addScaledVector(WORLD_UP, Math.sin(REST_ELEVATION));
    gear.setRod(base, direction, DOWN, 0, 0);
  };

  return {
    body,
    fishing: { probe: new THREE.Vector3(), setProbeWater() {}, setResolution: (width, height) => gear.setResolution(width, height) },
    renderInsets() {},
    beforePhysics(dt) {
      helm.wantThrottle = 0;
      helm.wantRudder = 0;
      stepHelm(helm, dt);
    },
    afterPhysics(dt, time) {
      wake.update(body, time);
      water.uHullInv.value.compose(body.pos, body.quat, UNIT).invert();
      fwd.set(1, 0, 0).applyQuaternion(body.quat);
      life.update(dt, time, body.pos, Math.atan2(fwd.z, fwd.x), 0);
      flag.update(time, 0);
      propeller.update(dt, 0, false);
      holdRod();
      gear.setFloat(null);
      gear.setLine(null);
      gear.setAim(null);
      gear.stepSpray(dt);
    },
  };
}
