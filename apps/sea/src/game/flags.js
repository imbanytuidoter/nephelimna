export const FLAG_PRICE = 80;
export const DEFAULT_FLAG = "logo";

const H = (...colors) => ({ kind: "h", colors });
const V = (...colors) => ({ kind: "v", colors });
const cross = (field, arm, inner) => ({ kind: "cross", field, arm, inner });

export const FLAGS = {
  logo: { name: "Nephelimna", kind: "logo" },
  ua: { name: "Ukraine", ...H("#0057b7", "#ffd700") },
  pl: { name: "Poland", ...H("#ffffff", "#dc143c") },
  de: { name: "Germany", ...H("#000000", "#dd0000", "#ffce00") },
  nl: { name: "Netherlands", ...H("#ae1c28", "#ffffff", "#21468b") },
  at: { name: "Austria", ...H("#ed2939", "#ffffff", "#ed2939") },
  ee: { name: "Estonia", ...H("#0072ce", "#000000", "#ffffff") },
  lt: { name: "Lithuania", ...H("#fdb913", "#006a44", "#c1272d") },
  fr: { name: "France", ...V("#0055a4", "#ffffff", "#ef4135") },
  it: { name: "Italy", ...V("#009246", "#ffffff", "#ce2b37") },
  ie: { name: "Ireland", ...V("#169b62", "#ffffff", "#ff883e") },
  be: { name: "Belgium", ...V("#000000", "#fae042", "#ed2939") },
  ro: { name: "Romania", ...V("#002b7f", "#fcd116", "#ce1126") },
  es: { name: "Spain", kind: "h", colors: ["#aa151b", "#f1bf00", "#f1bf00", "#aa151b"] },
  se: { name: "Sweden", ...cross("#006aa7", "#fecc00") },
  fi: { name: "Finland", ...cross("#ffffff", "#003580") },
  dk: { name: "Denmark", ...cross("#c8102e", "#ffffff") },
  no: { name: "Norway", ...cross("#ba0c2f", "#ffffff", "#00205b") },
  jp: { name: "Japan", kind: "disc", field: "#ffffff", disc: "#bc002d" },
  ch: { name: "Switzerland", kind: "plus", field: "#da291c", mark: "#ffffff" },
  gb: { name: "United Kingdom", kind: "union" },
  us: { name: "United States", kind: "stars" },
};

function logo(ctx, w, h) {
  ctx.fillStyle = "#1d6a78";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f0c37a";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.4, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1d6a78";
  ctx.beginPath();
  ctx.arc(w * 0.56, h * 0.36, h * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f2f6f4";
  ctx.lineWidth = h * 0.045;
  ctx.lineCap = "round";
  for (const [y, inset] of [[0.68, 0.14], [0.8, 0.24]]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = w * (inset + ((1 - 2 * inset) * i) / 24);
      ctx.lineTo(x, h * y + Math.sin((i / 24) * Math.PI * 4) * h * 0.035);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "#f0c37a";
  ctx.lineWidth = h * 0.03;
  ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
}

function union(ctx, w, h) {
  ctx.fillStyle = "#012169";
  ctx.fillRect(0, 0, w, h);
  const diagonal = (colour, width) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
  };
  diagonal("#ffffff", h * 0.2);
  diagonal("#c8102e", h * 0.07);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(w * 0.5 - h * 0.17, 0, h * 0.34, h);
  ctx.fillRect(0, h * 0.33, w, h * 0.34);
  ctx.fillStyle = "#c8102e";
  ctx.fillRect(w * 0.5 - h * 0.1, 0, h * 0.2, h);
  ctx.fillRect(0, h * 0.4, w, h * 0.2);
}

function stars(ctx, w, h) {
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#b22234";
    ctx.fillRect(0, (h * i) / 13, w, h / 13 + 1);
  }
  ctx.fillStyle = "#3c3b6e";
  ctx.fillRect(0, 0, w * 0.4, (h * 7) / 13);
  ctx.fillStyle = "#ffffff";
  for (let row = 0; row < 9; row++) {
    const count = row % 2 ? 5 : 6;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.4 * ((i + (row % 2 ? 1 : 0.5)) / 6), ((h * 7) / 13) * ((row + 0.7) / 9.4), h * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawFlag(ctx, id, w, h) {
  const flag = FLAGS[id] ?? FLAGS[DEFAULT_FLAG];
  ctx.clearRect(0, 0, w, h);
  if (flag.kind === "logo") return logo(ctx, w, h);
  if (flag.kind === "union") return union(ctx, w, h);
  if (flag.kind === "stars") return stars(ctx, w, h);
  if (flag.kind === "h" || flag.kind === "v") {
    flag.colors.forEach((colour, i) => {
      ctx.fillStyle = colour;
      if (flag.kind === "h") ctx.fillRect(0, (h * i) / flag.colors.length, w, h / flag.colors.length + 1);
      else ctx.fillRect((w * i) / flag.colors.length, 0, w / flag.colors.length + 1, h);
    });
    return undefined;
  }
  ctx.fillStyle = flag.field;
  ctx.fillRect(0, 0, w, h);
  if (flag.kind === "disc") {
    ctx.fillStyle = flag.disc;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (flag.kind === "plus") {
    ctx.fillStyle = flag.mark;
    ctx.fillRect(w / 2 - h * 0.1, h * 0.2, h * 0.2, h * 0.6);
    ctx.fillRect(w / 2 - h * 0.3, h * 0.4, h * 0.6, h * 0.2);
  } else if (flag.kind === "cross") {
    const bar = (colour, size) => {
      ctx.fillStyle = colour;
      ctx.fillRect(w * 0.36 - (h * size) / 2, 0, h * size, h);
      ctx.fillRect(0, h / 2 - (h * size) / 2, w, h * size);
    };
    bar(flag.arm, 0.24);
    if (flag.inner) bar(flag.inner, 0.12);
  }
  return undefined;
}
