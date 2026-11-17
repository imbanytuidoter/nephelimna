import * as THREE from "three";
import { islandHeight } from "../ocean/scene/islandHeight.js";
import { createAudio } from "./audio.js";
import { createVolume } from "./volume.js";
import { createCollisions } from "./blocks.js";
import { createBump } from "./bump.js";
import { createBoatFlag } from "./boatFlag.js";
import { createPropeller } from "./propeller.js";
import { cellLabel, createChart, compassLabel } from "./chart.js";
import { createSea } from "./sea/index.js";
import { createHelp } from "./help.js";
import { NET } from "./fishing/net.js";
import { createChaseCamera } from "./chaseCamera.js";
import { DECK, createWalker, deckHalfWidth, stepWalker, turnWalker } from "./deck.js";
import { createHarbour } from "./harbour.js";
import { harbourSite } from "./site.js";
import { createHelm, stepHelm } from "./drive.js";
import { createFishing } from "./fishing/index.js";
import { createHud } from "./hud.js";
import { createLife } from "./life/index.js";
import { createMarket } from "./market.js";
import { hullMetrics } from "./hull.js";
import { HULL } from "./tuning.js";
import { createInput } from "./input.js";
import { createPlayerDescriptor } from "./player.js";
import { createWake } from "./wake.js";
import { createPresence } from "./presence.js";
import { createRename } from "./rename.js";
import { loadSession, saveSession } from "./session.js";
import { createProgress } from "./progress.js";
import { createGuide } from "./guide.js";
import { createHoldPanel } from "./holdPanel.js";

