import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { SEA, packChoice } from "@nephelimna/rules";
import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Chain } from "./chain.js";

const KEY_PATTERN = /^0x[0-9a-f]{64}$/;
const FUND_FLOOR_WEI = 3_000_000_000_000_000n;
const FUND_WEI = 10_000_000_000_000_000n;
const MIN_GAP_MS = 240_000;
const GAP_SPREAD_MS = 420_000;
const POST_AFTER = [6, 12] as const;
const FIRST_POST = [2, 3] as const;
const START_SPREAD_MS = 180_000;
const FUND_CHECKS = 10;
const FUND_CHECK_MS = 3000;

interface Style {
  readonly name: string;
  readonly choices: readonly (readonly [depth: number, bait: number, weight: number])[];
}

export const STYLES: readonly Style[] = [
  { name: "Old Pike", choices: [[0, 0, 5], [1, 0, 3], [1, 1, 1]] },
  { name: "Mara of the Reef", choices: [[1, 1, 4], [2, 1, 3], [0, 0, 2]] },
  { name: "Brine Owl", choices: [[2, 1, 4], [2, 2, 2], [1, 1, 2]] },
  { name: "Kelpie", choices: [[0, 0, 3], [0, 1, 2], [1, 0, 3]] },
  { name: "Salt Wren", choices: [[2, 2, 3], [2, 1, 3], [1, 1, 1]] },
];

interface Bot {
  readonly key: Hex;
  readonly style: number;
  readonly joined: boolean;
  readonly casts: number;
  readonly postAt: number;
  readonly nextAt: number;
}

type Log = (entry: Record<string, unknown>) => void;

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

const between = (lo: number, hi: number, roll: number) => Math.round(lo + (hi - lo) * roll);

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

export function createAnglers(file: string, chain: Chain, keeper: ReturnType<typeof privateKeyToAccount>, log: Log, random = Math.random) {
  const now = Date.now();
  let bots: Bot[] =
    loadBots(file, log) ??
    STYLES.map((_, style) => ({ key: generatePrivateKey(), style, joined: false, casts: 0, postAt: between(...FIRST_POST, random()), nextAt: now + random() * START_SPREAD_MS }));
  const persist = () => {
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(bots), { mode: 0o600 });
    renameSync(temp, file);
  };
  persist();
  const names = new Map(bots.map((bot) => [privateKeyToAccount(bot.key).address.toLowerCase(), STYLES[bot.style]!.name]));
  const update = (index: number, change: Partial<Bot>) => {
    bots = bots.map((bot, i) => (i === index ? { ...bot, ...change } : bot));
    persist();
  };

  /** Public nodes lag each other, so right after the keeper pays, the node that takes the cast can still see the old balance; the bot waits until its balance shows up. */
  async function fund(address: Hex) {
    const balance = await chain.publicClient.getBalance({ address });
    if (balance >= FUND_FLOOR_WEI) return;
    await chain.pay(keeper, address, FUND_WEI);
    log({ event: "angler-funded", address });
    for (let i = 0; i < FUND_CHECKS; i++) {
      if ((await chain.publicClient.getBalance({ address })) >= FUND_FLOOR_WEI) return;
      await new Promise((resolve) => setTimeout(resolve, FUND_CHECK_MS));
    }
  }

  async function turn(index: number) {
    const bot = bots[index]!;
    const style = STYLES[bot.style]!;
    const account = privateKeyToAccount(bot.key);
    await fund(account.address);
    if (!bot.joined) {
      const player = await chain.read<Hex>("playerOf", [account.address]);
      if (/^0x0{40}$/i.test(player)) await chain.send(account, "join", [account.address, "0x"], SEA.joinGas);
      update(index, { joined: true });
    }
    const cell = Math.floor(random() * SEA.cells);
    const enc = await chain.sdk.encrypt({ values: [{ type: "euint8", value: BigInt(pickChoice(style, random())) }], contractAddress: chain.table, userAddress: account.address });
    await chain.send(account, "cast", [cell, enc.encryptedValues[0], enc.inputProof], SEA.castGas);
    const casts = bot.casts + 1;
    log({ event: "angler-cast", name: style.name, cell });
    if (casts < bot.postAt) return update(index, { casts });
    const [, , posting] = await chain.read<readonly [Hex, number, boolean, number, bigint]>("anglerInfo", [account.address]);
    if (!posting) {
      await chain.send(account, "postScore", [style.name], SEA.postGas);
      log({ event: "angler-posted", name: style.name });
    }
    update(index, { casts: 0, postAt: between(...POST_AFTER, random()) });
  }

  return {
    isBot: (player: string) => names.has(player.toLowerCase()),
    nameOf: (player: string) => names.get(player.toLowerCase()) ?? null,
    async tick() {
      const ready = bots.findIndex((bot) => bot.nextAt <= Date.now());
      if (ready < 0) return;
      update(ready, { nextAt: Date.now() + MIN_GAP_MS + random() * GAP_SPREAD_MS });
      try {
        await turn(ready);
      } catch (error) {
        log({ event: "angler-skipped", name: STYLES[bots[ready]!.style]!.name, error: String(error).slice(0, 200) });
      }
    },
  };
}
