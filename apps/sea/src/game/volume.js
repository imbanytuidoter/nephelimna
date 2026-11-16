import { keepKeysInside } from "./rename.js";

const LOW = 0.5;

export function levelName(volume) {
  if (volume <= 0) return "off";
  return volume < LOW ? "low" : "high";
}

export function createVolume({ audio }) {
  const box = document.getElementById("volume");
  const toggle = document.getElementById("volume-toggle");
  const range = document.getElementById("volume-range");
  let before = audio.volume > 0 ? audio.volume : 1;

  const render = (volume) => {
    box.dataset.level = levelName(volume);
    range.value = String(Math.round(volume * 100));
    range.setAttribute("aria-valuetext", volume > 0 ? `${Math.round(volume * 100)} percent` : "muted");
    toggle.setAttribute("aria-label", volume > 0 ? "Mute sound" : "Turn sound on");
  };
  const set = (volume) => {
    const next = audio.setVolume(volume);
    if (next > 0) before = next;
    render(next);
    return next;
  };

  keepKeysInside(range);
  range.addEventListener("input", () => set(Number(range.value) / 100));
  range.addEventListener("change", () => range.blur());
  toggle.addEventListener("click", () => set(audio.volume > 0 ? 0 : before));
  render(audio.volume);

  return { set };
}
