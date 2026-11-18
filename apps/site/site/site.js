const CELLS = 64;
const COLUMNS = "ABCDEFGH";
const BOARD_ROWS = 8;
const BUBBLES = 18;
const STATE_URL = "/sea/api/state";
const EXPLORER = "https://sepolia.etherscan.io/tx/";
const REFRESH_MS = 20_000;
const MOVE_MS = 3600;
const GLINT_MS = 700;
const TICK_PX_PER_S = 40;
const HINTS = ["Sealed. Nobody knows what is in it.", "Encrypted on chain. Not even our server can look.", "Could be empty. Could be the Leviathan.", "Only a cast with the right depth and bait finds out."];

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const cellLabel = (index) => `${COLUMNS[index % 8]}${Math.floor(index / 8) + 1}`;
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};

const top = $("top");
const onScroll = () => top.classList.toggle("solid", window.scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

function bubbles() {
  const box = $("bubbles");
  if (!box || calm) return;
  box.replaceChildren(
    ...Array.from({ length: BUBBLES }, () => {
      const bubble = document.createElement("i");
      const size = 4 + Math.random() * 12;
      bubble.style.cssText = `--s:${size.toFixed(1)}px;--x:${(Math.random() * 100).toFixed(1)}%;--d:${(9 + Math.random() * 10).toFixed(1)}s;--delay:${(-Math.random() * 18).toFixed(1)}s;--sway:${((Math.random() - 0.5) * 60).toFixed(0)}px`;
      return bubble;
    }),
  );
}

function chart() {
  const grid = $("grid");
  const hint = $("chart-hint");
  if (!grid) return;
  grid.setAttribute("aria-hidden", "true");
  const cells = Array.from({ length: CELLS }, (_, i) => {
    const cell = node("span");
    cell.title = `Square ${cellLabel(i)}`;
    cell.addEventListener("click", () => {
      cell.classList.remove("ripple");
      void cell.offsetWidth;
      cell.classList.add("ripple");
      hint.textContent = `${cellLabel(i)}: ${HINTS[Math.floor(Math.random() * HINTS.length)]}`;
      hint.classList.add("hot");
    });
    return cell;
  });
  grid.replaceChildren(...cells);
  let cast = 27;
  cells[cast].classList.add("cast");
  if (calm) return;
  setInterval(() => {
    cells[cast].classList.remove("cast");
    cast = (cast + 9 + Math.floor(Math.random() * 40)) % CELLS;
    cells[cast].classList.add("cast");
  }, MOVE_MS);
  setInterval(() => {
    const cell = cells[Math.floor(Math.random() * CELLS)];
    if (cell.classList.contains("cast")) return;
    cell.classList.add("glint");
    setTimeout(() => cell.classList.remove("glint"), GLINT_MS);
  }, GLINT_MS / 2);
}

function reveals() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return items.forEach((item) => item.classList.add("in"));
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        watch.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((item) => watch.observe(item));
}

function countTo(el, value) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(value);
  if (calm || from === value) return void (el.textContent = String(value));
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 900);
    el.textContent = String(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const nameOf = (entry) => entry.name ?? `Angler ${entry.player.slice(2, 6).toLowerCase()}`;

function ago(at, now) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function tickItem(entry, now) {
  const item = node("span", undefined, "tick");
  item.append(node("b", nameOf(entry)));
  if (entry.bot) item.append(node("span", "AI", "ai"));
  item.append(document.createTextNode("cast into"), node("span", entry.cell === null ? "?" : cellLabel(entry.cell), "cell"), node("span", ago(entry.at, now), "ago"));
  return item;
}

function ticker(recent, now) {
  const track = $("ticker");
  if (!track) return;
  track.classList.toggle("moving", recent.length > 0 && !calm);
  if (!recent.length) return track.replaceChildren(node("span", "Waiting for the next cast on Sepolia", "tick muted"));
  const items = recent.map((entry) => tickItem(entry, now));
  const copies = calm ? items : [...items, ...recent.map((entry) => tickItem(entry, now))];
  track.replaceChildren(...copies);
  if (!calm) track.style.setProperty("--dur", `${Math.max(20, track.scrollWidth / 2 / TICK_PX_PER_S).toFixed(0)}s`);
  $("live-count").textContent = `${recent.length} recent ${recent.length === 1 ? "cast" : "casts"}`;
}

function boardRow(entry) {
  const tr = document.createElement("tr");
  const rank = document.createElement("td");
  rank.append(node("span", String(entry.rank), "rank"));
  const name = node("td", nameOf(entry));
  if (entry.bot) name.append(node("span", "AI", "ai"));
  const score = document.createElement("td");
  const link = node("a", `${entry.score} pts`);
  link.href = `${EXPLORER}${entry.tx}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.style.textDecoration = "none";
  score.append(link);
  tr.append(rank, name, score);
  return tr;
}

function emptyRow(message) {
  const tr = node("tr", undefined, "empty");
  const td = node("td", message);
  td.colSpan = 3;
  tr.append(td);
  return tr;
}

let boardKey = null;

async function refresh() {
  const rows = $("board-rows");
  try {
    const response = await fetch(STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`state ${response.status}`);
    const state = await response.json();
    const board = Array.isArray(state.board) ? state.board : [];
    const now = Number(state.now) || Date.now();
    countTo($("stat-anglers"), Number(state.anglers ?? 0));
    countTo($("stat-casts"), Number(state.casts ?? 0));
    countTo($("stat-posted"), board.length);
    ticker(Array.isArray(state.recent) ? state.recent : [], now);
    const top = board.slice(0, BOARD_ROWS);
    const key = top.map((entry) => `${entry.player}:${entry.score}`).join("|");
    if (rows && key !== boardKey) {
      boardKey = key;
      rows.replaceChildren(...(top.length ? top.map(boardRow) : [emptyRow("No scores posted yet. Yours could be the first row.")]));
    }
  } catch (error) {
    console.warn("sea state not loaded", error);
    if (rows && boardKey === null) rows.replaceChildren(emptyRow("The board is out of reach right now."));
  }
}

const LIVE_URL = "/sea/?view";
const LIVE_MESSAGE = "nephelimna-view";

const video = $("hero-video");
const still = $("hero-still");

/** The live scene keeps a fixed vertical field of view, so the still is fitted by height and centred; a portrait box gets the portrait still because the scene switches to its portrait camera there. */
function fitStill() {
  if (!still) return;
  const box = still.getBoundingClientRect();
  still.classList.toggle("tall", box.width < box.height);
}

function canRenderLive() {
  if (calm || navigator.connection?.saveData) return false;
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

function liveHero() {
  const frame = $("hero-live");
  const hero = frame?.closest(".hero");
  if (!frame || !hero) return;
  if (!canRenderLive()) {
    if (!calm && video) {
      video.classList.add("play");
      video.preload = "auto";
      void video.play().catch(() => {});
    }
    return;
  }
  const tell = (run) => frame.contentWindow?.postMessage({ type: LIVE_MESSAGE, run }, location.origin);
  addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== LIVE_MESSAGE || !event.data.ready) return;
    frame.classList.add("on");
  });
  new IntersectionObserver(([entry]) => tell(entry.isIntersecting)).observe(hero);
  frame.src = LIVE_URL;
}

fitStill();
addEventListener("resize", fitStill);
liveHero();
bubbles();
chart();
reveals();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, REFRESH_MS);
