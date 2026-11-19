const FILES = ["sea", "wind", "gulls", "engine", "wash", "cast", "plop", "splash_small", "splash_medium", "splash_big", "reel", "drag", "snap", "bite", "catch", "rare", "chest", "coins", "click", "deny", "step", "anchor", "creak", "bump"];
const VOLUME_KEY = "nephelimna.volume";
const OLD_MUTE_KEY = "nephelimna.muted";
const MUSIC_KEY = "nephelimna.music";
const MUSIC_FILE = "music.mp3";
const DEFAULT_MUSIC = 0.6;
export const MASTER_VOLUME = 0.5;
export const MUSIC_LEVEL = 0.8;

const clamp = (value) => Math.min(1, Math.max(0, value));

function loadVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    if (saved !== null && saved.trim() !== "" && Number.isFinite(Number(saved))) return clamp(Number(saved));
    return localStorage.getItem(OLD_MUTE_KEY) === "1" ? 0 : 1;
  } catch {
    return 1;
  }
}

function loadMusic() {
  try {
    const saved = localStorage.getItem(MUSIC_KEY);
    if (saved !== null && saved.trim() !== "" && Number.isFinite(Number(saved))) return clamp(Number(saved));
  } catch {
    return DEFAULT_MUSIC;
  }
  return DEFAULT_MUSIC;
}

export function createAudio(baseUrl) {
  const buffers = new Map();
  const loops = new Map();
  let context = null;
  let master = null;
  let volume = loadVolume();
  let music = loadMusic();
  let musicGain = null;
  let musicReady = false;
  const musicListeners = new Set();

  const applyMusic = () => {
    if (musicGain) musicGain.gain.setTargetAtTime(MUSIC_LEVEL * music * volume, context.currentTime, 0.05);
  };
  const startMusic = () => {
    const element = new Audio(`${baseUrl}audio/${MUSIC_FILE}`);
    element.loop = true;
    element.preload = "auto";
    element.crossOrigin = "anonymous";
    element.addEventListener("canplay", () => {
      if (musicReady) return;
      musicReady = true;
      musicGain = context.createGain();
      musicGain.gain.value = MUSIC_LEVEL * music * volume;
      context.createMediaElementSource(element).connect(musicGain).connect(context.destination);
      element.play().catch((error) => console.warn("music did not start", error));
      for (const listener of musicListeners) listener(music);
    }, { once: true });
    element.addEventListener("error", () => {}, { once: true });
  };

  const load = async (name) => {
    const response = await fetch(`${baseUrl}audio/${name}.mp3`);
    if (!response.ok) throw new Error(`audio ${name}: ${response.status}`);
    buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
  };

  const start = () => {
    if (context) return;
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return;
    context = new Context();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME * volume;
    master.connect(context.destination);
    startMusic();
    for (const name of FILES) load(name).catch((error) => console.warn("sound not loaded", error));
  };
  for (const type of ["pointerdown", "keydown", "touchstart"]) addEventListener(type, start, { once: true, passive: true });

  const voice = (name, volume, rate, loop) => {
    const buffer = buffers.get(name);
    if (!context || !buffer) return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    source.start();
    return { source, gain };
  };

  return {
    get volume() {
      return volume;
    },
    setVolume(value) {
      volume = Number.isFinite(value) ? clamp(Math.round(value * 100) / 100) : volume;
      if (master) master.gain.setTargetAtTime(MASTER_VOLUME * volume, context.currentTime, 0.05);
      applyMusic();
      try {
        localStorage.setItem(VOLUME_KEY, String(volume));
        localStorage.removeItem(OLD_MUTE_KEY);
      } catch (error) {
        console.warn("volume was not saved", error);
      }
      return volume;
    },
    get music() {
      return music;
    },
    get hasMusic() {
      return musicReady;
    },
    onMusic(listener) {
      musicListeners.add(listener);
      if (musicReady) listener(music);
    },
    setMusic(value) {
      music = Number.isFinite(value) ? clamp(Math.round(value * 100) / 100) : music;
      applyMusic();
      try {
        localStorage.setItem(MUSIC_KEY, String(music));
      } catch (error) {
        console.warn("music volume was not saved", error);
      }
      return music;
    },
    play(name, volume = 1, rate = 1) {
      voice(name, volume, rate, false);
    },
    loop(name, volume, rate = 1) {
      let entry = loops.get(name);
      if (!entry) {
        if (volume <= 0.001) return;
        entry = voice(name, 0, rate, true);
        if (!entry) return;
        loops.set(name, entry);
      }
      entry.gain.gain.setTargetAtTime(volume, context.currentTime, 0.12);
      entry.source.playbackRate.setTargetAtTime(rate, context.currentTime, 0.12);
    },
  };
}
