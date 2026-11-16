import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { hullMetrics } from "./hull.js";
import { HULL } from "./tuning.js";
import { boatName, cleanName, loadName, saveName } from "./names.js";

const SEND_EVERY = 0.25;
const SMOOTH = 7;
const STALE_AFTER = 3;
const FAILURES_BEFORE_CLEAR = 6;
const REFLECTION_LAYER = 1;
const TAG_HEIGHT = 3.4;
const TAG_RANGE = 450;

function newId() {
  const stored = sessionStorage.getItem("sea-presence-id");
  if (stored && /^[0-9a-f]{16}$/.test(stored)) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem("sea-presence-id", id);
  return id;
}

function turnToward(from, to, amount) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

export function createPresence({ scene, patchMaterial, baseUrl, body, camera }) {
  const api = new URL(`${baseUrl}api/`, window.location.href);
  const id = newId();
  const { centerX } = hullMetrics();
  const remote = new Map();
  const fwd = new THREE.Vector3();
  let template = null;
  let sendIn = 0;
  let inFlight = false;
  let failures = 0;
  let list = [];
  let hulls = [];
  const tags = document.getElementById("boat-tags");
  const online = document.getElementById("online-text");
  let name = loadName() ?? boatName(id);
  const point = new THREE.Vector3();
  const renderOnline = () => {
    const others = remote.size;
    online.textContent = others ? `You are ${name} · ${others} other ${others === 1 ? "boat" : "boats"} at sea` : `You are ${name} · alone at sea`;
  };
  renderOnline();

  new GLTFLoader().load(
    `${baseUrl}models/boat.glb`,
    (gltf) => {
      gltf.scene.position.x = -centerX;
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.receiveShadow = true;
        node.layers.enable(REFLECTION_LAYER);
        for (const material of [node.material].flat()) patchMaterial(material);
      });
      template = gltf.scene;
    },
    undefined,
    (error) => console.error("remote boat model failed to load", error),
  );

  const shownName = (boat) => cleanName(boat.name) ?? boatName(boat.id);
  const spawn = (boat) => {
    const object = new THREE.Group();
    object.name = "remote-boat";
    object.position.set(boat.x, boat.y, boat.z);
    object.rotation.y = boat.yaw;
    if (template) object.add(template.clone(true));
    scene.add(object);
    const tag = document.createElement("div");
    tag.className = "boat-tag";
    tag.textContent = shownName(boat);
    tag.hidden = true;
    tags.append(tag);
    return { object, tag, target: boat, yaw: boat.yaw, seen: performance.now(), loaded: Boolean(template) };
  };

  const drop = (key, entry) => {
    scene.remove(entry.object);
    entry.tag.remove();
    remote.delete(key);
  };
  const placeTag = (entry) => {
    point.copy(entry.object.position).setY(entry.object.position.y + TAG_HEIGHT);
    const far = point.distanceTo(camera.position);
    point.project(camera);
    const visible = point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1 && far < TAG_RANGE;
    entry.tag.hidden = !visible;
    if (!visible) return;
    entry.tag.style.transform = `translate(${((point.x + 1) / 2) * innerWidth}px, ${((1 - point.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    entry.tag.dataset.far = `${Math.round(far)} m`;
  };

  const apply = (boats) => {
    const now = performance.now();
    const present = new Set();
    for (const boat of boats) {
      present.add(boat.id);
      const known = remote.get(boat.id);
      if (known) {
        known.target = boat;
        known.seen = now;
        const label = shownName(boat);
        if (known.tag.textContent !== label) known.tag.textContent = label;
      } else remote.set(boat.id, spawn(boat));
    }
    for (const [key, entry] of remote) {
      if (present.has(key)) continue;
      drop(key, entry);
    }
    renderOnline();
  };

  const send = async () => {
    if (inFlight || document.hidden) return;
    inFlight = true;
    fwd.set(1, 0, 0).applyQuaternion(body.quat);
    try {
      const response = await fetch(new URL("presence", api), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, x: body.pos.x, y: body.pos.y, z: body.pos.z, yaw: Math.atan2(-fwd.z, fwd.x) }),
      });
      if (!response.ok) throw new Error(`presence ${response.status}`);
      const data = await response.json();
      failures = 0;
      apply(data.boats);
    } catch (error) {
      failures += 1;
      if (failures === FAILURES_BEFORE_CLEAR) {
        console.error("presence unreachable", error);
        apply([]);
      }
    } finally {
      inFlight = false;
    }
  };

  addEventListener("pagehide", () => {
    navigator.sendBeacon(new URL("leave", api), new Blob([JSON.stringify({ id })], { type: "application/json" }));
  });

  return {
    update(dt) {
      sendIn -= dt;
      if (sendIn <= 0) {
        sendIn = SEND_EVERY;
        void send();
      }
      const k = 1 - Math.exp(-SMOOTH * dt);
      const now = performance.now();
      list = [];
      hulls = [];
      for (const [key, entry] of remote) {
        if (now - entry.seen > STALE_AFTER * 1000) {
          drop(key, entry);
          renderOnline();
          continue;
        }
        if (!entry.loaded && template) {
          entry.object.add(template.clone(true));
          entry.loaded = true;
        }
        const t = entry.target;
        entry.object.position.x += (t.x - entry.object.position.x) * k;
        entry.object.position.y += (t.y - entry.object.position.y) * k;
        entry.object.position.z += (t.z - entry.object.position.z) * k;
        entry.yaw = turnToward(entry.yaw, t.yaw, k);
        entry.object.rotation.y = entry.yaw;
        placeTag(entry);
        const ax = { x: Math.cos(entry.yaw), z: -Math.sin(entry.yaw) };
        hulls.push({ x: entry.object.position.x - ax.x * centerX, z: entry.object.position.z - ax.z * centerX, ax, halfLength: HULL.length / 2, halfWidth: HULL.halfBeam });
        list.push({ x: entry.object.position.x, z: entry.object.position.z, bearing: Math.PI / 2 - entry.yaw });
      }
    },
    boats: () => list,
    hulls: () => hulls,
    count: () => remote.size,
    get name() {
      return name;
    },
    rename(value) {
      const next = value.trim() === "" ? boatName(id) : cleanName(value);
      if (!next) return null;
      name = next;
      saveName(next === boatName(id) ? null : next);
      renderOnline();
      return name;
    },
  };
}
