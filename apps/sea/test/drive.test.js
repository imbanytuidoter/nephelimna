import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { Floaters } from "../src/ocean/scene/floaters.js";
import { createHelm, stepHelm } from "../src/game/drive.js";
import { createPlayerDescriptor } from "../src/game/player.js";

const FRAME = 1 / 60;

function launch() {
  const helm = createHelm();
  const floaters = new Floaters({ scene: new THREE.Scene(), heightAt: () => -50, patchMaterial: () => {} });
  const body = floaters.addBody(createPlayerDescriptor(helm, () => {}), new THREE.Vector3(0, 0.2, 0), 0);
  const run = (seconds, throttle, rudder) => {
    helm.wantThrottle = throttle;
    helm.wantRudder = rudder;
    for (let t = 0; t < seconds; t += FRAME) {
      stepHelm(helm, FRAME);
      floaters.step(FRAME);
    }
  };
  return { body, run };
}

const forward = (body) => new THREE.Vector3(1, 0, 0).applyQuaternion(body.quat);
const upward = (body) => new THREE.Vector3(0, 1, 0).applyQuaternion(body.quat);
const heading = (body) => {
  const f = forward(body);
  return Math.atan2(-f.z, f.x);
};

describe("player boat on flat water", () => {
  test("floats upright at rest with the deck above the water", () => {
    const { body, run } = launch();
    run(8, 0, 0);
    expect(upward(body).y).toBeGreaterThan(0.995);
    expect(body.pos.y).toBeGreaterThan(-0.25);
    expect(body.pos.y).toBeLessThan(0.45);
    expect(body.vel.length()).toBeLessThan(0.1);
  });

  test("reaches cruising speed under full throttle and keeps its heading", () => {
    const { body, run } = launch();
    run(3, 0, 0);
    run(12, 1, 0);
    const speed = body.vel.dot(forward(body));
    expect(speed).toBeGreaterThan(9);
    expect(speed).toBeLessThan(15);
    expect(Math.abs(heading(body))).toBeLessThan(0.05);
    expect(upward(body).y).toBeGreaterThan(0.96);
  });

  test("coasts down when the throttle is released", () => {
    const { body, run } = launch();
    run(3, 0, 0);
    run(10, 1, 0);
    const fast = body.vel.length();
    run(6, 0, 0);
    expect(body.vel.length()).toBeLessThan(fast * 0.45);
    expect(body.vel.length()).toBeGreaterThan(0.3);
  });

  test("turns to starboard on right rudder and leans into the turn", () => {
    const { body, run } = launch();
    run(3, 0, 0);
    run(8, 1, 0);
    run(3, 1, 1);
    expect(heading(body)).toBeLessThan(-0.8);
    const lean = new THREE.Vector3(0, 0, 1).applyQuaternion(body.quat).y;
    expect(lean).toBeLessThan(-0.03);
    expect(lean).toBeGreaterThan(-0.4);
  });

  test("does not slide sideways after a turn", () => {
    const { body, run } = launch();
    run(3, 0, 0);
    run(8, 1, 0);
    run(2.5, 1, -1);
    run(2, 1, 0);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(body.quat);
    expect(Math.abs(body.vel.dot(side))).toBeLessThan(1.2);
  });

  test("backs up slower than it runs ahead", () => {
    const { body, run } = launch();
    run(3, 0, 0);
    run(10, -1, 0);
    const speed = body.vel.dot(forward(body));
    expect(speed).toBeLessThan(-2);
    expect(speed).toBeGreaterThan(-8);
  });
});
