const TTL_MS = 8_000;
const MAX_BOATS = 64;
const MAX_RETURNED = 32;
const WORLD_LIMIT = 20_000;
const ID_PATTERN = /^[0-9a-f]{16}$/;
const NAME_LIMIT = 20;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u;

/** Other players see this text over the boat, so only short plain names of letters, digits and a few joiners pass; anything else falls back to the name the client derives from the id. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > NAME_LIMIT || !NAME_PATTERN.test(name)) return null;
  return name;
}

export interface Boat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly flag: string | null;
  readonly name: string | null;
  readonly at: number;
}

export interface PresenceUpdate {
  readonly id?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly z?: unknown;
  readonly yaw?: unknown;
  readonly flag?: unknown;
  readonly name?: unknown;
}

function bounded(value: unknown, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

export function createPresence() {
  const boats = new Map<string, Boat>();

  const sweep = (now: number) => {
    for (const [id, boat] of boats) if (now - boat.at > TTL_MS) boats.delete(id);
  };

  return {
    update(input: PresenceUpdate, now: number): Boat[] | null {
      if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) return null;
      const x = bounded(input.x, WORLD_LIMIT);
      const y = bounded(input.y, 200);
      const z = bounded(input.z, WORLD_LIMIT);
      const yaw = bounded(input.yaw, 100);
      if (x === null || y === null || z === null || yaw === null) return null;
      const flag = typeof input.flag === "string" && /^[a-z0-9_-]{1,24}$/.test(input.flag) ? input.flag : null;
      sweep(now);
      if (!boats.has(input.id) && boats.size >= MAX_BOATS) return null;
      boats.set(input.id, { id: input.id, x, y, z, yaw, flag, name: cleanName(input.name), at: now });
      return [...boats.values()].filter((boat) => boat.id !== input.id).slice(0, MAX_RETURNED);
    },
    leave(id: string): void {
      boats.delete(id);
    },
    size(now: number): number {
      sweep(now);
      return boats.size;
    },
  };
}
