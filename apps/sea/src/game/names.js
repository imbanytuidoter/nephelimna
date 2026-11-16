const FIRST = ["Grey", "Swift", "Quiet", "Salt", "Amber", "Misty", "Iron", "Silver", "Rusty", "Lucky", "Northern", "Drifting", "Old", "Brave", "Foggy", "Tidal"];
const SECOND = ["Heron", "Pike", "Gull", "Otter", "Carp", "Tern", "Seal", "Trout", "Cormorant", "Bass", "Petrel", "Eel", "Grayling", "Skua", "Perch", "Puffin"];
const NAME_KEY = "nephelimna.boat.name";
export const NAME_LIMIT = 20;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u;

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function boatName(id) {
  const h = hash(String(id));
  return `${FIRST[h % FIRST.length]} ${SECOND[(h >>> 8) % SECOND.length]}`;
}

/** Must match the server's check in services/bots/src/table/presence.ts, otherwise a name the player sees accepted would be dropped for everyone else. */
export function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > NAME_LIMIT || !NAME_PATTERN.test(name)) return null;
  return name;
}

export function loadName() {
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return null;
  }
}

export function saveName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
    return true;
  } catch (error) {
    console.warn("boat name was not saved", error);
    return false;
  }
}
