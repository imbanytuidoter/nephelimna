import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { islandHeight } from "../src/ocean/scene/islandHeight.js";
import { Floaters } from "../src/ocean/scene/floaters.js";
import { createCollisions, rockFootprint } from "../src/game/blocks.js";
import { createHelm, stepHelm } from "../src/game/drive.js";
import { createPlayerDescriptor } from "../src/game/player.js";
import { harbourSite } from "../src/game/site.js";

const FRAME = 1 / 60;

describe("harbour site", () => {
  const site = harbourSite();

  test("pier starts on dry land and ends in water deep enough to berth", () => {
    expect(islandHeight(site.root.x, site.root.z)).toBeGreaterThan(1);
    expect(islandHeight(site.head.center.x, site.head.center.z)).toBeLessThan(-2.5);
    expect(islandHeight(site.berth.x, site.berth.z)).toBeLessThan(-2.5);
    expect(site.stem.length).toBeGreaterThan(20);
    expect(site.stem.length).toBeLessThan(120);
  });

  test("lighthouse and shed stand on land", () => {
    expect(site.lighthouse.y).toBeGreaterThan(5);
    expect(site.shed.y).toBeGreaterThan(1);
  });

  test("a boat driven at the pier head is stopped by it", () => {
    const helm = createHelm();
    const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
    const push = createCollisions({ blocks: site.blocks, deckTop: site.deckTop });
    const start = new THREE.Vector3(site.head.center.x + site.out.x * 30, 0.2, site.head.center.z + site.out.z * 30);
    const yaw = Math.atan2(site.out.z, -site.out.x);
    const body = floaters.addBody(createPlayerDescriptor(helm, () => {}, null, push), start, yaw);
    helm.wantThrottle = 1;
    for (let t = 0; t < 14; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
    }
    const along = (body.pos.x - site.head.center.x) * site.out.x + (body.pos.z - site.head.center.z) * site.out.z;
    expect(along).toBeGreaterThan(site.head.width / 2);
    expect(along).toBeLessThan(12);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(body.quat).y).toBeGreaterThan(0.9);
  });

  const drive = (push, start, yaw, seconds, heightAt = () => -50) => {
    const helm = createHelm();
    const floaters = new Floaters({ scene: new THREE.Scene(), heightAt, patchMaterial: () => {} });
    const body = floaters.addBody(createPlayerDescriptor(helm, () => {}, null, push), start, yaw);
    helm.wantThrottle = 1;
    let deepest = Infinity;
    for (let t = 0; t < seconds; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
      deepest = Math.min(deepest, Math.hypot(body.pos.x, body.pos.z));
    }
    return { body, deepest };
  };

  test("the hull does not overlap the pier even at full speed", () => {
    const push = createCollisions({ blocks: site.blocks, deckTop: site.deckTop });
    const start = new THREE.Vector3(site.head.center.x + site.out.x * 40, 0.2, site.head.center.z + site.out.z * 40);
    const { body } = drive(push, start, Math.atan2(site.out.z, -site.out.x), 14);
    const along = (body.pos.x - site.head.center.x) * site.out.x + (body.pos.z - site.head.center.z) * site.out.z;
    expect(along).toBeGreaterThan(site.head.width / 2 + 3.2);
  });

  test("a boat at full speed from far out never crosses the pier, at 60 and at 30 steps a second", () => {
    for (const frame of [1 / 60, 1 / 30]) {
      const helm = createHelm();
      const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
      const push = createCollisions({ blocks: site.blocks, deckTop: site.deckTop });
      const start = new THREE.Vector3(site.head.center.x + site.out.x * 110, 0.2, site.head.center.z + site.out.z * 110);
      const body = floaters.addBody(createPlayerDescriptor(helm, () => {}, null, push), start, Math.atan2(site.out.z, -site.out.x));
      helm.wantThrottle = 1;
      let closest = Infinity;
      let fastest = 0;
      for (let t = 0; t < 24; t += frame) {
        stepHelm(helm, frame);
        floaters.step(frame);
        fastest = Math.max(fastest, Math.hypot(body.vel.x, body.vel.z));
        closest = Math.min(closest, (body.pos.x - site.head.center.x) * site.out.x + (body.pos.z - site.head.center.z) * site.out.z);
      }
      expect(fastest).toBeGreaterThan(9);
      expect(closest).toBeGreaterThan(site.head.width / 2 + 2.5);
    }
  });

  test("a rock that breaks the surface stops the boat, a sunken one does not", () => {
    const rock = { x: 0, z: 0, y: -1, r: 5, top: 2.5 };
    expect(rockFootprint(rock)).toBeGreaterThan(4);
    expect(rockFootprint({ ...rock, top: -1.5 })).toBe(0);
    const blocked = drive(createCollisions({ rocks: [rock] }), new THREE.Vector3(-40, 0.2, 0), 0, 12);
    expect(blocked.deepest).toBeGreaterThan(rockFootprint(rock) + 2.5);
    const free = drive(createCollisions({ rocks: [{ ...rock, top: -1.5 }] }), new THREE.Vector3(-40, 0.2, 0), 0, 12);
    expect(free.deepest).toBeLessThan(2);
  });

  test("another boat is solid: driving at it side on stops the hull short of it", () => {
    const hull = { x: 0, z: 0, ax: { x: 0, z: 1 }, halfLength: 3.7, halfWidth: 1.28 };
    const blocked = drive(createCollisions({ vessels: () => [hull] }), new THREE.Vector3(-40, 0.2, 0), 0, 12);
    expect(blocked.deepest).toBeGreaterThan(hull.halfWidth + 2.5);
    const push = createCollisions({ vessels: () => [hull] });
    drive(push, new THREE.Vector3(-40, 0.2, 0), 0, 12);
    expect(push.takeImpact()).toBeGreaterThan(1.2);
    expect(push.takeImpact()).toBe(0);
    const free = drive(createCollisions({ vessels: () => [] }), new THREE.Vector3(-40, 0.2, 0), 0, 12);
    expect(free.deepest).toBeLessThan(2);
  });

  test("shallow water turns the boat back before it climbs onto the reef", () => {
    const reef = (x) => -6 + Math.max(0, x) * 0.5;
    const push = createCollisions({ heightAt: reef });
    const helm = createHelm();
    const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: reef, patchMaterial: () => {} });
    const body = floaters.addBody(createPlayerDescriptor(helm, () => {}, null, push), new THREE.Vector3(-30, 0.2, 0), 0);
    helm.wantThrottle = 1;
    let furthest = -Infinity;
    for (let t = 0; t < 16; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
      furthest = Math.max(furthest, body.pos.x);
    }
    expect(reef(furthest + 3.7)).toBeLessThan(0);
    expect(body.pos.y).toBeLessThan(0.6);
  });
});
