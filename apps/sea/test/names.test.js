import { describe, expect, test } from "vitest";
import { boatName, cleanName } from "../src/game/names.js";
import { keepKeysInside } from "../src/game/rename.js";

describe("boat names", () => {
  test("the same presence id always gives the same two-word name", () => {
    expect(boatName("6856bd000abc467a")).toBe(boatName("6856bd000abc467a"));
    expect(boatName("6856bd000abc467a").split(" ")).toHaveLength(2);
  });

  test("different ids usually give different names", () => {
    const ids = Array.from({ length: 40 }, (_, i) => i.toString(16).padStart(16, "0").replace(/^0/, "a"));
    expect(new Set(ids.map(boatName)).size).toBeGreaterThan(30);
  });

  test("a malformed id still gets a name instead of throwing", () => {
    expect(boatName("")).toMatch(/\S+ \S+/);
  });

  test("chosen names follow the same rules as the server", () => {
    expect(cleanName("  Old   Salt ")).toBe("Old Salt");
    expect(cleanName("Мала Щука")).toBe("Мала Щука");
    expect(cleanName("O'Neil-2")).toBe("O'Neil-2");
    expect(cleanName("x")).toBeNull();
    expect(cleanName("a".repeat(21))).toBeNull();
    expect(cleanName("<b>hi</b>")).toBeNull();
    expect(cleanName("http://spam.io")).toBeNull();
  });

  test("typing in a dialog does not reach the game keys", () => {
    const handlers = {};
    keepKeysInside({ addEventListener: (type, handler) => (handlers[type] = handler) });
    let stopped = 0;
    handlers.keydown({ stopPropagation: () => (stopped += 1) });
    handlers.keyup({ stopPropagation: () => (stopped += 1) });
    expect(stopped).toBe(2);
  });
});
