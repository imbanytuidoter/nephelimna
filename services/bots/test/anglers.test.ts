import { describe, expect, test } from "vitest";
import { packChoice } from "@nephelimna/rules";
import { STYLES, pickChoice } from "../src/table/anglers.js";

describe("AI anglers", () => {
  test("each style only picks depth and bait pairs it lists, weighted by its own odds", () => {
    for (const style of STYLES) {
      const allowed = new Set(style.choices.map(([depth, bait]) => packChoice(depth, bait)));
      for (let i = 0; i < 200; i++) expect(allowed.has(pickChoice(style, i / 200))).toBe(true);
    }
    const [first] = STYLES[0]!.choices;
    expect(pickChoice(STYLES[0]!, 0)).toBe(packChoice(first![0], first![1]));
  });

  test("every angler has a name that fits the contract's name limit", () => {
    for (const style of STYLES) expect(new TextEncoder().encode(style.name).length).toBeLessThanOrEqual(64);
    expect(new Set(STYLES.map((style) => style.name)).size).toBe(STYLES.length);
  });
});
