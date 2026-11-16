import { islandHeight } from "../ocean/scene/islandHeight.js";

const LEE_BEARINGS = [330, 335, 340, 345, 350, 355];
const PIER_ROOT_HEIGHT = 1.25;
const BERTH_DEPTH = -3.1;
const HEAD_LENGTH = 16;
const HEAD_WIDTH = 3.6;
const STEM_WIDTH = 3.2;
const DECK_TOP = 1.5;

const rad = (deg) => (deg * Math.PI) / 180;

function walk(bearing, from, step, stop) {
  const c = Math.cos(bearing);
  const s = Math.sin(bearing);
  let r = from;
  while (r > 40 && r < 1400 && !stop(islandHeight(c * r, s * r))) r += step;
  return r;
}

function profile(deg) {
  const bearing = rad(deg);
  const coast = walk(bearing, 100, 1, (h) => h <= 0);
  const root = walk(bearing, coast, -0.5, (h) => h >= PIER_ROOT_HEIGHT);
  const berth = walk(bearing, coast, 0.5, (h) => h <= BERTH_DEPTH);
  return { bearing, coast, root, berth, length: berth - root };
}

export function harbourSite() {
  const best = LEE_BEARINGS.map(profile).reduce((a, b) => (b.length < a.length ? b : a));
  const out = { x: Math.cos(best.bearing), z: Math.sin(best.bearing) };
  const side = { x: -out.z, z: out.x };
  const at = (along, across = 0) => ({ x: out.x * along + side.x * across, z: out.z * along + side.z * across });
  const stemLength = best.length;
  const headCenter = at(best.berth + HEAD_WIDTH / 2);
  const stemCenter = at(best.root + stemLength / 2);
  const berth = at(best.berth + HEAD_WIDTH + 7);

  const lightBearing = best.bearing + 0.42;
  const lightRadius = walk(lightBearing, walk(lightBearing, 100, 1, (h) => h <= 0), -1, (h) => h >= 7);
  const light = { x: Math.cos(lightBearing) * lightRadius, z: Math.sin(lightBearing) * lightRadius };
  const shed = at(best.root - 8, -7);

  return {
    bearing: best.bearing,
    out,
    side,
    deckTop: DECK_TOP,
    root: at(best.root),
    stem: { center: stemCenter, length: stemLength, width: STEM_WIDTH },
    head: { center: headCenter, length: HEAD_LENGTH, width: HEAD_WIDTH },
    berth: { x: berth.x, z: berth.z, yaw: Math.atan2(side.z, -side.x) },
    lighthouse: { ...light, y: islandHeight(light.x, light.z) },
    shed: { ...shed, y: islandHeight(shed.x, shed.z) },
    blocks: [
      { x: stemCenter.x, z: stemCenter.z, ax: out, halfLength: stemLength / 2, halfWidth: STEM_WIDTH / 2 },
      { x: headCenter.x, z: headCenter.z, ax: side, halfLength: HEAD_LENGTH / 2, halfWidth: HEAD_WIDTH / 2 },
    ],
  };
}
