const STATE_URL = "/sea/api/state";
const EXPLORER = "https://sepolia.etherscan.io/tx/";
const LIVE_URL = "/sea/?view";
const LIVE_MESSAGE = "nephelimna-view";
const REFRESH_MS = 20_000;
const BOARD_ROWS = 8;
const TICKER_ROWS = 5;
const COUNT_MS = 1400;
const COLUMNS = "ABCDEFGH";

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const cellLabel = (index) => `${COLUMNS[index % 8]}${Math.floor(index / 8) + 1}`;
const nameOf = (entry) => entry.name ?? `Angler ${entry.player.slice(2, 6).toLowerCase()}`;
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};

window.UNLab = {
  register(_slug, api) {
    const root = document.querySelector(".v-tackle");
    if (root) api.mount(root, { reducedMotion: calm });
  },
};

function ago(at, now) {
  const minutes = Math.round(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "just now";
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

function countTo(el, value) {
  if (!el) return;
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(value);
  if (calm || from === value) return void (el.textContent = String(value));
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    el.textContent = String(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function tickerRow(entry, now) {
  const row = node("li", undefined, "tk-row");
  row.append(node("span", nameOf(entry), "tk-row-name"));
  if (entry.bot) row.append(node("span", "AI", "tk-ai"));
  const square = node("span", entry.cell === null ? "?" : cellLabel(entry.cell), "tk-sq");
  square.title = ago(entry.at, now);
  row.append(square);
  return row;
}

function boardRow(entry) {
  const tr = document.createElement("tr");
  const who = node("td");
  who.append(node("span", nameOf(entry), "tk-who"));
  if (entry.bot) who.append(document.createTextNode(" "), node("span", "AI", "tk-ai"));
  const proof = node("td", undefined, "tk-c-tx");
  const link = node("a", "Tx");
  link.href = `${EXPLORER}${entry.tx}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute("aria-label", `${nameOf(entry)} on Etherscan`);
  proof.append(link);
  tr.append(node("td", String(entry.rank), "tk-c-rank"), who, node("td", String(entry.score), "tk-c-pts"), proof);
  return tr;
}

function emptyRow(message) {
  const tr = node("tr", undefined, "tk-row-empty");
  const td = node("td", message);
  td.colSpan = 4;
  tr.append(td);
  return tr;
}

let boardKey = null;
let tickerKey = null;

async function refresh() {
  const rows = $("board-rows");
  const ticker = $("ticker");
  try {
    const response = await fetch(STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`state ${response.status}`);
    const state = await response.json();
    const board = Array.isArray(state.board) ? state.board : [];
    const recent = Array.isArray(state.recent) ? state.recent.slice(0, TICKER_ROWS) : [];
    const now = Number(state.now) || Date.now();
    countTo($("stat-anglers"), Number(state.anglers ?? 0));
    countTo($("stat-casts"), Number(state.casts ?? 0));
    countTo($("stat-posted"), board.length);
    const nextTicker = recent.map((entry) => `${entry.player}:${entry.at}`).join("|");
    if (ticker && nextTicker !== tickerKey) {
      tickerKey = nextTicker;
      ticker.replaceChildren(...(recent.length ? recent.map((entry) => tickerRow(entry, now)) : [node("li", "No casts yet. Yours could be the first.", "tk-row tk-row-empty")]));
      const label = $("live-count");
      if (label) label.textContent = recent.length ? `Latest ${ago(recent[0].at, now)}` : "Live from Sepolia";
    }
    const top = board.slice(0, BOARD_ROWS);
    const nextBoard = top.map((entry) => `${entry.player}:${entry.score}`).join("|");
    if (rows && nextBoard !== boardKey) {
      boardKey = nextBoard;
      rows.replaceChildren(...(top.length ? top.map(boardRow) : [emptyRow("No scores posted yet. Yours could be the first row.")]));
    }
  } catch (error) {
    console.warn("sea state not loaded", error);
    if (rows && boardKey === null) rows.replaceChildren(emptyRow("The board is out of reach right now."));
  }
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
  const video = $("hero-video");
  const hero = frame?.closest(".tk-hero");
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

liveHero();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, REFRESH_MS);
