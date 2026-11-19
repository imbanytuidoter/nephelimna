import { afterEach, describe, expect, test, vi } from "vitest";

function setup(saved = {}) {
  const elements = [];
  class FakeAudio {
    listeners = new Map();
    constructor(src) {
      this.src = src;
      elements.push(this);
    }
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    }
    play() {
      return Promise.resolve();
    }
  }
  const store = new Map(Object.entries(saved));
  const listeners = new Map();
  const gains = [];
  class Context {
    currentTime = 0;
    destination = {};
    createGain() {
      const gain = { gain: { value: 1, setTargetAtTime(v) { this.value = v; } }, connect: (to) => to };
      gains.push(gain);
      return gain;
    }
    decodeAudioData() {
      return new Promise(() => {});
    }
    createMediaElementSource() {
      return { connect: (to) => to };
    }
  }
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  vi.stubGlobal("addEventListener", (type, fn) => listeners.set(type, fn));
  vi.stubGlobal("localStorage", { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
  return { store, gains, elements, start: () => listeners.get("pointerdown")() };
}

afterEach(() => vi.unstubAllGlobals());

describe("sound volume", () => {
  test("starts at full volume, keeps the level the player sets, and scales the master output", async () => {
    const { store, gains, start } = setup();
    const { createAudio, MASTER_VOLUME } = await import("../src/game/audio.js");
    const audio = createAudio("/sea/");
    expect(audio.volume).toBe(1);
    start();
    expect(gains[0].gain.value).toBeCloseTo(MASTER_VOLUME);
    expect(audio.setVolume(0.3)).toBeCloseTo(0.3);
    expect(gains[0].gain.value).toBeCloseTo(MASTER_VOLUME * 0.3);
    expect(store.get("nephelimna.volume")).toBe("0.3");
    expect(createAudio("/sea/").volume).toBeCloseTo(0.3);
  });

  test("a level outside 0 to 1 is clamped, and a player who had muted before keeps silence", async () => {
    const { createAudio } = await import("../src/game/audio.js");
    setup({ "nephelimna.muted": "1" });
    const audio = createAudio("/sea/");
    expect(audio.volume).toBe(0);
    expect(audio.setVolume(7)).toBe(1);
    expect(audio.setVolume(-2)).toBe(0);
    setup({ "nephelimna.volume": "nonsense" });
    expect(createAudio("/sea/").volume).toBe(1);
  });

  test("music has its own level, stays silent until the track can play, and follows the master level", async () => {
    const { store, gains, elements, start } = setup();
    const { createAudio, MUSIC_LEVEL } = await import("../src/game/audio.js");
    const audio = createAudio("/sea/");
    const heard = [];
    audio.onMusic((level) => heard.push(level));
    start();
    expect(audio.hasMusic).toBe(false);
    expect(elements[0].src).toBe("/sea/audio/music.mp3");
    elements[0].listeners.get("canplay")();
    expect(audio.hasMusic).toBe(true);
    expect(heard).toEqual([0.6]);
    const musicGain = gains[1];
    expect(musicGain.gain.value).toBeCloseTo(MUSIC_LEVEL * 0.6);
    expect(audio.setMusic(0.5)).toBeCloseTo(0.5);
    expect(musicGain.gain.value).toBeCloseTo(MUSIC_LEVEL * 0.5);
    expect(store.get("nephelimna.music")).toBe("0.5");
    audio.setVolume(0);
    expect(musicGain.gain.value).toBe(0);
  });

  test("a missing track leaves the music control hidden", async () => {
    const { elements, start } = setup();
    const { createAudio } = await import("../src/game/audio.js");
    const audio = createAudio("/sea/");
    const heard = [];
    audio.onMusic((level) => heard.push(level));
    start();
    elements[0].listeners.get("error")();
    expect(audio.hasMusic).toBe(false);
    expect(heard).toEqual([]);
  });
});
