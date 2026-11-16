import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { Floaters } from "../src/ocean/scene/floaters.js";
import { DECK, createWalker, deckHalfWidth, stepWalker, turnWalker } from "../src/game/deck.js";
import { createHelm, stepHelm } from "../src/game/drive.js";
import { createPropeller } from "../src/game/propeller.js";
import { helpRows } from "../src/game/help.js";
import { createPlayerDescriptor } from "../src/game/player.js";

const FRAME = 1 / 60;
const walk = (walker, move, seconds) => {
  let w = walker;
  for (let t = 0; t < seconds; t += FRAME) w = stepWalker(w, move, FRAME);
  return w;
};

describe("walking the deck", () => {
  test("moves the way the player faces", () => {
    const start = { ...createWalker(), x: -1.8, z: 0, yaw: 0 };
    expect(walk(start, { forward: 1, strafe: 0 }, 0.3).x).toBeGreaterThan(start.x);
    expect(walk(start, { forward: 0, strafe: 1 }, 0.3).z).toBeGreaterThan(start.z);
    expect(walk({ ...start, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.3).z).toBeGreaterThan(start.z);
  });

  test("never leaves the cockpit however long the player pushes", () => {
    for (const yaw of [0, 1, 2, 3, 4, 5, 6]) {
      const end = walk({ ...createWalker(), yaw }, { forward: 1, strafe: 0.3 }, 12);
      expect(end.x).toBeLessThanOrEqual(DECK.fore - DECK.radius + 1e-9);
      expect(end.x).toBeGreaterThanOrEqual(DECK.aft + DECK.radius - 1e-9);
      expect(Math.abs(end.z)).toBeLessThanOrEqual(deckHalfWidth(end.x) + 1e-9);
    }
  });

  test("walks around the cooler instead of through it", () => {
    const block = DECK.blocks[0];
    const start = { ...createWalker(), x: block.x - 1.2, z: block.z, yaw: 0 };
    let w = start;
    for (let t = 0; t < 3; t += FRAME) {
      w = stepWalker(w, { forward: 1, strafe: 0 }, FRAME);
      expect(Math.hypot(w.x - block.x, w.z - block.z)).toBeGreaterThanOrEqual(block.r + DECK.radius - 1e-6);
    }
  });

  test("looking up and down stops short of vertical", () => {
    expect(turnWalker(createWalker(), 0, 9).pitch).toBeLessThan(Math.PI / 2);
    expect(turnWalker(createWalker(), 0, -9).pitch).toBeGreaterThan(-Math.PI / 2);
  });
});

describe("anchor", () => {
  test("braking for the anchor stops a boat at full speed within a few seconds", () => {
    const helm = createHelm();
    const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
    const body = floaters.addBody(createPlayerDescriptor(helm, () => {}), new THREE.Vector3(0, 0.2, 0), 0);
    helm.wantThrottle = 1;
    for (let t = 0; t < 8; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
    }
    expect(Math.hypot(body.vel.x, body.vel.z)).toBeGreaterThan(6);
    helm.wantThrottle = 0;
    helm.brake = true;
    let stoppedAt = Infinity;
    for (let t = 0; t < 6; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
      if (stoppedAt === Infinity && Math.hypot(body.vel.x, body.vel.z) <= DECK.anchorSpeed) stoppedAt = t;
    }
    expect(stoppedAt).toBeLessThan(4.5);
  });

  test("holds a drifting boat near the spot where it was dropped", () => {
    const helm = createHelm();
    const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
    const body = floaters.addBody(createPlayerDescriptor(helm, () => {}), new THREE.Vector3(0, 0.2, 0), 0);
    helm.wantThrottle = 1;
    for (let t = 0; t < 4; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
    }
    helm.wantThrottle = 0;
    helm.throttle = 0;
    helm.anchor = { x: body.pos.x, z: body.pos.z };
    for (let t = 0; t < 12; t += FRAME) floaters.step(FRAME);
    expect(Math.hypot(body.pos.x - helm.anchor.x, body.pos.z - helm.anchor.z)).toBeLessThan(2);
    expect(Math.hypot(body.vel.x, body.vel.z)).toBeLessThan(0.3);
  });
});

describe("propeller", () => {
  const make = () => createPropeller({ boat: new THREE.Group(), patchMaterial: () => {}, centerX: 0 });

  test("turns faster with throttle, reverses astern and stops at anchor", () => {
    const prop = make();
    let ahead = 0;
    for (let i = 0; i < 180; i++) ahead = prop.update(1 / 60, 1, true);
    expect(ahead).toBeGreaterThan(25);
    expect(prop.spinner.rotation.x).not.toBe(0);
    let astern = 0;
    for (let i = 0; i < 180; i++) astern = prop.update(1 / 60, -0.4, true);
    expect(astern).toBeLessThan(0);
    let stopped = 1;
    for (let i = 0; i < 240; i++) stopped = prop.update(1 / 60, 0, false);
    expect(Math.abs(stopped)).toBeLessThan(0.01);
  });

  test("has three blades reaching past the gearcase", () => {
    const prop = make();
    const blades = prop.spinner.children.filter((c) => c.geometry.index);
    const box = new THREE.Box3().setFromObject(prop.spinner);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.28);
    expect(blades.length).toBeGreaterThanOrEqual(3);
  });
});

describe("controls window", () => {
  const base = { deck: false, touch: false, nearMarket: false, hasNet: false, netPrice: 120 };
  const keysOf = (rows) => rows.map((row) => row.keys.join(""));

  test("at the helm it lists driving keys and offers the market and the round only when they are in reach", () => {
    expect(keysOf(helpRows(base))).toEqual(["WS", "AD", "G", "M", "I"]);
    expect(keysOf(helpRows({ ...base, nearMarket: true }))).toEqual(["WS", "AD", "G", "M", "I", "E"]);
  });

  test("on deck the net row says how to get a net until one is owned, then becomes a button", () => {
    const locked = helpRows({ ...base, deck: true }).find((row) => row.keys[0] === "N");
    expect(locked.press).toBe(null);
    expect(locked.text).toContain("120 coins");
    const owned = helpRows({ ...base, deck: true, hasNet: true }).find((row) => row.keys[0] === "N");
    expect(owned.press).toBe("KeyN");
    expect(helpRows({ ...base, deck: true, hasNet: true }).find((row) => row.keys[0] === "N").text).toContain("hidden net");
  });

  test("on a phone it names thumbs instead of keys", () => {
    expect(helpRows({ ...base, touch: true })[0].keys).toEqual(["Left thumb"]);
    expect(keysOf(helpRows({ ...base, touch: true, deck: true }))).toContain("Big button");
  });
});
