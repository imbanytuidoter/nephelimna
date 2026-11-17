import { Rarity } from "@nephelimna/rules";
import { describe, expect, test } from "vitest";
import { FLAGS, FLAG_PRICE } from "../src/game/flags.js";
import { PRICES, addCatch, buyFlag, buyNet, createHold, holdValue, landFish, parseHold, sellAll } from "../src/game/hold.js";
import { cellIndexAt } from "../src/game/fishing/lake.js";
import { NET } from "../src/game/fishing/net.js";
import { ROD, castDistance, createRod, flightTime, stepRod } from "../src/game/fishing/rod.js";
import { LOOT, applyLoot, rollLoot } from "../src/game/fishing/loot.js";
import { CHEST, SPECIES, difficulty, pickSpecies, rollFish } from "../src/game/fishing/species.js";
import { seeded } from "../src/game/life/random.js";

const FRAME = 1 / 60;
const idle = { held: false, pressed: false };
const press = { held: true, pressed: true };
const hold = { held: true, pressed: false };

const KEY = { [Rarity.Common]: "common", [Rarity.Uncommon]: "uncommon", [Rarity.Rare]: "rare", [Rarity.Mythic]: "mythic" };

describe("lake", () => {
  test("maps world positions to the 8 by 8 grid and rejects positions off the chart", () => {
    expect(cellIndexAt(-1599, -1599)).toBe(0);
    expect(cellIndexAt(1599, 1599)).toBe(63);
    expect(cellIndexAt(1700, 0)).toBe(-1);
  });



});

