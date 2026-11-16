import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSaves } from "../src/table/saves.js";

const KEY = "0123456789abcdef0123456789abcdef";
const DATA = JSON.stringify({ hold: "{}", session: "{}" });

describe("saves", () => {
  it("stores and returns a save by its code", () => {
    const saves = createSaves(null);
    expect(saves.put(KEY, DATA, 1)).toBe(true);
    expect(saves.get(KEY)).toBe(DATA);
    expect(saves.get("f".repeat(32))).toBeNull();
  });

  it("rejects bad codes, non json and oversized data", () => {
    const saves = createSaves(null);
    expect(saves.put("short", DATA, 1)).toBe(false);
    expect(saves.put(KEY, "not json", 1)).toBe(false);
    expect(saves.put(KEY, JSON.stringify("x".repeat(13_000)), 1)).toBe(false);
    expect(saves.put(KEY, 5, 1)).toBe(false);
  });

  it("survives a restart and never writes the code itself to disk", () => {
    const file = join(mkdtempSync(join(tmpdir(), "saves-")), "saves.json");
    createSaves(file).put(KEY, DATA, 1);
    expect(createSaves(file).get(KEY)).toBe(DATA);
    expect(readFileSync(file, "utf8")).not.toContain(KEY);
  });
});
