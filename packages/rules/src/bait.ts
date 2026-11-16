import { Rarity } from "./lake.js";

export const Bait = { Worm: 0, Spoon: 1, LiveFish: 2 } as const;
export type Bait = (typeof Bait)[keyof typeof Bait];

export const POINTS: Readonly<Record<Rarity, number>> = {
  [Rarity.None]: 0,
  [Rarity.Common]: 1,
  [Rarity.Uncommon]: 3,
  [Rarity.Rare]: 8,
  [Rarity.Mythic]: 25,
};

export const LEVIATHAN_POINTS = 100;

const BITES: Readonly<Record<Bait, readonly Rarity[]>> = {
  [Bait.Worm]: [Rarity.Common, Rarity.Uncommon],
  [Bait.Spoon]: [Rarity.Uncommon, Rarity.Rare, Rarity.Mythic],
  [Bait.LiveFish]: [Rarity.Mythic],
};

export function bites(bait: Bait, rarity: Rarity): boolean {
  return BITES[bait].includes(rarity);
}
