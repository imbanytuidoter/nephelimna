import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { SEA, packChoice } from "@nephelimna/rules";
import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Chain } from "./chain.js";
import type { Presence } from "./presence.js";

const KEY_PATTERN = /^0x[0-9a-f]{64}$/;
const FUND_FLOOR_WEI = 3_000_000_000_000_000n;
const FUND_WEI = 10_000_000_000_000_000n;
const FUND_CHECKS = 10;
const FUND_CHECK_MS = 3000;
const POST_AFTER = [6, 12] as const;
const CAST_GAP_S = [150, 330] as const;
const FISH_FOR_S = [360, 840] as const;
const SAIL_SPEED = 6;
const ARRIVE_M = 8;
const TURN_ARC = Math.PI / 3;
const CHART_HALF = 1600;
const CELL_M = (CHART_HALF * 2) / 8;
const OPEN_WATER_FROM = 700;
const OPEN_WATER_TO = 1500;
const NAME_SUFFIX = " AI";
const SAVE_EVERY_MS = 60_000;
const CLOCK_WRAP_MS = 100_000_000;

interface Style {
  readonly name: string;
  readonly choices: readonly (readonly [depth: number, bait: number, weight: number])[];
}

export const STYLES: readonly Style[] = [
  { name: "Old Pike", choices: [[0, 0, 5], [1, 0, 3], [0, 1, 1]] },
  { name: "Mara of the Reef", choices: [[1, 0, 3], [1, 1, 2], [0, 0, 3]] },
  { name: "Brine Owl", choices: [[0, 0, 3], [1, 1, 2], [2, 0, 2]] },
  { name: "Kelpie", choices: [[0, 0, 4], [0, 1, 2], [1, 0, 2]] },
  { name: "Salt Wren", choices: [[1, 0, 3], [2, 0, 2], [0, 1, 2]] },
];

export interface Boat {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly sailing: boolean;
  readonly tx: number;
  readonly tz: number;
  readonly fishUntil: number;
  readonly castAt: number;
}

interface Bot {
  readonly key: Hex;
  readonly style: number;
  readonly joined: boolean;
  readonly casts: number;
  readonly postAt: number;
  readonly boat?: Boat;
}

type Log = (entry: Record<string, unknown>) => void;
type Random = () => number;

export function pickChoice(style: Style, roll: number): number {
  const total = style.choices.reduce((sum, [, , weight]) => sum + weight, 0);
  let left = roll * total;
  for (const [depth, bait, weight] of style.choices) {
    left -= weight;
    if (left < 0) return packChoice(depth, bait);
  }
  const [depth, bait] = style.choices[style.choices.length - 1]!;
  return packChoice(depth, bait);
}

export function cellOf(x: number, z: number): number {
  const col = Math.min(7, Math.max(0, Math.floor((x + CHART_HALF) / CELL_M)));
  const row = Math.min(7, Math.max(0, Math.floor((z + CHART_HALF) / CELL_M)));
  return row * 8 + col;
}

const between = (lo: number, hi: number, roll: number) => lo + (hi - lo) * roll;

/** The island sits at the origin with its coast inside about 450 m, so bots keep to a ring of open water and only sail short arcs whose chords stay off the shore. */
export function nextSpot(x: number, z: number, random: Random): { x: number; z: number } {
  const angle = Math.atan2(z, x) + (random() * 2 - 1) * TURN_ARC;
  const radius = between(OPEN_WATER_FROM, OPEN_WATER_TO, random());
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

export function stepBoat(boat: Boat, dt: number, now: number, random: Random): Boat {
  if (!boat.sailing) {
    if (now < boat.fishUntil) return boat;
    const spot = nextSpot(boat.x, boat.z, random);
    return { ...boat, sailing: true, tx: spot.x, tz: spot.z };
  }
  const dx = boat.tx - boat.x;
  const dz = boat.tz - boat.z;
  const left = Math.hypot(dx, dz);
  if (left <= ARRIVE_M) return { ...boat, sailing: false, fishUntil: now + between(...FISH_FOR_S, random()) * 1000, castAt: now + between(...CAST_GAP_S, random()) * 1000 };
  const move = Math.min(left, SAIL_SPEED * dt);
  return { ...boat, x: boat.x + (dx / left) * move, z: boat.z + (dz / left) * move, yaw: Math.atan2(-dz, dx) };
}

function firstBoat(index: number, random: Random): Boat {
  const angle = (index / STYLES.length) * Math.PI * 2 + random() * 0.5;
  const radius = between(OPEN_WATER_FROM + 100, OPEN_WATER_TO - 100, random());
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return { x, z, yaw: random() * Math.PI * 2, sailing: false, tx: x, tz: z, fishUntil: 0, castAt: 0 };
}

/** The keys are the only thing that ties a bot to its score on chain, so a broken file is set aside rather than overwritten with fresh keys. */
function loadBots(file: string, log: Log): Bot[] | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Bot[];
    return raw.filter((bot) => KEY_PATTERN.test(bot.key) && STYLES[bot.style] !== undefined);
  } catch (error) {
    renameSync(file, `${file}.broken-${Date.now()}`);
    log({ event: "anglers-reset", error: String(error).slice(0, 160) });
    return null;
  }
}

