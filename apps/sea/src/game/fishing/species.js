import { Rarity } from "@nephelimna/rules";
import { PRICES } from "../hold.js";

export const RARITY_KEY = {
  [Rarity.Common]: "common",
  [Rarity.Uncommon]: "uncommon",
  [Rarity.Rare]: "rare",
  [Rarity.Mythic]: "mythic",
};

export const SPECIES = {
  common: [
    { name: "Harbour herring", slug: "herring", weight: 30, kg: [0.1, 0.5], cm: [18, 32], strength: 0.4, stamina: 0.55, runs: 0.8 },
    { name: "Bronze carp", slug: "carp", weight: 24, kg: [0.8, 4.5], cm: [30, 62], strength: 0.55, stamina: 0.7, runs: 0.9 },
    { name: "Grey drum", slug: "drum", weight: 20, kg: [0.5, 3.2], cm: [28, 55], strength: 0.5, stamina: 0.8, runs: 0.7 },
    { name: "Silver bass", slug: "whitebass", weight: 16, kg: [0.3, 1.6], cm: [24, 42], strength: 0.65, stamina: 0.7, runs: 1.3 },
    { name: "Speckled crappie", slug: "crappie", weight: 10, kg: [0.2, 1.2], cm: [20, 38], strength: 0.7, stamina: 0.85, runs: 1.0 },
  ],
  uncommon: [
    { name: "Tide bass", slug: "striped", weight: 34, kg: [1.0, 7], cm: [40, 85], strength: 0.7, stamina: 0.85, runs: 1.0 },
    { name: "Amber trout", slug: "browntrout", weight: 28, kg: [0.5, 4], cm: [30, 68], strength: 0.75, stamina: 0.95, runs: 0.9 },
    { name: "Reed bass", slug: "largemouth", weight: 24, kg: [0.6, 4.5], cm: [28, 60], strength: 0.85, stamina: 0.9, runs: 1.1 },
    { name: "Ember sunfish", slug: "pumpkinseed", weight: 14, kg: [0.1, 0.6], cm: [12, 26], strength: 0.95, stamina: 1.05, runs: 1.3 },
  ],
  rare: [
    { name: "Sail grayling", slug: "grayling", weight: 45, kg: [0.6, 2.4], cm: [32, 58], strength: 0.9, stamina: 1.1, runs: 0.9 },
    { name: "Marsh bowfin", slug: "bowfin", weight: 35, kg: [1.5, 7], cm: [45, 90], strength: 1.1, stamina: 1.15, runs: 1.4 },
    { name: "Mottled catfish", slug: "flathead", weight: 20, kg: [4, 30], cm: [60, 130], strength: 1.15, stamina: 1.35, runs: 1.0 },
  ],
  mythic: [
    { name: "Iron gar", slug: "gar", weight: 65, kg: [20, 90], cm: [130, 250], strength: 1.25, stamina: 1.45, runs: 1.1 },
    { name: "Fog paddlefish", slug: "paddlefish", weight: 35, kg: [25, 70], cm: [140, 220], strength: 1.4, stamina: 1.7, runs: 1.2 },
  ],
};

export const CHEST = { name: "Sunken chest", slug: "chest", rarity: "chest", fight: { strength: 0.9, stamina: 1.25, runs: 0.7 } };

export const LEVIATHAN = { name: "Leviathan", slug: "gar", rarity: "mythic", kg: 412, cm: 640, stars: 5, trophy: true, value: 2000, fight: { strength: 1.6, stamina: 1.9, runs: 1.2 } };

export const FIGHT = {
  common: { strength: 0.55, stamina: 0.7, runs: 1 },
  uncommon: { strength: 0.75, stamina: 0.9, runs: 1 },
  rare: { strength: 1.0, stamina: 1.15, runs: 1 },
  mythic: { strength: 1.3, stamina: 1.5, runs: 1 },
  chest: CHEST.fight,
};

const SIZE_VALUE = { small: 0.7, large: 1.6 };
const SIZE_FIGHT = 0.25;

export function difficulty(kind) {
  return Math.max(1, Math.min(5, Math.round((kind.strength * kind.stamina * (0.6 + 0.4 * kind.runs)) / 0.42)));
}

export function pickSpecies(key, roll) {
  const list = SPECIES[key];
  const total = list.reduce((sum, kind) => sum + kind.weight, 0);
  let mark = roll * total;
  for (const kind of list) {
    mark -= kind.weight;
    if (mark < 0) return kind;
  }
  return list[list.length - 1];
}

export function rollFish(rarity, random) {
  const key = RARITY_KEY[rarity];
  const kind = pickSpecies(key, random());
  const size = random() ** 1.6;
  const kg = kind.kg[0] + (kind.kg[1] - kind.kg[0]) * size;
  const cm = kind.cm[0] + (kind.cm[1] - kind.cm[0]) * Math.cbrt(size);
  const boost = 1 + SIZE_FIGHT * size;
  return {
    name: kind.name,
    slug: kind.slug,
    rarity: key,
    kg: kg < 1 ? Math.round(kg * 100) / 100 : Math.round(kg * 10) / 10,
    cm: Math.round(cm),
    trophy: size > 0.8,
    stars: difficulty(kind),
    fight: { strength: kind.strength * boost, stamina: kind.stamina * boost, runs: kind.runs },
    value: Math.max(1, Math.round(PRICES[key] * (SIZE_VALUE.small + (SIZE_VALUE.large - SIZE_VALUE.small) * size))),
  };
}

export function pictureSlug(item) {
  if (item.slug) return item.slug;
  if (item.name === LEVIATHAN.name) return LEVIATHAN.slug;
  return Object.values(SPECIES).flat().find((fish) => fish.name === item.name)?.slug ?? null;
}
