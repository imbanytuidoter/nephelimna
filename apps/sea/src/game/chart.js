import { unpackCell } from "@nephelimna/rules";
import { islandHeight } from "../ocean/scene/islandHeight.js";

export const CHART = { half: 1600, cells: 8 };

const BASE_SIZE = 256;
const MINI_RANGE = 420;
const COLUMNS = "ABCDEFGH";
const RARITY_MARK = [null, { letter: "C", color: "#cfd8dc" }, { letter: "U", color: "#7fd08a" }, { letter: "R", color: "#6fb4ff" }, { letter: "M", color: "#f0c37a" }];
const DEPTH_LETTER = ["S", "M", "B"];
const MAX_DOTS = 8;
const BANDS = [
  [-14, [14, 40, 50]],
  [-3, [22, 76, 86]],
  [0, [44, 132, 130]],
  [3, [216, 194, 142]],
  [30, [98, 124, 78]],
  [Infinity, [146, 150, 140]],
];

export function cellAt(x, z) {
  const size = (CHART.half * 2) / CHART.cells;
  const col = Math.floor((x + CHART.half) / size);
  const row = Math.floor((z + CHART.half) / size);
  if (col < 0 || row < 0 || col >= CHART.cells || row >= CHART.cells) return null;
  return { col, row, label: `${COLUMNS[col]}${row + 1}` };
}

export function cellLabel(index) {
  return `${COLUMNS[index % CHART.cells]}${Math.floor(index / CHART.cells) + 1}`;
}

export function compassLabel(degrees) {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const wrapped = ((degrees % 360) + 360) % 360;
  return `${names[Math.round(wrapped / 45) % 8]} ${String(Math.round(wrapped) % 360).padStart(3, "0")}`;
}

