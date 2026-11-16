import { MS_TO_KNOTS } from "./tuning.js";

export function createHud(root) {
  root.hidden = false;
  const speedEl = root.querySelector("[data-speed]");
  const gearEl = root.querySelector("[data-gear]");
  const leverEl = root.querySelector("[data-lever]");
  const hintEl = root.querySelector("[data-hint]");
  const fpsEl = root.querySelector("[data-fps]");
  hintEl.hidden = true;
  let shown = "";
  let gear = "";
  let frames = 0;
  let since = performance.now();

  return {
    update(speed, throttle) {
      const text = Math.abs(speed * MS_TO_KNOTS).toFixed(0);
      if (text !== shown) speedEl.textContent = shown = text;
      const nextGear = throttle > 0.05 ? "AHEAD" : throttle < -0.05 ? "ASTERN" : "IDLE";
      if (nextGear !== gear) gearEl.textContent = gear = nextGear;
      leverEl.style.transform = `translateY(${(-throttle * 50).toFixed(1)}%)`;
      frames++;
      const now = performance.now();
      if (now - since > 1000) {
        fpsEl.textContent = `${Math.round((frames * 1000) / (now - since))} fps`;
        frames = 0;
        since = now;
      }
    },
  };
}
