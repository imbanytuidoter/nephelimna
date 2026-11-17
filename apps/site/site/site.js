const CELLS = 64;
const CAST_CELL = 27;
const BOARD_ROWS = 5;
const STATE_URL = "/sea/api/state";
const EXPLORER = "https://sepolia.etherscan.io/tx/";

const top = document.getElementById("top");
const onScroll = () => top.classList.toggle("solid", window.scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const grid = document.getElementById("grid");
if (grid) {
  grid.replaceChildren(
    ...Array.from({ length: CELLS }, (_, i) => {
      const cell = document.createElement("span");
      if (i === CAST_CELL) cell.className = "cast";
      return cell;
    }),
  );
}

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
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
  reveals.forEach((node) => watch.observe(node));
} else {
  reveals.forEach((node) => node.classList.add("in"));
}

const text = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};

function row(entry) {
  const tr = document.createElement("tr");
  const rank = document.createElement("td");
  rank.append(text("span", String(entry.rank), "rank"));
  const name = text("td", entry.name ?? `Angler ${entry.player.slice(2, 6).toLowerCase()}`);
  const score = document.createElement("td");
  const link = text("a", `${entry.score} pts`);
  link.href = `${EXPLORER}${entry.tx}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.style.textDecoration = "none";
  score.append(link);
  tr.append(rank, name, score);
  return tr;
}

function emptyRow(message) {
  const tr = document.createElement("tr");
  tr.className = "empty";
  const td = text("td", message);
  td.colSpan = 3;
  tr.append(td);
  return tr;
}

async function loadBoard() {
  const rows = document.getElementById("board-rows");
  if (!rows) return;
  try {
    const response = await fetch(STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`state ${response.status}`);
    const state = await response.json();
    const board = Array.isArray(state.board) ? state.board : [];
    document.getElementById("stat-anglers").textContent = String(state.anglers ?? 0);
    document.getElementById("stat-casts").textContent = String(state.casts ?? 0);
    document.getElementById("stat-posted").textContent = String(board.length);
    rows.replaceChildren(...(board.length ? board.slice(0, BOARD_ROWS).map(row) : [emptyRow("No scores posted yet. Yours could be the first row.")]));
  } catch (error) {
    console.warn("board not loaded", error);
    rows.replaceChildren(emptyRow("The board is out of reach right now."));
  }
}

loadBoard();
