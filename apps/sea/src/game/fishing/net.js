export const NET = { price: 400, fillEvery: 8, capacity: 12, reach: 28 };

export function createNet() {
  return { phase: "stowed", time: 0, x: 0, z: 0 };
}

export function netFish(net) {
  return net.phase === "out" ? Math.min(NET.capacity, Math.floor(net.time / NET.fillEvery)) : 0;
}

export function netDistance(net, x, z) {
  return Math.hypot(x - net.x, z - net.z);
}

export function stepNet(net, dt, input, world) {
  if (net.phase === "stowed") {
    if (!input.pressed) return { net, event: null };
    if (!world.owned) return { net, event: "no-net" };
    if (!world.canFish) return { net, event: "moving" };
    return { net: { phase: "out", time: 0, x: world.x, z: world.z }, event: "set" };
  }
  const next = { ...net, time: net.time + dt };
  if (!input.pressed) return { net: next, event: null };
  if (netDistance(net, world.x, world.z) > NET.reach) return { net: next, event: "far" };
  return { net: createNet(), event: "hauled", count: netFish(next) };
}
