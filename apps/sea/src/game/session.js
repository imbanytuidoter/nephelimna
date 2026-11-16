export const SESSION_KEY = "nephelimna.session.v1";
let frozen = false;
export const freezeSession = () => {
  frozen = true;
};
const LIMIT = 1600;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const index = (v, size) => Number.isInteger(v) && v >= 0 && v < size;

export function serializeSession({ x, z, heading, depth, bait }, now) {
  return JSON.stringify({
    at: now,
    x,
    z,
    heading,
    depth,
    bait,
  });
}

export function parseSession(text, now, { depths, baits }) {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!finite(raw.x) || !finite(raw.z) || !finite(raw.heading) || !finite(raw.at)) return null;
    if (Math.abs(raw.x) > LIMIT || Math.abs(raw.z) > LIMIT) return null;
    return {
      x: raw.x,
      z: raw.z,
      heading: raw.heading,
      depth: index(raw.depth, depths) ? raw.depth : 0,
      bait: index(raw.bait, baits) ? raw.bait : 0,
    };
  } catch {
    return null;
  }
}

export function loadSession(now, sizes) {
  try {
    return parseSession(localStorage.getItem(SESSION_KEY), now, sizes);
  } catch {
    return null;
  }
}

export function saveSession(snapshot, now) {
  if (frozen) return;
  try {
    localStorage.setItem(SESSION_KEY, serializeSession(snapshot, now));
  } catch (error) {
    console.warn("session was not saved", error);
  }
}
