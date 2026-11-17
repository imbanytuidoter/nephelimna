import { SEA } from "@nephelimna/rules";
import { describeSea, groupBoard, markBoard } from "./status.js";
import { keepKeysInside } from "../rename.js";

const STORE = "nephelimna.burner.v1";
const POLL_MS = 3000;
const POST_WAIT_MS = 300_000;
const PAINT_MS = 250;
const TOTAL_EVERY_MS = 60_000;
const GAS_FLOOR = 300_000_000_000_000n;
const MY_CASTS = 12;
const JOIN_TRIES = 3;
const JOIN_RETRY_MS = 5000;
const EXPLORER = "https://sepolia.etherscan.io/tx/";

function loadBurner() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (saved && /^0x[0-9a-f]{64}$/.test(saved.key)) return saved;
  } catch {
    return null;
  }
  return null;
}

function saveBurner(burner) {
  try {
    localStorage.setItem(STORE, JSON.stringify(burner));
  } catch (error) {
    console.warn("session key was not saved", error);
  }
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const PROOF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>';

function cell(...children) {
  const td = document.createElement("td");
  td.append(...children);
  return td;
}

function tag(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function groupRow(label) {
  const tr = tag("tr", "group");
  const td = tag("td", "", label);
  td.colSpan = 4;
  tr.append(td);
  return tr;
}

function boardRow(row) {
  const tr = document.createElement("tr");
  if (row.mine) tr.className = "mine";
  const rank = tag("span", `rank rank-${row.rank}`, String(row.rank));
  const angler = tag("div", "angler");
  const avatar = tag("span", "avatar", row.name.trim().charAt(0).toUpperCase() || "?");
  avatar.style.background = `hsl(${parseInt(row.player.slice(2, 6), 16) % 360} 62% 68%)`;
  angler.append(avatar, tag("b", "", row.name));
  if (row.mine) angler.append(tag("em", "", "You"));
  else if (row.bot) angler.append(tag("em", "bot", "AI angler"));
  const score = tag("td", "score");
  score.append(tag("b", "", String(row.score)), tag("small", "", "pts"));
  const proof = tag("a", "proof");
  proof.href = `${EXPLORER}${row.tx}`;
  proof.target = "_blank";
  proof.rel = "noopener";
  proof.title = "Open the transaction that checked this score";
  proof.setAttribute("aria-label", `Proof for ${row.name}`);
  proof.innerHTML = PROOF_ICON;
  tr.append(cell(rank), cell(angler), score, cell(proof));
  return tr;
}

class GateError extends Error {}

export function createSea({ baseUrl, cellName, nameOf }) {
  const api = new URL(`${baseUrl}api/`, window.location.href);
  const el = (id) => document.getElementById(id);
  const panel = el("sea");
  const lineEl = el("sea-line");
  const detailEl = el("sea-detail");
  const postButton = el("sea-post");
  const boardButton = el("sea-board");
  const board = el("board");
  const boardList = el("board-list");
  const boardNote = el("board-note");
  const legend = el("chart-legend");
  let burner = loadBurner();
  let chain = null;
  let snapshot = null;
  let joined = false;
  let joining = null;
  let joinTask = null;
  let failure = null;
  let total = null;
  let totalAt = 0;
  let posting = false;
  let postingAt = 0;
  let postedTx = null;
  let lastCastBlock = undefined;
  const myRow = () => snapshot?.board?.find((entry) => entry.player.toLowerCase() === burner?.address?.toLowerCase());
  let nets = [];
  let myCasts = [];
  let lastPaint = 0;
  let boardKey = null;
  const notes = [];
  const say = (text) => notes.push(text);

  let chainTask = null;

  /** Two callers racing here would build two SDKs with separate nonce queues for one key, so the setup runs once and everyone shares it. */
  function ensureChain() {
    if (chain) return Promise.resolve(chain);
    if (!snapshot?.sea) return Promise.reject(new Error("Cannot reach the chain right now. Try again in a moment."));
    chainTask ??= (async () => {
      const { createSeaChain } = await import("./chain.js");
      if (!burner) burner = { key: newKey(), address: null };
      chain = createSeaChain({ rpcUrl: new URL("rpc", api).toString(), address: snapshot.sea, key: burner.key });
      burner = { key: burner.key, address: chain.address };
      saveBurner(burner);
      return chain;
    })().finally(() => {
      chainTask = null;
    });
    return chainTask;
  }

  async function poll() {
    try {
      const response = await fetch(new URL("state", api), { cache: "no-store" });
      if (!response.ok) throw new Error(`state ${response.status}`);
      snapshot = { ...(await response.json()), receivedAt: Date.now() };
    } catch {
      snapshot = snapshot && Date.now() - snapshot.receivedAt < 20_000 ? snapshot : null;
    }
    if (!posting || !burner?.address) return;
    const row = myRow();
    if (row && row.tx !== postedTx) {
      posting = false;
      say(`Score posted: ${row.score} pts, rank ${row.rank} of ${snapshot.board.length}. The contract checked the proof.`);
    } else if (Date.now() - postingAt > POST_WAIT_MS) {
      posting = false;
      failure = "The score check is taking long. Post again in a moment.";
    }
  }

  async function refreshTotal(blockNumber) {
    if (!joined) return;
    totalAt = Date.now();
    try {
      total = await (await ensureChain()).total(blockNumber);
    } catch (error) {
      console.warn("total not read", error);
    }
  }

  /** Right after the faucet pays, the node that takes the join can still be a few blocks behind and see an empty balance, so a failed join is retried while the boat is still not on chain. */
  async function joinOnce(c) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await c.join();
      } catch (error) {
        if (await c.joined()) return null;
        if (attempt >= JOIN_TRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, JOIN_RETRY_MS));
      }
    }
  }

  async function join(onStage) {
    const c = await ensureChain();
    if (await c.joined()) {
      joined = true;
      return c;
    }
    if ((await c.balance()) < GAS_FLOOR) {
      onStage("Getting test ETH");
      const response = await fetch(new URL("drip", api), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: c.address }) });
      if (!response.ok) throw new Error(response.status === 429 ? "The faucet is busy. Try again in a few minutes." : "The faucet did not answer. Try again.");
      if (!(await c.waitForGas(GAS_FLOOR))) throw new Error("Test ETH did not arrive yet. Try again.");
    }
    onStage("Putting your boat on chain");
    await joinOnce(c);
    joined = true;
    total = 0;
    say("Your boat is on chain. Every cast inside the chart squares is sealed from here on.");
    return c;
  }

  function ensureJoined(onStage) {
    if (joined && chain) return Promise.resolve(chain);
    joinTask ??= join((stage) => {
      joining = stage;
      onStage(stage);
    }).finally(() => {
      joining = null;
      joinTask = null;
    });
    return joinTask;
  }

  function cast(cell, depth, bait) {
    const ticket = { status: "pending", result: null, stage: "Starting", startedAt: Date.now(), cell };
    const onStage = (stage) => (ticket.stage = stage);
    void ensureJoined(onStage)
      .then((c) => c.cast(cell, depth, bait, onStage))
      .then((result) => {
        failure = null;
        myCasts = [...myCasts, { cell }].slice(-MY_CASTS);
        ticket.result = result;
        lastCastBlock = result.blockNumber;
        ticket.status = "done";
        void refreshTotal(result.blockNumber);
      })
      .catch((error) => {
        console.error("sealed cast failed", error);
        failure = error instanceof Error ? error.message : "The cast did not reach the chain.";
        ticket.status = "failed";
        ticket.error = failure;
      });
    return ticket;
  }

  const liveNets = () => nets.filter((net) => net.until > Date.now());

  function setNet(cell) {
    nets = liveNets();
    if (nets.length >= SEA.netsPerPlayer) {
      say(`You already have ${SEA.netsPerPlayer} hidden nets out. Each one stays for an hour.`);
      return false;
    }
    const mark = { cell, until: Date.now() + SEA.netLifetimeMs };
    nets = [...nets, mark];
    say(`Setting a hidden net in ${cellName(cell)}. Nobody can see which square it is in.`);
    void ensureJoined(() => {})
      .then(async (c) => {
        const gate = await c.gates(lastCastBlock);
        const short = gate.castsAtNet + SEA.castsPerNet - gate.casts;
        if (short > 0) throw new GateError(`Make ${short} more sealed ${short === 1 ? "cast" : "casts"} before this net. Each net needs ${SEA.castsPerNet} casts.`);
        return c.setNet(cell);
      })
      .then(() => say("Net is set for an hour. When a rival lands a common or uncommon fish there, you score it three times."))
      .catch((error) => {
        nets = nets.filter((net) => net !== mark);
        if (error instanceof GateError) return say(error.message);
        const full = error instanceof Error && /NetsFull|0x[0-9a-f]{8}/i.test(error.message);
        say(full ? "All hidden net places in the sea are taken. Try again later." : "The net did not reach the chain. Try again.");
      });
    return true;
  }

  async function post() {
    if (posting || !joined) return;
    posting = true;
    postingAt = Date.now();
    postedTx = myRow()?.tx ?? null;
    failure = null;
    try {
      const c = await ensureChain();
      const gate = await c.gates(lastCastBlock);
      if (gate.casts === gate.castsAtPost) throw new GateError("Cast again before you post a new score.");
      await c.postScore(nameOf());
      say("Opening your total with a proof. It shows on the board in about half a minute.");
    } catch (error) {
      posting = false;
      if (error instanceof GateError) failure = error.message;
      else failure = error instanceof Error && /AlreadyPosting/.test(error.message) ? "Your last post is still being checked." : "The post did not reach the chain. Try again.";
    }
  }

  function paintBoard() {
    const rows = markBoard(snapshot?.board ?? [], burner?.address);
    const key = rows.map((row) => `${row.player}:${row.score}:${row.name}:${row.tx}`).join("|");
    if (key === boardKey) return;
    boardKey = key;
    const { people, ai } = groupBoard(rows);
    boardList.replaceChildren(...people.map(boardRow), ...(ai.length ? [groupRow("AI anglers"), ...ai.map(boardRow)] : []));
    boardNote.textContent = rows.length ? "People rank first. AI anglers fish only while people are at sea. Open a proof to see the transaction that checked a score." : "No scores posted yet.";
  }

  postButton.addEventListener("click", () => void post());
  boardButton.addEventListener("click", () => {
    paintBoard();
    board.showModal();
  });
  el("board-close").addEventListener("click", () => board.close());
  keepKeysInside(board);

  void poll().then(async () => {
    if (!burner || !snapshot?.sea) return;
    try {
      joined = await (await ensureChain()).joined();
      if (joined) await refreshTotal();
    } catch (error) {
      console.warn("sea join state not read", error);
    }
  });
  setInterval(() => void poll(), POLL_MS);

  return {
    fishing: () => Boolean(snapshot?.ready),
    castsLeft: () => Infinity,
    cast,
    setNet,
    netsOut: () => liveNets().length > 0,
    takeNote: () => notes.shift() ?? null,
    overlay: () => ({ casts: myCasts.map((entry) => ({ cell: entry.cell, mine: true })), lake: null, leviathan: null }),
    update() {
      const now = Date.now();
      if (now - lastPaint < PAINT_MS) return;
      lastPaint = now;
      if (joined && !posting && now - totalAt > TOTAL_EVERY_MS) void refreshTotal();
      const view = describeSea(snapshot, { joining, joined, total, posting, failure });
      panel.dataset.phase = view.phase;
      if (lineEl.textContent !== view.line) lineEl.textContent = view.line;
      if (detailEl.textContent !== view.detail) detailEl.textContent = view.detail;
      postButton.hidden = !view.canPost;
      legend.hidden = myCasts.length === 0;
      if (board.open) paintBoard();
    },
  };
}
