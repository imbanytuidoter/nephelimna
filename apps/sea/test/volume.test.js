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
    const nodes = { volume: node(), "volume-toggle": node(), "volume-range": node(), music: node(), "music-toggle": node(), "music-range": node() };
    vi.stubGlobal("document", { getElementById: (id) => nodes[id] });
    let level = 1;
    const audio = { get volume() { return level; }, setVolume: (v) => (level = Math.min(1, Math.max(0, v))), music: 0.6, setMusic: (v) => (audio.music = v), onMusic() {} };
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

  test("the music slider stays hidden until the track is ready, then sets its own level and mutes", () => {
    const nodes = { volume: node(), "volume-toggle": node(), "volume-range": node(), music: Object.assign(node(), { hidden: true }), "music-toggle": node(), "music-range": node() };
    vi.stubGlobal("document", { getElementById: (id) => nodes[id] });
    let ready = () => {};
    const audio = { volume: 1, setVolume: (v) => v, music: 0.6, setMusic: (v) => (audio.music = v), onMusic: (fn) => (ready = fn) };
    createVolume({ audio });
    expect(nodes.music.hidden).toBe(true);
    ready(0.6);
    expect(nodes.music.hidden).toBe(false);
    expect(nodes["music-range"].value).toBe("60");
    nodes["music-range"].value = "20";
    nodes["music-range"].fire("input");
    expect(audio.music).toBeCloseTo(0.2);
    nodes["music-toggle"].fire("click");
    expect(audio.music).toBe(0);
    expect(nodes["music-toggle"].attrs["aria-label"]).toBe("Turn music on");
    nodes["music-toggle"].fire("click");
    expect(audio.music).toBeCloseTo(0.2);
  });
});
