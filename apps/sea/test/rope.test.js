import { describe, expect, test } from "vitest";
import { createRope } from "../src/game/fishing/rope.js";

const settle = (rope, a, b, length, floor, taut = 0) => {
  for (let i = 0; i < 240; i++) rope.step(1 / 60, a, b, length, floor, taut);
};
const span = (rope) => {
  let total = 0;
  for (let i = 0; i < rope.count - 1; i++) total += Math.hypot(rope.x[i + 1] - rope.x[i], rope.y[i + 1] - rope.y[i], rope.z[i + 1] - rope.z[i]);
  return total;
};

describe("fishing line", () => {
  const a = { x: 0, y: 2, z: 0 };
  const b = { x: 10, y: 0, z: 0 };

  test("stays pinned to the rod tip and the float", () => {
    const rope = createRope(24);
    settle(rope, a, b, 11, -1);
    expect(rope.x[0]).toBe(0);
    expect(rope.y[0]).toBe(2);
    expect(rope.x[23]).toBe(10);
    expect(rope.y[23]).toBe(0);
  });

  test("a slack line sags and lies on the water instead of sinking through it", () => {
    const rope = createRope(24);
    settle(rope, a, b, 14, 0);
    const lowest = Math.min(...rope.y);
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(Array.from(rope.y).filter((v) => v < 0.02).length).toBeGreaterThan(3);
  });

  test("a line under load runs straight", () => {
    const rope = createRope(24);
    const direct = Math.hypot(10, 2);
    settle(rope, a, b, direct, -5, 0.9);
    expect(span(rope)).toBeLessThan(direct * 1.02);
    expect(rope.y[12]).toBeGreaterThan(0.75);
  });

  test("never stretches far past the line that was paid out", () => {
    const rope = createRope(24);
    settle(rope, a, b, 12, -5);
    expect(span(rope)).toBeLessThan(12 * 1.05);
  });
});