describe("rod", () => {
  const worldWith = (outcome, seed = 9) => ({ canFish: true, random: seeded(seed), resolve: () => outcome });
  const fishOf = (strength, stamina, runs = 1) => ({ caught: true, species: { name: "Test fish", rarity: "common", fight: { strength, stamina, runs } }, commit: () => {} });
  const run = (rod, world, seconds, input) => {
    const events = [];
    let state = rod;
    for (let t = 0; t < seconds; t += FRAME) {
      const next = stepRod(state, FRAME, typeof input === "function" ? input(state) : input, world);
      state = next.rod;
      events.push(...next.events);
    }
    return { rod: state, events };
  };
  const cast = (world, holdFor = 0.5) => {
    let rod = run(createRod(), world, FRAME, press).rod;
    rod = run(rod, world, holdFor, hold).rod;
    return run(rod, world, FRAME, idle);
  };
  const until = (rod, world, phase, input = idle, limit = 60) => {
    const events = [];
    let state = rod;
    for (let t = 0; t < limit && state.phase !== phase; t += FRAME) {
      const next = stepRod(state, FRAME, typeof input === "function" ? input(state) : input, world);
      state = next.rod;
      events.push(...next.events);
    }
    return { rod: state, events };
  };

  test("does not cast while the boat is under way", () => {
    const { rod, events } = run(createRod(), { ...worldWith({ caught: false }), canFish: false }, 0.1, press);
    expect(rod.phase).toBe("idle");
    expect(events).toContain("moving");
  });

  test("a longer hold throws further and the float flies longer", () => {
    const world = worldWith({ caught: false });
    const short = cast(world, 0.1).rod;
    const long = cast(world, 1.5).rod;
    expect(long.distance).toBeGreaterThan(short.distance);
    expect(long.distance).toBe(ROD.maxCast);
    expect(short.distance).toBeGreaterThanOrEqual(ROD.maxCast * ROD.minShare);
    expect(flightTime(long.distance)).toBeGreaterThan(flightTime(short.distance));
    expect(castDistance(1)).toBe(ROD.maxCast);
  });

  test("with no fish the float comes back by itself after six seconds", () => {
    const world = worldWith({ caught: false });
    const landed = until(cast(world).rod, world, "waiting").rod;
    const { rod, events } = run(landed, world, ROD.emptyWait + 0.2, idle);
    expect(events).toContain("empty");
    expect(events).not.toContain("take");
    expect(rod.phase).toBe("retrieving");
  });

  test("a cast onto land is reeled straight back", () => {
    const world = worldWith({ blocked: true });
    expect(until(cast(world).rod, world, "retrieving").events).toContain("blocked");
  });

  test("nibbles come before the take and an early press costs nothing", () => {
    let seen = false;
    for (let seed = 1; seed < 12 && !seen; seed++) {
      const world = worldWith(fishOf(0.5, 0.7), seed);
      const waiting = until(cast(world).rod, world, "waiting").rod;
      if (waiting.nibbles === 0) continue;
      seen = true;
      const eager = (rod) => (rod.phase === "waiting" && Math.floor(rod.time * 10) % 4 === 0 ? { held: false, pressed: true } : idle);
      const { rod, events } = until(waiting, world, "take", eager);
      expect(events.filter((e) => e === "nibble")).toHaveLength(waiting.nibbles);
      expect(events.indexOf("nibble")).toBeLessThan(events.indexOf("take"));
      expect(rod.phase).toBe("take");
    }
    expect(seen).toBe(true);
  });

  test("a cast beside a rise gets its take sooner", () => {
    const slow = worldWith(fishOf(0.5, 0.7), 3);
    const fast = worldWith({ ...fishOf(0.5, 0.7), shoal: true }, 3);
    const a = until(cast(slow).rod, slow, "waiting").rod;
    const b = until(cast(fast).rod, fast, "waiting").rod;
    expect(b.wait).toBeLessThan(a.wait);
  });

  test("missing the take once spooks the fish, missing twice loses it", () => {
    const world = worldWith(fishOf(0.5, 0.7));
    const take = until(cast(world).rod, world, "take").rod;
    const first = run(take, world, ROD.takeMax + 0.1, idle);
    expect(first.events).toContain("spooked");
    expect(first.rod.phase).toBe("waiting");
    const again = until(first.rod, world, "take").rod;
    const second = run(again, world, ROD.takeMax + 0.1, idle);
    expect(second.events).toContain("missed");
    expect(second.rod.phase).toBe("retrieving");
  });

  test("holding the button while waiting reels the float in", () => {
    const world = worldWith(fishOf(0.5, 0.7));
    const waiting = until(cast(world).rod, world, "waiting").rod;
    const { rod, events } = run(waiting, world, ROD.holdToRetrieve + 0.1, hold);
    expect(events).toContain("reeled");
    expect(rod.phase).toBe("retrieving");
  });

  const hook = (outcome, seed = 9) => {
    const world = worldWith(outcome, seed);
    const take = until(cast(world, 1.2).rod, world, "take").rod;
    return { world, rod: stepRod(take, FRAME, press, world).rod };
  };
  const play = (rod, world, policy, limit = 240) => {
    const events = [];
    let state = rod;
    let t = 0;
    for (; t < limit && state.phase === "fight"; t += FRAME) {
      const next = stepRod(state, FRAME, policy(state), world);
      state = next.rod;
      events.push(...next.events);
    }
    return { rod: state, events, seconds: t };
  };
  const patient = (rod) => (["run", "coil", "jump", "thrash"].includes(rod.fight.mode) || rod.fight.tension > 0.85 ? idle : hold);

  test("a weak fish can simply be reeled in", () => {
    const { world, rod } = hook(fishOf(0.4, 0.55, 0.8));
    const result = play(rod, world, () => hold);
    expect(result.events).toContain("landed");
    expect(result.events).not.toContain("snapped");
  });

  test("reeling against a strong fish's run snaps the line", () => {
    let snapped = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { world, rod } = hook(fishOf(1.4, 1.7, 1.2), seed);
      if (play(rod, world, () => hold).events.includes("snapped")) snapped++;
    }
    expect(snapped).toBeGreaterThanOrEqual(7);
  });

  test("easing off during runs lands even the strongest fish", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { world, rod } = hook(fishOf(1.4, 1.7, 1.2), seed);
      const result = play(rod, world, patient);
      expect(result.events).toContain("landed");
    }
  });

  test("every run is announced before it starts", () => {
    const { world, rod } = hook(fishOf(1.1, 1.15, 1.4));
    let state = rod;
    let warnedFor = 0;
    let pendingRun = false;
    for (let t = 0; t < 120 && state.phase === "fight"; t += FRAME) {
      const next = stepRod(state, FRAME, patient(state), world);
      for (const event of next.events) {
        if (event === "warning") {
          warnedFor = 0;
          pendingRun = true;
        }
        if (event === "run") {
          expect(pendingRun).toBe(true);
          expect(warnedFor).toBeGreaterThanOrEqual(0.7);
          pendingRun = false;
        }
      }
      warnedFor += FRAME;
      state = next.rod;
    }
  });

  test("a fish left alone takes line and is never landed", () => {
    const { world, rod } = hook(fishOf(1.1, 1.15, 1.4));
    const result = play(rod, world, () => idle, 40);
    expect(result.events).not.toContain("landed");
    expect(result.rod.fight ? result.rod.fight.line : 99).toBeGreaterThan(rod.fight.line);
  });

  test("a strong fish takes longer to land than a weak one", () => {
    const time = (outcome) => {
      const { world, rod } = hook(outcome);
      return play(rod, world, patient).seconds;
    };
    expect(time(fishOf(1.4, 1.7, 1.2))).toBeGreaterThan(time(fishOf(0.4, 0.55, 0.8)) * 1.25);
  });
});