const fwd = new THREE.Vector3();
const UNIT = new THREE.Vector3(1, 1, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const LAND_LEVEL = -0.4;
const keyed = (label, key, touch) => (touch ? label : `${label} (${key})`);

export function createGame({ camera, canvas, scene, floaters, patchMaterial, water, touch, onStaticChanged, rocks }) {
  const site = harbourSite();
  const baseUrl = import.meta.env.BASE_URL;
  createHarbour({ scene, site, patchMaterial, baseUrl, onChanged: onStaticChanged });
  const helm = createHelm();
  const model = {
    url: `${baseUrl}models/boat.glb`,
    onError: (error) => console.error("boat model failed to load", error),
  };
  const fleet = { hulls: () => [] };
  const push = createCollisions({ blocks: site.blocks, deckTop: site.deckTop, rocks, heightAt: islandHeight, vessels: () => fleet.hulls() });
  const berth = new THREE.Vector3(site.berth.x, 0.3, site.berth.z);
  const body = floaters.addBody(createPlayerDescriptor(helm, patchMaterial, model, push), berth, site.berth.yaw);
  const input = createInput(canvas, document.getElementById("stick"));
  const chase = createChaseCamera(camera);
  const wake = createWake(water.uWake.value);
  const { centerX } = hullMetrics();
  water.uHull.value.set(HULL.length, HULL.halfBeam, centerX, 1);
  const hud = createHud(document.getElementById("hud-game"));
  const life = createLife({ scene, patchMaterial, baseUrl, site, floaters, light: touch, boat: body.pos });
  const audio = createAudio(baseUrl);
  const bump = createBump((volume, rate) => audio.play("bump", volume, rate));
  const presence = createPresence({ scene, patchMaterial, baseUrl, body, camera });
  fleet.hulls = presence.hulls;
  createRename({ presence });
  const flag = createBoatFlag({ boat: body.object, patchMaterial, centerX });
  const propeller = createPropeller({ boat: body.object, patchMaterial, centerX });
  const market = createMarket({ scene, site, patchMaterial, baseUrl, onChanged: onStaticChanged, onSold: () => audio.play("coins", 0.8), onFlag: (id) => flag.set(id) });
  const sea = createSea({ baseUrl, cellName: cellLabel, nameOf: () => presence.name });
  const fishing = createFishing({ scene, body, patchMaterial, market, baseUrl, floaters, audio, sea, cellName: cellLabel });
  createProgress({ baseUrl });
  createGuide();
  createHoldPanel({ market, baseUrl, audio });
  const restored = loadSession(Date.now(), fishing.gearSizes);
  if (restored && islandHeight(restored.x, restored.z) < LAND_LEVEL) {
    body.place(new THREE.Vector3(restored.x, 0.3, restored.z), restored.heading);
    fishing.restore(restored);
  }
  let saveIn = 0;
  const snapshot = () => {
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    return { x: body.pos.x, z: body.pos.z, heading: Math.atan2(-fwd.z, fwd.x), depth: fishing.state.depth, bait: fishing.state.bait };
  };
  const persist = () => saveSession(snapshot(), Date.now());
  addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persist();
  });
  const tradePrompt = document.getElementById("trade-prompt");
  const help = createHelp({ touch, netPrice: NET.price, onDepth: () => fishing.cycleDepth() });
  createVolume({ audio });
  let gullIn = 6;
  let creakIn = 9;
  let stepIn = 0;
  const pov = { active: false, eye: new THREE.Vector3(), aim: new THREE.Vector3(1, 0, 0), lean: 0, fire: false, atPortRail: false };
  const modeButton = document.getElementById("mode-toggle");
  const crosshair = document.getElementById("crosshair");
  let walker = createWalker();
  const helmView = { near: camera.near, fov: camera.fov };

  const setMode = (deck) => {
    pov.active = deck;
    helm.anchor = deck ? { x: body.pos.x, z: body.pos.z } : null;
    audio.play("anchor", 0.7);
    if (deck) walker = createWalker();
    else if (document.pointerLockElement === canvas) document.exitPointerLock();
    camera.near = deck ? DECK.near : helmView.near;
    camera.fov = deck ? DECK.fov : helmView.fov;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    crosshair.hidden = !deck;
    modeButton.textContent = deck ? keyed("Weigh anchor, take the helm", "G", touch) : keyed("Drop anchor and fish", "G", touch);
    document.body.classList.toggle("on-deck", deck);
  };
  let dropping = false;
  const toggleMode = () => {
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    if (!pov.active && Math.abs(body.vel.dot(fwd)) > DECK.anchorSpeed) {
      dropping = !dropping;
      helm.brake = dropping;
      modeButton.textContent = dropping ? keyed("Dropping anchor", "G to cancel", touch) : keyed("Drop anchor and fish", "G", touch);
      if (dropping) audio.play("anchor", 0.5);
      return;
    }
    dropping = false;
    helm.brake = false;
    setMode(!pov.active);
  };
  modeButton.addEventListener("click", toggleMode);
  addEventListener("keydown", (e) => {
    if (e.code === "KeyG" && !e.repeat) toggleMode();
  });
  canvas.addEventListener("click", () => {
    if (pov.active && !touch && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  setMode(false);

  const yawOnly = new THREE.Quaternion();
  const sway = new THREE.Quaternion();
  const gaze = new THREE.Vector3();
  const deckView = () => {
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    yawOnly.setFromAxisAngle(WORLD_UP, Math.atan2(-fwd.z, fwd.x));
    sway.copy(yawOnly).slerp(body.quat, DECK.sway);
    pov.eye.set(walker.x - centerX, DECK.floor + DECK.eye, walker.z).applyQuaternion(body.quat).add(body.pos);
    const cp = Math.cos(walker.pitch);
    gaze.set(cp * Math.cos(walker.yaw), Math.sin(walker.pitch), cp * Math.sin(walker.yaw)).applyQuaternion(sway);
    pov.aim.copy(gaze).setY(0).normalize();
    camera.up.set(0, 1, 0).applyQuaternion(sway);
    camera.position.copy(pov.eye);
    camera.lookAt(gaze.add(pov.eye));
  };
  const chart = createChart({
    mini: document.getElementById("minimap"),
    full: document.getElementById("chart"),
    panel: document.getElementById("chart-panel"),
    readout: document.getElementById("chart-readout"),
    site,
    market: market.spot.stall,
  });
  const headingEl = document.getElementById("heading");
  let headingText = "";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    body,
    helm,
    sea,
    site,
    look: input.state,
    life,
    market,
    fishing,
    renderInsets: (renderer) => fishing.renderInset(renderer),
    audio,
    presence,
    setMode,
    get walker() {
      return walker;
    },
    beforePhysics(dt) {
      input.update(dt);
      const state = input.state;
      if (pov.active) {
        const fighting = fishing.state.rod.phase === "fight";
        walker = turnWalker(walker, state.turn, state.tilt);
        if (!fighting) {
          const before = walker;
          walker = stepWalker(walker, { forward: state.throttle, strafe: state.rudder }, dt);
          stepIn -= Math.hypot(walker.x - before.x, walker.z - before.z);
          if (stepIn <= 0) {
            stepIn = 0.75;
            if (walker.x !== before.x || walker.z !== before.z) audio.play("step", 0.35, 0.9 + Math.random() * 0.25);
          }
        }
        pov.lean = fighting ? state.rudder : 0;
        pov.fire = state.fire;
        pov.atPortRail = walker.z < -deckHalfWidth(walker.x) + DECK.railReach;
        helm.wantThrottle = 0;
        helm.wantRudder = 0;
      } else {
        pov.fire = false;
        helm.wantThrottle = dropping ? 0 : state.throttle;
        helm.wantRudder = state.rudder;
        if (dropping && Math.abs(body.vel.dot(fwd.set(1, 0, 0).applyQuaternion(body.quat))) <= DECK.anchorSpeed) toggleMode();
      }
      state.turn = 0;
      state.tilt = 0;
      stepHelm(helm, dt);
      const slow = Math.abs(body.vel.dot(fwd.set(1, 0, 0).applyQuaternion(body.quat))) <= DECK.anchorSpeed;
      modeButton.hidden = !pov.active && !slow;
    },
    afterPhysics(dt, time, waterAtCamera) {
      wake.update(body, time);
      water.uHullInv.value.compose(body.pos, body.quat, UNIT).invert();
      if (pov.active) deckView();
      else chase.update(body, input.state, waterAtCamera, dt, reducedMotion);
      camera.updateMatrixWorld();
      fwd.set(1, 0, 0).applyQuaternion(body.quat);
      hud.update(body.vel.dot(fwd), helm.throttle);
      help.update({ deck: pov.active, nearMarket: !tradePrompt.hidden, hasNet: market.hold.hasNet });
      const bearing = Math.atan2(fwd.x, -fwd.z);
      const label = compassLabel((bearing * 180) / Math.PI);
      if (label !== headingText) headingEl.textContent = headingText = label;
      presence.update(dt);
      if ((saveIn -= dt) <= 0) {
        saveIn = 2;
        persist();
      }
      chart.setBoats(presence.boats());
      chart.setOverlay(sea.overlay());
      chart.update(body.pos, bearing, performance.now());
      life.update(dt, time, body.pos, Math.atan2(fwd.z, fwd.x), body.vel.dot(fwd));
      market.update(body.pos, body.vel.dot(fwd));
      fishing.update(dt, time, pov);
      flag.update(time, body.vel.dot(fwd));
      sea.update();
      propeller.update(dt, helm.throttle, !pov.active);
      bump(dt, push.takeImpact());
      const knots = Math.abs(body.vel.dot(fwd));
      audio.loop("sea", pov.active ? 0.5 : 0.36);
      audio.loop("wind", 0.12 + Math.min(0.2, knots * 0.02));
      audio.loop("engine", pov.active ? 0 : 0.16 + 0.34 * Math.abs(helm.throttle), 0.7 + 0.55 * Math.abs(helm.throttle));
      audio.loop("wash", Math.min(0.6, knots * 0.06), 0.9 + knots * 0.015);
      if ((gullIn -= dt) <= 0) {
        gullIn = 14 + Math.random() * 22;
        audio.play("gulls", 0.3 + Math.random() * 0.2, 0.9 + Math.random() * 0.2);
      }
      if (pov.active && (creakIn -= dt) <= 0) {
        creakIn = 16 + Math.random() * 18;
        audio.play("creak", 0.25);
      }
    },
  };
}