/** Earlier bots fished on a timer with nobody at sea and piled up scores no person could match, so their keys are kept only to hide their rows. */
function loadRetired(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { key: string }[];
    return new Set(raw.filter((bot) => KEY_PATTERN.test(bot.key)).map((bot) => privateKeyToAccount(bot.key as Hex).address.toLowerCase()));
  } catch {
    return new Set();
  }
}

export function createAnglers(file: string, chain: Chain, keeper: ReturnType<typeof privateKeyToAccount>, presence: Presence, log: Log, random: Random = Math.random) {
  const fresh = (): Bot[] => STYLES.map((_, style) => ({ key: generatePrivateKey(), style, joined: false, casts: 0, postAt: Math.round(between(...POST_AFTER, random())) }));
  let bots: Bot[] = (loadBots(file, log) ?? fresh()).map((bot, i) => ({ ...bot, boat: bot.boat ?? firstBoat(i, random) }));
  const persist = () => {
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(bots), { mode: 0o600 });
    renameSync(temp, file);
  };
  persist();
  const accounts = bots.map((bot) => privateKeyToAccount(bot.key));
  const names = new Map(accounts.map((account, i) => [account.address.toLowerCase(), STYLES[bots[i]!.style]!.name]));
  const boatIds = accounts.map((account) => account.address.slice(2, 18).toLowerCase());
  const ownIds = new Set(boatIds);
  const retired = loadRetired(file.replace(/\.json$/, ".retired.json"));
  let busy = false;
  let lastStep = Date.now();
  let lastSave = 0;

  const update = (index: number, change: Partial<Bot>) => {
    bots = bots.map((bot, i) => (i === index ? { ...bot, ...change } : bot));
  };

  /** Public nodes lag each other, so right after the keeper pays, the node that takes the cast can still see the old balance; the bot waits until its balance shows up. */
  async function fund(address: Hex) {
    if ((await chain.publicClient.getBalance({ address })) >= FUND_FLOOR_WEI) return;
    await chain.pay(keeper, address, FUND_WEI);
    log({ event: "angler-funded", address });
    for (let i = 0; i < FUND_CHECKS; i++) {
      if ((await chain.publicClient.getBalance({ address })) >= FUND_FLOOR_WEI) return;
      await new Promise((resolve) => setTimeout(resolve, FUND_CHECK_MS));
    }
  }

  async function cast(index: number) {
    const bot = bots[index]!;
    const style = STYLES[bot.style]!;
    const account = accounts[index]!;
    await fund(account.address);
    if (!bot.joined) {
      const player = await chain.read<Hex>("playerOf", [account.address]);
      if (/^0x0{40}$/i.test(player)) await chain.send(account, "join", [account.address, "0x"], SEA.joinGas);
      update(index, { joined: true });
    }
    const cell = cellOf(bot.boat!.x, bot.boat!.z);
    const enc = await chain.sdk.encrypt({ values: [{ type: "euint8", value: BigInt(pickChoice(style, random())) }], contractAddress: chain.table, userAddress: account.address });
    await chain.send(account, "cast", [cell, enc.encryptedValues[0], enc.inputProof], SEA.castGas);
    const casts = bots[index]!.casts + 1;
    log({ event: "angler-cast", name: style.name, cell });
    if (casts < bots[index]!.postAt) return update(index, { casts });
    const [, , posting] = await chain.read<readonly [Hex, number, boolean, number, bigint]>("anglerInfo", [account.address]);
    if (!posting) {
      await chain.send(account, "postScore", [style.name], SEA.postGas);
      log({ event: "angler-posted", name: style.name });
    }
    update(index, { casts: 0, postAt: Math.round(between(...POST_AFTER, random())) });
  }

  const peopleOnline = (now: number) => presence.ids(now).some((id) => !ownIds.has(id));

  function show(now: number) {
    bots.forEach((bot, i) => presence.update({ id: boatIds[i], name: `${STYLES[bot.style]!.name}${NAME_SUFFIX}`, x: bot.boat!.x, y: 0, z: bot.boat!.z, yaw: bot.boat!.yaw, t: (now % CLOCK_WRAP_MS) / 1000 }, now));
  }

  function maybeCast(now: number) {
    if (busy) return;
    const ready = bots.findIndex((bot) => !bot.boat!.sailing && bot.boat!.castAt <= now && bot.boat!.fishUntil > now);
    if (ready < 0) return;
    update(ready, { boat: { ...bots[ready]!.boat!, castAt: now + between(...CAST_GAP_S, random()) * 1000 } });
    busy = true;
    void cast(ready)
      .catch((error: unknown) => log({ event: "angler-skipped", name: STYLES[bots[ready]!.style]!.name, error: String(error).slice(0, 200) }))
      .finally(() => {
        busy = false;
        persist();
      });
  }

  return {
    isBot: (player: string) => names.has(player.toLowerCase()),
    isRetired: (player: string) => retired.has(player.toLowerCase()),
    nameOf: (player: string) => names.get(player.toLowerCase()) ?? null,
    async tick() {
      const now = Date.now();
      const dt = Math.min(5, (now - lastStep) / 1000);
      lastStep = now;
      if (!peopleOnline(now)) return;
      bots = bots.map((bot) => ({ ...bot, boat: stepBoat(bot.boat!, dt, now, random) }));
      show(now);
      maybeCast(now);
      if (now - lastSave > SAVE_EVERY_MS) {
        lastSave = now;
        persist();
      }
    },
  };
}