function paintBase() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = BASE_SIZE;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(BASE_SIZE, BASE_SIZE);
  const step = (CHART.half * 2) / BASE_SIZE;
  for (let j = 0; j < BASE_SIZE; j++) {
    for (let i = 0; i < BASE_SIZE; i++) {
      const h = islandHeight(-CHART.half + (i + 0.5) * step, -CHART.half + (j + 0.5) * step);
      const color = BANDS.find(([limit]) => h < limit)[1];
      image.data.set([color[0], color[1], color[2], 255], (j * BASE_SIZE + i) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const OTHER_BOAT = "#8fd6c8";

function drawBoat(ctx, x, y, heading, size, fill = "#f0c37a") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.62, size * 0.8);
  ctx.lineTo(0, size * 0.42);
  ctx.lineTo(-size * 0.62, size * 0.8);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#0b1518";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMark(ctx, x, y, size, color, shape) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0b1518";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (shape === "port") {
    ctx.rect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
  } else {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? size * 0.45 : size;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function createChart({ mini, full, panel, readout, site, market }) {
  const base = paintBase();
  const miniCtx = mini.getContext("2d");
  const fullCtx = full.getContext("2d");
  const ratio = Math.min(devicePixelRatio || 1, 2);
  let open = false;
  let since = 0;
  let overlay = { casts: [], lake: null, leviathan: null };
  let others = [];

  const fit = (canvas) => {
    const size = Math.round(canvas.clientWidth * ratio);
    if (size && canvas.width !== size) canvas.width = canvas.height = size;
    return canvas.width;
  };

  const toggle = (value) => {
    open = value ?? !open;
    panel.hidden = !open;
  };
  mini.addEventListener("click", () => toggle());
  panel.addEventListener("click", () => toggle(false));
  addEventListener("keydown", (e) => {
    if (e.code === "KeyM") toggle();
    if (e.code === "Escape") toggle(false);
  });

  const drawMini = (boat, heading) => {
    const size = fit(mini);
    const ctx = miniCtx;
    const scale = size / (MINI_RANGE * 2);
    const px = BASE_SIZE / (CHART.half * 2);
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgb(14, 40, 50)";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, (boat.x - MINI_RANGE + CHART.half) * px, (boat.z - MINI_RANGE + CHART.half) * px, MINI_RANGE * 2 * px, MINI_RANGE * 2 * px, 0, 0, size, size);
    const cell = (CHART.half * 2) / CHART.cells;
    ctx.strokeStyle = "rgba(242, 246, 244, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= CHART.cells; i++) {
      const gx = (-CHART.half + i * cell - boat.x + MINI_RANGE) * scale;
      const gz = (-CHART.half + i * cell - boat.z + MINI_RANGE) * scale;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, size);
      ctx.moveTo(0, gz);
      ctx.lineTo(size, gz);
    }
    ctx.stroke();
    const mark = (spot, color, shape) => {
      let dx = (spot.x - boat.x) * scale;
      let dz = (spot.z - boat.z) * scale;
      const reach = size / 2 - 7 * ratio;
      const d = Math.hypot(dx, dz);
      if (d > reach) {
        dx *= reach / d;
        dz *= reach / d;
      }
      drawMark(ctx, size / 2 + dx, size / 2 + dz, 5 * ratio, color, shape);
    };
    mark(site.lighthouse, "#ffffff", "light");
    mark(market, "#e06a4e", "port");
    for (const other of others) {
      let dx = (other.x - boat.x) * scale;
      let dz = (other.z - boat.z) * scale;
      const reach = size / 2 - 6 * ratio;
      const d = Math.hypot(dx, dz);
      if (d > reach) {
        dx *= reach / d;
        dz *= reach / d;
      }
      drawBoat(ctx, size / 2 + dx, size / 2 + dz, other.bearing, 6 * ratio, OTHER_BOAT);
    }
    drawBoat(ctx, size / 2, size / 2, heading, 8 * ratio);
    ctx.restore();
    ctx.strokeStyle = "rgba(242, 246, 244, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawLake = (ctx, cell) => {
    ctx.textBaseline = "top";
    const line = Math.max(9, Math.round(cell * 0.15));
    ctx.font = `700 ${line}px ui-monospace, Menlo, monospace`;
    overlay.lake.forEach((packed, index) => {
      const x = (index % CHART.cells) * cell;
      const y = Math.floor(index / CHART.cells) * cell;
      ctx.fillStyle = "rgba(8, 20, 26, 0.62)";
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      unpackCell(packed).forEach((layer, depth) => {
        const mark = layer.stock > 0 ? RARITY_MARK[layer.rarity] : null;
        ctx.fillStyle = mark ? mark.color : "rgba(242, 246, 244, 0.32)";
        ctx.fillText(`${DEPTH_LETTER[depth]} ${mark ? `${mark.letter}x${layer.stock}` : "-"}`, x + cell * 0.08, y + cell * 0.3 + depth * line * 1.15);
      });
      if (index === overlay.leviathan) {
        ctx.strokeStyle = "#f0c37a";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
        ctx.fillStyle = "#f0c37a";
        ctx.fillText("LEV", x + cell * 0.58, y + cell * 0.08);
      }
    });
  };

  const drawCasts = (ctx, cell) => {
    const counts = new Map();
    for (const cast of overlay.casts) {
      const entry = counts.get(cast.cell) ?? { mine: 0, rivals: 0 };
      counts.set(cast.cell, cast.mine ? { ...entry, mine: entry.mine + 1 } : { ...entry, rivals: entry.rivals + 1 });
    }
    const radius = Math.max(3, cell * 0.045);
    for (const [index, entry] of counts) {
      const x = (index % CHART.cells) * cell + cell * 0.1;
      const y = Math.floor(index / CHART.cells) * cell + cell * 0.88;
      const dots = [...Array(Math.min(entry.mine, MAX_DOTS)).fill(true), ...Array(Math.min(entry.rivals, MAX_DOTS)).fill(false)].slice(0, MAX_DOTS);
      dots.forEach((mine, i) => {
        ctx.beginPath();
        if (mine) ctx.rect(x + i * radius * 2.6 - radius, y - radius, radius * 2, radius * 2);
        else ctx.arc(x + i * radius * 2.6, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = mine ? "#f0c37a" : "#f2f6f4";
        ctx.strokeStyle = "#0b1518";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      });
    }
  };

  const drawFull = (boat, heading, here) => {
    const size = fit(full);
    const ctx = fullCtx;
    const scale = size / (CHART.half * 2);
    const cell = size / CHART.cells;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, 0, 0, size, size);
    if (here) {
      ctx.fillStyle = "rgba(240, 195, 122, 0.16)";
      ctx.fillRect(here.col * cell, here.row * cell, cell, cell);
    }
    ctx.strokeStyle = "rgba(242, 246, 244, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < CHART.cells; i++) {
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(242, 246, 244, 0.7)";
    ctx.font = `600 ${Math.round(11 * ratio)}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = "top";
    for (let r = 0; r < CHART.cells; r++) {
      for (let c = 0; c < CHART.cells; c++) ctx.fillText(`${COLUMNS[c]}${r + 1}`, c * cell + 5 * ratio, r * cell + 4 * ratio);
    }
    if (overlay.lake) drawLake(ctx, cell);
    drawCasts(ctx, cell);
    const at = (spot) => [(spot.x + CHART.half) * scale, (spot.z + CHART.half) * scale];
    drawMark(ctx, ...at(site.lighthouse), 6 * ratio, "#ffffff", "light");
    drawMark(ctx, ...at(market), 6 * ratio, "#e06a4e", "port");
    for (const other of others) drawBoat(ctx, ...at(other), other.bearing, 8 * ratio, OTHER_BOAT);
    drawBoat(ctx, ...at(boat), heading, 10 * ratio);
  };

  return {
    show: () => toggle(true),
    setOverlay(next) {
      overlay = next;
    },
    setBoats(next) {
      others = next;
    },
    update(boat, headingRadians, now) {
      if (now - since < 100) return;
      since = now;
      const here = cellAt(boat.x, boat.z);
      const toPort = Math.hypot(site.head.center.x - boat.x, site.head.center.z - boat.z);
      const text = `${here ? here.label : "OFF CHART"} · PORT ${toPort < 1000 ? `${Math.round(toPort / 10) * 10} m` : `${(toPort / 1000).toFixed(1)} km`}`;
      if (readout.textContent !== text) readout.textContent = text;
      drawMini(boat, headingRadians);
      if (open) drawFull(boat, headingRadians, here);
    },
  };
}
