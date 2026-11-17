const PALETTE = {
  surface: ["#3fa9b8", "#17606e"],
  middle: ["#1f7486", "#0b3a47"],
  bottom: ["#125566", "#06222b"],
  sand: "#b59a6a",
  weed: "#2f6b4a",
  ray: "rgba(214, 246, 240, 0.09)",
  mote: "rgba(230, 250, 245, 0.45)",
  line: "rgba(240, 246, 244, 0.75)",
  hook: "#c9d2d4",
  worm: "#d9787a",
  spoon: "#e6e9ea",
  shadow: "rgba(6, 26, 32, 0.55)",
};
const HOOK_DEPTH = [0.3, 0.55, 0.74];
const FISH_WIDTH = { common: 0.3, uncommon: 0.36, rare: 0.44, mythic: 0.8, chest: 0.26 };
const SHADOWS = 3;
const MOTES = 18;
const LINE_PHASES = new Set(["waiting", "take", "fight", "landed", "lost", "retrieving"]);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);

export function createUnderwater({ baseUrl, reducedMotion }) {
  const frame = document.getElementById("underwater");
  const canvas = frame.querySelector("canvas");
  const caption = frame.querySelector("p");
  const ctx = canvas.getContext("2d");
  const images = new Map();
  const motes = Array.from({ length: MOTES }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.377) % 1, s: 0.5 + ((i * 0.29) % 1) }));
  const shadows = Array.from({ length: SHADOWS }, (_, i) => ({ angle: (i / SHADOWS) * Math.PI * 2, radius: 0.32 + i * 0.07, speed: 0.35 + i * 0.12, dart: 0 }));
  let width = 0;
  let height = 0;
  let clock = 0;
  let shown = false;
  let jiggle = 0;
  let fish = null;
  let away = 0;
  let lastText = "";

  const picture = (slug) => {
    if (!images.has(slug)) {
      const image = new Image();
      image.src = slug === "chest" ? `${baseUrl}fish/chest.svg` : `${baseUrl}fish/${slug}.webp`;
      images.set(slug, image);
    }
    const image = images.get(slug);
    return image.complete && image.naturalWidth > 0 ? image : null;
  };

  const fit = () => {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(box.width * dpr);
    const h = Math.round(box.height * dpr);
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
  };

  const water = (depth) => {
    const [top, deep] = PALETTE[["surface", "middle", "bottom"][depth]];
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, top);
    fill.addColorStop(1, deep);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = PALETTE.ray;
    for (let i = 0; i < 4; i++) {
      const x = width * (0.15 + i * 0.25) + Math.sin(clock * 0.4 + i) * width * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - width * 0.04, 0);
      ctx.lineTo(x + width * 0.04, 0);
      ctx.lineTo(x + width * 0.16, height);
      ctx.lineTo(x - width * 0.02, height);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.mote;
    for (const mote of motes) {
      const x = ((mote.x + clock * 0.01 * mote.s) % 1) * width;
      const y = ((mote.y - clock * 0.02 * mote.s + 10) % 1) * height;
      ctx.fillRect(x, y, 1.5 * mote.s, 1.5 * mote.s);
    }
    if (depth === 2) {
      ctx.fillStyle = PALETTE.sand;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += width / 8) ctx.lineTo(x, height * (0.9 + 0.03 * Math.sin(x * 0.05)));
      ctx.lineTo(width, height);
      ctx.fill();
      ctx.strokeStyle = PALETTE.weed;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const x = width * (0.08 + i * 0.21);
        ctx.beginPath();
        ctx.moveTo(x, height * 0.92);
        ctx.quadraticCurveTo(x + Math.sin(clock + i) * 8, height * 0.8, x + Math.sin(clock * 1.3 + i) * 6, height * 0.68);
        ctx.stroke();
      }
    }
  };

  const drawBait = (x, y, bait) => {
    ctx.strokeStyle = PALETTE.hook;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + 4, 4, 0, Math.PI);
    ctx.stroke();
    if (bait === 0) {
      ctx.strokeStyle = PALETTE.worm;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 2);
      ctx.bezierCurveTo(x - 2, y + 10 + Math.sin(clock * 6) * 2, x + 3, y - 2, x + 7, y + 6 + Math.sin(clock * 5) * 2);
      ctx.stroke();
    } else if (bait === 1) {
      ctx.fillStyle = PALETTE.spoon;
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 3.5, 7, Math.sin(clock * 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const image = picture("herring");
      if (image) sprite(image, x, y + 6, width * 0.1, Math.sin(clock * 8) * 0.15, false, 1);
    }
  };

  const sprite = (image, x, y, w, tilt, flip, alpha, dark = false) => {
    const h = (w * image.naturalHeight) / image.naturalWidth;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(tilt);
    if (flip) ctx.scale(-1, 1);
    if (dark) ctx.filter = "brightness(0)";
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  const silhouette = (x, y, w, flip, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PALETTE.shadow;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, w / 6, 0, 0, Math.PI * 2);
    ctx.moveTo(-w / 2 + 2, 0);
    ctx.lineTo(-w / 2 - w / 5, -w / 7);
    ctx.lineTo(-w / 2 - w / 5, w / 7);
    ctx.fill();
    ctx.restore();
  };

  const drawShadows = (hx, hy, dt, pending) => {
    for (const shadow of shadows) {
      shadow.angle += dt * shadow.speed * (pending ? 1 : 2.4);
      shadow.dart = Math.max(0, shadow.dart - dt * 1.6);
      const reach = (pending ? 1 : 1 + away * 2) * shadow.radius * width;
      const pull = Math.sin(shadow.dart * Math.PI);
      const x = hx + Math.cos(shadow.angle) * reach * (1 - pull * 0.85);
      const y = hy + Math.sin(shadow.angle) * reach * 0.35 * (1 - pull * 0.85);
      silhouette(x, y, width * 0.22, Math.sin(shadow.angle) > 0, pending ? 0.9 : Math.max(0, 0.9 - away));
    }
  };

  const describe = (rod) => {
    if (rod.pending) return "Something is circling your bait";
    if (rod.phase === "take") return "It bites!";
    if (rod.phase === "fight") return rod.fight && ["run", "coil", "jump"].includes(rod.fight.mode) ? "It pulls hard" : "Reel it in";
    if (rod.phase === "landed") return "Landed";
    if (rod.phase === "waiting" && rod.catch) return "A fish is coming";
    return "Under your float";
  };

  return {
    update(dt, { active, rod, depth, bait, events }) {
      clock += dt;
      const visible = active && LINE_PHASES.has(rod.phase) && rod.distance > 0 && rod.phase !== "flying";
      if (visible !== shown) {
        shown = visible;
        frame.hidden = !visible;
        if (!visible) {
          fish = null;
          away = 0;
        }
      }
      if (!visible) return;
      fit();
      if (!width || !height) return;
      for (const event of events) {
        if (event === "nibble") {
          jiggle = 0.6;
          const shadow = shadows[Math.floor((clock * 7) % SHADOWS)];
          shadow.dart = 1;
        }
      }
      jiggle = Math.max(0, jiggle - dt);
      if (rod.catch && !fish) fish = { slug: rod.catch.species.slug, rarity: rod.catch.species.rarity, from: Math.sin(clock) > 0 ? 1 : -1 };
      if (!rod.catch && !rod.pending && rod.phase !== "landed") away = Math.min(1, away + dt);

      const hx = width / 2;
      const restY = height * HOOK_DEPTH[depth];
      const shake = reducedMotion ? 0 : 1;
      let hookX = hx + Math.sin(clock * 1.2) * width * 0.02 + (jiggle > 0 ? Math.sin(clock * 40) * 3 * shake : 0);
      let hookY = restY + Math.sin(clock * 1.7) * height * 0.015;
      if (rod.phase === "retrieving" || rod.phase === "lost") hookY = lerp(restY, -height * 0.2, clamp01(rod.time / 1.1));

      water(depth);
      if (!fish || rod.phase === "retrieving") drawShadows(hookX, hookY, dt, rod.pending);

      const image = fish ? picture(fish.slug) : null;
      const fishW = fish ? width * (FISH_WIDTH[fish.rarity] ?? 0.32) : 0;
      if (fish && image) {
        let x = hookX;
        let y = hookY;
        let flip = fish.from > 0;
        let tilt = 0;
        let hooked = false;
        if (rod.phase === "waiting") {
          const near = ease(clamp01(rod.time / Math.max(0.1, rod.wait)));
          x = lerp(hookX + fish.from * width * 0.75, hookX + fish.from * fishW * 0.55, near) + Math.sin(clock * 2) * 4;
          y = lerp(hookY + height * 0.18, hookY + 2, near);
        } else if (rod.phase === "take") {
          const t = ease(clamp01(rod.time / 0.3));
          x = lerp(hookX + fish.from * fishW * 0.55, hookX + fish.from * fishW * 0.42, t);
          tilt = -0.15 * fish.from * Math.sin(clock * 20) * shake;
          hooked = true;
        } else if (rod.phase === "fight" && rod.fight) {
          const fight = rod.fight;
          const pulling = ["run", "coil", "jump"].includes(fight.mode);
          const side = Math.sin(fight.bearing ?? 0) >= 0 ? 1 : -1;
          flip = pulling ? side < 0 : side > 0;
          const tension = clamp01(fight.tension ?? 0);
          x = hookX + side * fishW * (pulling ? 0.6 : 0.3) + Math.sin(clock * (pulling ? 18 : 6)) * (2 + 6 * tension) * shake;
          y = hookY + Math.sin(clock * 9) * 4 * shake;
          tilt = Math.sin(clock * (pulling ? 16 : 5)) * (0.08 + 0.2 * tension) * shake;
          hooked = true;
        } else if (rod.phase === "landed") {
          y = lerp(hookY, -height * 0.4, clamp01(rod.time / 1));
          x = hookX + fish.from * fishW * 0.45;
          tilt = -0.9;
          hooked = true;
        } else if (rod.phase === "lost" || rod.phase === "retrieving") {
          x = hookX + fish.from * width * (0.3 + rod.time);
          flip = fish.from < 0;
        }
        if (hooked) {
          hookX = x + (flip ? -1 : 1) * fishW * 0.45;
          hookY = y;
        }
        sprite(image, x, y, fishW, tilt, flip, 1);
      }

      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = rod.phase === "fight" ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.quadraticCurveTo(lerp(hx, hookX, 0.5) + (rod.phase === "fight" ? 0 : 6), hookY * 0.5, hookX, hookY);
      ctx.stroke();
      if (!fish || rod.phase === "waiting") drawBait(hookX, hookY, bait);

      const text = describe(rod);
      if (text !== lastText) {
        lastText = text;
        caption.textContent = text;
      }
    },
  };
}
