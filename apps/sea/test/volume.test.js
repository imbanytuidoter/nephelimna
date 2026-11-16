import { afterEach, describe, expect, test, vi } from "vitest";
import { createVolume, levelName } from "../src/game/volume.js";

function node() {
  const listeners = new Map();
  return {
    dataset: {},
    value: "",
    attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    fire(type) { for (const fn of listeners.get(type) ?? []) fn({ stopPropagation() {} }); },
    blur() {},
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("volume control", () => {
  test("the speaker icon shows off, low or high", () => {
    expect(levelName(0)).toBe("off");
    expect(levelName(0.2)).toBe("low");
    expect(levelName(0.8)).toBe("high");
  });

  test("dragging sets the level, the speaker mutes, and a second tap brings back the level from before", () => {
    const nodes = { volume: node(), "volume-toggle": node(), "volume-range": node() };
    vi.stubGlobal("document", { getElementById: (id) => nodes[id] });
    let level = 1;
    const audio = { get volume() { return level; }, setVolume: (v) => (level = Math.min(1, Math.max(0, v))) };
    createVolume({ audio });
    const range = nodes["volume-range"];
    const toggle = nodes["volume-toggle"];
    expect(range.value).toBe("100");
    range.value = "35";
    range.fire("input");
    expect(level).toBeCloseTo(0.35);
    expect(nodes.volume.dataset.level).toBe("low");
    toggle.fire("click");
    expect(level).toBe(0);
    expect(range.value).toBe("0");
    expect(toggle.attrs["aria-label"]).toBe("Turn sound on");
    toggle.fire("click");
    expect(level).toBeCloseTo(0.35);
    expect(range.attrs["aria-valuetext"]).toBe("35 percent");
  });
});