describe("hold", () => {
  test("a net can be bought once and only with enough coins", () => {
    const poor = { ...createHold(), coins: NET.price - 1 };
    expect(buyNet(poor, NET.price).hasNet).toBe(false);
    const rich = buyNet({ ...createHold(), coins: NET.price + 5 }, NET.price);
    expect(rich).toMatchObject({ hasNet: true, coins: 5 });
    expect(buyNet(rich, NET.price).coins).toBe(5);
  });

  test("saved data is read back and damaged data falls back to an empty hold", () => {
    const saved = addCatch({ ...createHold(), coins: 40, hasNet: true }, { name: "Moon eel", rarity: "rare" });
    expect(parseHold(JSON.stringify(saved))).toEqual(saved);
    expect(parseHold("not json")).toEqual(createHold());
    expect(parseHold('{"items":[{"name":"X","rarity":"junk","count":2}],"coins":-5}')).toEqual(createHold());
  });

  test("a bigger fish of the same kind is worth more and the hold adds the values up", () => {
    let hold = addCatch(createHold(), { name: "Glass pike", rarity: "rare", value: 30 });
    hold = addCatch(hold, { name: "Glass pike", rarity: "rare", value: 55 });
    expect(hold.items).toEqual([{ name: "Glass pike", rarity: "rare", count: 2, value: 85, slug: null }]);
    expect(sellAll(hold).coins).toBe(85);
  });

  test("a twin hook doubles the next fish and is used up", () => {
    const hold = landFish({ ...createHold(), twin: 1 }, { name: "Sand dab", rarity: "common", value: 5 });
    expect(hold.items[0]).toMatchObject({ count: 2, value: 10 });
    expect(hold.twin).toBe(0);
    expect(landFish(hold, { name: "Sand dab", rarity: "common", value: 5 }).items[0].count).toBe(3);
  });
});

describe("flags", () => {
  test("a new boat flies the game flag and owns no country flags", () => {
    expect(createHold()).toMatchObject({ flag: "logo", flags: ["logo"] });
    expect(FLAGS.logo).toBeDefined();
    expect(Object.keys(FLAGS).length).toBeGreaterThan(15);
  });

  test("a country flag costs coins once, then can be raised again for free", () => {
    const poor = buyFlag({ ...createHold(), coins: FLAG_PRICE - 1 }, "ua", FLAG_PRICE);
    expect(poor.flag).toBe("logo");
    const bought = buyFlag({ ...createHold(), coins: FLAG_PRICE + 10 }, "ua", FLAG_PRICE);
    expect(bought).toMatchObject({ flag: "ua", coins: 10, flags: ["logo", "ua"] });
    const back = buyFlag(bought, "logo", FLAG_PRICE);
    expect(back).toMatchObject({ flag: "logo", coins: 10 });
    expect(buyFlag(back, "ua", FLAG_PRICE)).toMatchObject({ flag: "ua", coins: 10 });
  });

  test("saved flags are read back and a flag that was never bought is not flown", () => {
    const saved = buyFlag({ ...createHold(), coins: 100 }, "pl", FLAG_PRICE);
    expect(parseHold(JSON.stringify(saved))).toEqual(saved);
    expect(parseHold('{"flag":"us","flags":["logo"]}').flag).toBe("logo");
  });
});

