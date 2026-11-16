export const PRICES = { common: 6, uncommon: 14, rare: 38, mythic: 300 };

const SLUG = /^[a-z0-9-]{1,32}$/;
const cleanSlug = (slug) => (typeof slug === "string" && SLUG.test(slug) ? slug : null);

export function createHold() {
  return { items: [], coins: 0, hasNet: false, twin: 0, chests: 0, flags: ["logo"], flag: "logo" };
}

export function addCatch(hold, entry) {
  if (PRICES[entry.rarity] === undefined) throw new Error(`unknown rarity: ${entry.rarity}`);
  const value = entry.value ?? PRICES[entry.rarity];
  const found = hold.items.find((item) => item.name === entry.name && item.rarity === entry.rarity);
  const items = found
    ? hold.items.map((item) => (item === found ? { ...item, count: item.count + 1, value: item.value + value } : item))
    : [...hold.items, { name: entry.name, rarity: entry.rarity, count: 1, value, slug: cleanSlug(entry.slug) }];
  return { ...hold, items };
}

export function landFish(hold, entry) {
  const once = addCatch(hold, entry);
  if (hold.twin <= 0) return once;
  return { ...addCatch(once, entry), twin: hold.twin - 1 };
}

export function holdValue(hold) {
  return hold.items.reduce((sum, item) => sum + item.value, 0);
}

export function sellAll(hold) {
  return { ...hold, items: [], coins: hold.coins + holdValue(hold) };
}

export function sellKind(hold, name, rarity) {
  const found = hold.items.find((item) => item.name === name && item.rarity === rarity);
  if (!found) return hold;
  return { ...hold, items: hold.items.filter((item) => item !== found), coins: hold.coins + found.value };
}

export function stowChest(hold) {
  return { ...hold, chests: hold.chests + 1 };
}

export function openChest(hold, loot, apply) {
  if (hold.chests <= 0) return hold;
  return apply({ ...hold, chests: hold.chests - 1 }, loot);
}

export function buyNet(hold, price) {
  if (hold.hasNet || hold.coins < price) return hold;
  return { ...hold, coins: hold.coins - price, hasNet: true };
}

export function buyFlag(hold, id, price) {
  if (hold.flags.includes(id)) return { ...hold, flag: id };
  if (hold.coins < price) return hold;
  return { ...hold, coins: hold.coins - price, flags: [...hold.flags, id], flag: id };
}

const wholeNumber = (v) => Number.isInteger(v) && v >= 0;

export function parseHold(text) {
  try {
    const raw = JSON.parse(text);
    const items = Array.isArray(raw.items)
      ? raw.items.filter((item) => typeof item.name === "string" && PRICES[item.rarity] !== undefined && Number.isInteger(item.count) && item.count > 0)
      : [];
    return {
      items: items.map(({ name, rarity, count, value, slug }) => ({ name, rarity, count, value: wholeNumber(value) ? value : PRICES[rarity] * count, slug: cleanSlug(slug) })),
      coins: wholeNumber(raw.coins) ? raw.coins : 0,
      hasNet: raw.hasNet === true,
      twin: wholeNumber(raw.twin) ? raw.twin : 0,
      chests: wholeNumber(raw.chests) ? raw.chests : 0,
      flags: [...new Set(["logo", ...(Array.isArray(raw.flags) ? raw.flags.filter((id) => typeof id === "string") : [])])],
      flag: typeof raw.flag === "string" && Array.isArray(raw.flags) && raw.flags.includes(raw.flag) ? raw.flag : "logo",
    };
  } catch {
    return createHold();
  }
}
