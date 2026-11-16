import { describe, expect, test } from "vitest";
import { addCatch, createHold, holdValue, openChest, parseHold, sellKind, stowChest } from "../src/game/hold.js";
import { applyLoot } from "../src/game/fishing/loot.js";

const carp = { name: "Bronze carp", rarity: "common", slug: "carp" };
const gar = { name: "Iron gar", rarity: "mythic", slug: "gar" };

describe("hold", () => {
  test("keeps the picture slug of a caught fish", () => {
    const hold = addCatch(createHold(), carp);
    expect(hold.items[0].slug).toBe("carp");
  });

  test("sells one kind of fish and keeps the rest", () => {
    let hold = addCatch(addCatch(addCatch(createHold(), carp), carp), gar);
    hold = sellKind(hold, "Bronze carp", "common");
    expect(hold.coins).toBe(12);
    expect(hold.items.map((item) => item.name)).toEqual(["Iron gar"]);
    expect(holdValue(hold)).toBe(300);
  });

  test("selling a kind that is not in the hold changes nothing", () => {
    const hold = addCatch(createHold(), carp);
    expect(sellKind(hold, "Iron gar", "mythic")).toBe(hold);
  });

  test("stows a chest unopened and opens it later with its loot", () => {
    const stowed = stowChest(createHold());
    expect(stowed.chests).toBe(1);
    const opened = openChest(stowed, { kind: "coins", coins: 120 }, applyLoot);
    expect(opened.chests).toBe(0);
    expect(opened.coins).toBe(120);
  });

  test("cannot open a chest when there is none", () => {
    const hold = createHold();
    expect(openChest(hold, { kind: "coins", coins: 120 }, applyLoot)).toBe(hold);
  });

  test("restores chests and slugs from a save and drops bad values", () => {
    const hold = parseHold(JSON.stringify({ items: [{ name: "Bronze carp", rarity: "common", count: 2, value: 12, slug: "carp" }], chests: 3 }));
    expect(hold.chests).toBe(3);
    expect(hold.items[0].slug).toBe("carp");
    expect(parseHold(JSON.stringify({ chests: -2 })).chests).toBe(0);
    expect(parseHold(JSON.stringify({ items: [{ name: "x", rarity: "common", count: 1, slug: "../evil" }] })).items[0].slug).toBeNull();
  });
});

describe("fish pictures", () => {
  test("old saves without a slug still find the picture by name", async () => {
    const { pictureSlug } = await import("../src/game/fishing/species.js");
    expect(pictureSlug({ name: "Bronze carp" })).toBe("carp");
    expect(pictureSlug({ name: "Leviathan" })).toBe("gar");
    expect(pictureSlug({ name: "Nobody" })).toBeNull();
  });
});