describe("catch rolls", () => {
  test("every roll is a known species of the right rarity with a size inside its range", () => {
    const random = seeded(12);
    for (const [rarity, key] of Object.entries(KEY)) {
      for (let i = 0; i < 200; i++) {
        const fish = rollFish(Number(rarity), random);
        const kind = SPECIES[key].find((s) => s.name === fish.name);
        expect(kind).toBeDefined();
        expect(fish.rarity).toBe(key);
        expect(fish.kg).toBeGreaterThanOrEqual(Math.floor(kind.kg[0] * 100) / 100);
        expect(fish.kg).toBeLessThanOrEqual(kind.kg[1]);
        expect(fish.value).toBeGreaterThanOrEqual(Math.round(PRICES[key] * 0.7));
        expect(fish.value).toBeLessThanOrEqual(Math.round(PRICES[key] * 1.6));
      }
    }
  });

  test("the rolls vary: several species and sizes come up", () => {
    const random = seeded(3);
    const names = new Set();
    const values = new Set();
    for (let i = 0; i < 60; i++) {
      const fish = rollFish(Rarity.Common, random);
      names.add(fish.name);
      values.add(fish.value);
    }
    expect(names.size).toBeGreaterThanOrEqual(4);
    expect(values.size).toBeGreaterThanOrEqual(3);
  });
});

describe("species table", () => {
  test("drop weights decide how often each species comes up", () => {
    const random = seeded(21);
    const seen = {};
    for (let i = 0; i < 4000; i++) {
      const name = pickSpecies("common", random()).name;
      seen[name] = (seen[name] ?? 0) + 1;
    }
    const total = SPECIES.common.reduce((sum, kind) => sum + kind.weight, 0);
    for (const kind of SPECIES.common) expect(seen[kind.name] / 4000).toBeCloseTo(kind.weight / total, 1);
    expect(seen["Harbour herring"]).toBeGreaterThan(seen["Speckled crappie"] * 2);
  });

  test("weights in every rarity add up to 100", () => {
    for (const list of Object.values(SPECIES)) expect(list.reduce((sum, kind) => sum + kind.weight, 0)).toBe(100);
  });

  test("rarer fish are harder to land", () => {
    const hardest = (key) => Math.max(...SPECIES[key].map(difficulty));
    const easiest = (key) => Math.min(...SPECIES[key].map(difficulty));
    expect(easiest("common")).toBe(1);
    expect(hardest("mythic")).toBe(5);
    expect(hardest("common")).toBeLessThanOrEqual(easiest("rare"));
    expect(hardest("uncommon")).toBeLessThanOrEqual(hardest("rare"));
  });

  test("a bigger fish of the same species fights harder", () => {
    const random = seeded(4);
    const rolls = Array.from({ length: 300 }, () => rollFish(Rarity.Rare, random)).filter((f) => f.name === "Marsh bowfin");
    const small = rolls.reduce((a, b) => (a.kg < b.kg ? a : b));
    const large = rolls.reduce((a, b) => (a.kg > b.kg ? a : b));
    expect(large.fight.strength).toBeGreaterThan(small.fight.strength);
  });

});

