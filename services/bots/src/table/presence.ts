const TTL_MS = 8_000;
const MAX_BOATS = 64;
const MAX_RETURNED = 32;
const MAX_PER_OWNER = 4;
const FLEET = "fleet";
const WORLD_LIMIT = 20_000;
const ID_PATTERN = /^[0-9a-f]{16}$/;
const NAME_LIMIT = 20;
const CLOCK_LIMIT = 1e9;
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
  readonly t: number | null;
  readonly at: number;
  readonly owner: string;
}

export interface PresenceUpdate {
  readonly id?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly z?: unknown;
  readonly yaw?: unknown;
  readonly flag?: unknown;
  readonly name?: unknown;
  readonly t?: unknown;
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
    /** Ids are public in every reply, so a boat stays with the address that first sent it, and one address holds only a few boats; otherwise anyone could move or remove other boats, or fill the sea with fakes that wake the AI fleet. */
    update(input: PresenceUpdate, now: number, owner: string = FLEET): Boat[] | null {
      if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) return null;
      const x = bounded(input.x, WORLD_LIMIT);
      const y = bounded(input.y, 200);
      const z = bounded(input.z, WORLD_LIMIT);
      const yaw = bounded(input.yaw, 100);
      if (x === null || y === null || z === null || yaw === null) return null;
      const t = bounded(input.t, CLOCK_LIMIT);
      const flag = typeof input.flag === "string" && /^[a-z0-9_-]{1,24}$/.test(input.flag) ? input.flag : null;
      sweep(now);
      const known = boats.get(input.id);
      if (known && known.owner !== owner) return null;
      if (!known && boats.size >= MAX_BOATS) return null;
      if (!known && owner !== FLEET && [...boats.values()].filter((boat) => boat.owner === owner).length >= MAX_PER_OWNER) return null;
      boats.set(input.id, { id: input.id, x, y, z, yaw, flag, name: cleanName(input.name), t, at: now, owner });
      return [...boats.values()].filter((boat) => boat.id !== input.id).slice(0, MAX_RETURNED);
    },
    leave(id: string, owner: string = FLEET): void {
      if (boats.get(id)?.owner === owner) boats.delete(id);
    },
    size(now: number): number {
      sweep(now);
      return boats.size;
    },
    ids(now: number): string[] {
      sweep(now);
      return [...boats.keys()];
    },
    people(now: number): number {
      sweep(now);
      return [...boats.values()].filter((boat) => boat.owner !== FLEET).length;
    },
  };
}

export type Presence = ReturnType<typeof createPresence>;