describe("sunken chest", () => {
  test("gives coins, twin hooks or a net, and never a second net", () => {
    const random = seeded(8);
    const kinds = new Set();
    for (let i = 0; i < 300; i++) {
      const loot = rollLoot(random, { ...createHold(), hasNet: true });
      kinds.add(loot.kind);
      expect(loot.kind).not.toBe("net");
      if (loot.kind === "coins") expect(loot.coins).toBeGreaterThanOrEqual(LOOT.coins[0]);
    }
    expect(kinds).toEqual(new Set(["coins", "twin"]));
    let sawNet = false;
    for (let i = 0; i < 300; i++) sawNet ||= rollLoot(random, createHold()).kind === "net";
    expect(sawNet).toBe(true);
  });

  test("loot lands in the hold", () => {
    const base = createHold();
    expect(applyLoot(base, { kind: "coins", coins: 70 }).coins).toBe(70);
    expect(applyLoot(base, { kind: "twin", twin: 3 }).twin).toBe(3);
    expect(applyLoot(base, { kind: "net" }).hasNet).toBe(true);
    expect(holdValue(applyLoot(base, { kind: "coins", coins: 70 }))).toBe(0);
    expect(CHEST.rarity).toBe("chest");
  });
});

describe("sealed casts", () => {
  const flyTo = (world) => {
    let rod = { ...createRod(), phase: "flying", distance: 10, time: 5 };
    const step = stepRod(rod, 0.016, { held: false, pressed: false }, world);
    return step;
  };
  const base = { canFish: true, random: () => 0.5 };

  test("the float waits for the chain answer and something nibbles while it waits", () => {
    let answer = null;
    const world = { ...base, resolve: () => ({ pending: true }), verdict: () => answer, leave: () => null };
    let { rod, events } = flyTo(world);
    expect(events).toEqual(["splash"]);
    expect(rod.pending).toBe(true);
    let nibbles = 0;
    for (let i = 0; i < 600; i++) {
      ({ rod, events } = stepRod(rod, 0.016, { held: false, pressed: false }, world));
      nibbles += events.filter((event) => event === "nibble").length;
    }
    expect(rod.phase).toBe("waiting");
    expect(nibbles).toBeGreaterThanOrEqual(2);
    answer = { caught: true, shoal: false, species: { name: "x", fight: { strength: 1, stamina: 1, runs: 1 } }, commit: () => null };
    ({ rod, events } = stepRod(rod, 0.016, { held: false, pressed: false }, world));
    expect(events).toEqual(["answered"]);
    expect(rod.pending).toBe(false);
    expect(rod.catch.species.name).toBe("x");
    expect(Number.isFinite(rod.wait)).toBe(true);
  });

  test("holding the button leaves the sealed line out and frees the rod", () => {
    let left = 0;
    const world = { ...base, resolve: () => ({ pending: true }), verdict: () => null, leave: () => left++ };
    let { rod } = flyTo(world);
    let events = [];
    for (let i = 0; i < 60 && rod.phase === "waiting"; i++) ({ rod, events } = stepRod(rod, 0.016, { held: true, pressed: false }, world));
    expect(events).toEqual(["line-left"]);
    expect(rod.phase).toBe("retrieving");
    expect(rod.pending).toBe(false);
    expect(left).toBe(1);
  });

  test("a slow chain answer leaves the line out on its own so nobody waits for long", () => {
    let left = 0;
    const world = { ...base, resolve: () => ({ pending: true }), verdict: () => null, leave: () => left++ };
    let { rod } = flyTo(world);
    let events = [];
    for (let t = 0; t < ROD.sealedHold + 1 && rod.phase === "waiting"; t += 0.1) ({ rod, events } = stepRod(rod, 0.1, { held: false, pressed: false }, world));
    expect(events).toEqual(["line-left"]);
    expect(left).toBe(1);
    expect(rod.phase).toBe("retrieving");
  });

  test("an empty, netted or failed answer reels the line in with its own message", () => {
    for (const event of ["empty", "snagged", "chain-failed"]) {
      const world = { ...base, resolve: () => ({ pending: true }), verdict: () => ({ caught: false, event }) };
      const { rod } = flyTo(world);
      const step = stepRod(rod, 0.016, { held: false, pressed: false }, world);
      expect(step.events).toEqual([event]);
      expect(step.rod.phase).toBe("retrieving");
    }
  });

  test("a cast with no casts left never leaves the boat", () => {
    const step = flyTo({ ...base, resolve: () => ({ blocked: true, event: "no-casts" }) });
    expect(step.events).toEqual(["no-casts"]);
    expect(step.rod.phase).toBe("retrieving");
  });
});
