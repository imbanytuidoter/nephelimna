import { Stage } from "@nephelimna/rules";
import { castsLeftNow, describeRound, mySeat, rankFinal } from "./status.js";

const STORE = "nephelimna.burner.v1";
const POLL_MS = 2000;
const PAINT_MS = 250;
const GAS_FLOOR = 300_000_000_000_000n;

function loadBurner() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (saved && /^0x[0-9a-f]{64}$/.test(saved.key)) return saved;
  } catch {
    return null;
  }
  return null;
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createRound({ baseUrl, site, cellName, onShowLake }) {
  const api = new URL(`${baseUrl}api/`, window.location.href);
  const el = (id) => document.getElementById(id);
  const panel = el("round");
  const lineEl = el("round-line");
  const detailEl = el("round-detail");
  const joinButton = el("round-join");
  const finalPanel = el("round-final");
  const finalList = el("round-final-list");
  const finalNote = el("round-final-note");
  let burner = loadBurner();
  let table = null;
  let snapshot = null;
  let joining = null;
  let failure = null;
  let distance = Infinity;
  let used = { key: "", count: 0 };
  let tally = { round: 0, points: 0 };
  let netMark = { key: "", cell: -1, sent: false };
  let seatedRound = 0;
  let shownFinal = 0;
  let lastPaint = 0;
  let lakeRound = 0;
  let overlay = { casts: [], lake: null, leviathan: null };
  const verifyList = el("round-verify");
  const checkButton = el("round-check");
  const legend = el("chart-legend");
  const notes = [];

  const say = (text) => notes.push(text);

  async function ensureTable() {
    if (table) return table;
    const { createTable } = await import("./table.js");
    if (!burner) burner = { key: newKey(), address: null };
    table = createTable({ rpcUrl: new URL("rpc", api).toString(), address: snapshot.table, key: burner.key });
    burner = { key: burner.key, address: table.address };
    localStorage.setItem(STORE, JSON.stringify(burner));
    return table;
  }

  async function poll() {
    try {
      const response = await fetch(new URL("state", api), { cache: "no-store" });
      if (!response.ok) throw new Error(`state ${response.status}`);
      snapshot = { ...(await response.json()), receivedAt: Date.now() };
      const seat = mySeat(snapshot, burner?.address);
      if (seat) seatedRound = snapshot.round.id;
    } catch {
      snapshot = snapshot && Date.now() - snapshot.receivedAt < 20_000 ? snapshot : null;
    }
  }

  async function join() {
    if (joining || !snapshot?.round) return;
    failure = null;
    try {
      joining = "Loading the encryption kit";
      const t = await ensureTable();
      if ((await t.balance()) < GAS_FLOOR) {
        joining = "Getting test ETH for your session key";
        const response = await fetch(new URL("drip", api), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: t.address }) });
        if (!response.ok) throw new Error(response.status === 429 ? "The faucet is busy. Try again in a few minutes." : "The faucet did not answer. Try again.");
        if (!(await t.waitForGas(GAS_FLOOR))) throw new Error("Test ETH did not arrive yet. Try again.");
      }
      joining = "Taking a seat on Sepolia";
      await t.join(snapshot.round.id);
      seatedRound = snapshot.round.id;
      await poll();
      say("You are in. The round starts when the lobby timer runs out.");
    } catch (error) {
      failure = error instanceof Error ? error.message : "Could not join the round.";
      say(failure);
    } finally {
      joining = null;
    }
  }

  joinButton.addEventListener("click", () => void join());
  el("round-final-close").addEventListener("click", () => (finalPanel.hidden = true));
  el("round-lake").addEventListener("click", () => {
    if (!snapshot?.final) return;
    lakeRound = snapshot.final.round;
    finalPanel.hidden = true;
    onShowLake();
  });

  const verifyRow = (title, text, bad) => {
    const item = document.createElement("li");
    if (bad) item.className = "bad";
    const mark = document.createElement("b");
    mark.textContent = title;
    const body = document.createElement("div");
    body.textContent = text.label;
    const detail = document.createElement("span");
    detail.textContent = text.detail;
    body.append(detail);
    item.append(mark, body);
    return item;
  };

  async function verify() {
    const final = snapshot?.final;
    if (!final || checkButton.disabled) return;
    checkButton.disabled = true;
    verifyList.replaceChildren(verifyRow("...", { label: "Reading Sepolia and asking the Zama relayer", detail: "This takes up to a minute" }, false));
    try {
      const [{ checkRound }, t] = await Promise.all([import("./verify.js"), ensureTable()]);
      const checks = checkRound(final, await t.audit(final));
      verifyList.replaceChildren(
        ...checks.map((check) => verifyRow(check.ok ? "OK" : "FAIL", check, !check.ok)),
        verifyRow("NOTE", { label: "Depth and bait of every cast stay encrypted", detail: "Single casts cannot be replayed by anyone. The contract scored them under encryption and the reveal carries a KMS proof." }, false),
      );
    } catch {
      verifyList.replaceChildren(verifyRow("FAIL", { label: "Could not reach the chain or the relayer", detail: "Try again in a moment" }, true));
    } finally {
      checkButton.disabled = false;
    }
  }
  checkButton.addEventListener("click", () => void verify());

  const tideKey = () => (snapshot?.round ? `${snapshot.round.id}:${snapshot.round.tide}` : "");
  const seat = () => mySeat(snapshot, burner?.address);
  const fishing = () => Boolean(seat()) && snapshot.round.stage === Stage.Fishing;
  const castsLeft = () => castsLeftNow(seat(), used.key === tideKey() ? used.count : 0);

  function cast(cell, depth, bait) {
    const ticket = { status: "pending", result: null, stage: "Starting", startedAt: Date.now() };
    const round = snapshot.round.id;
    const mySeatNumber = seat().seat;
    const castTide = snapshot.round.tide;
    used = used.key === tideKey() ? { ...used, count: used.count + 1 } : { key: tideKey(), count: 1 };
    void ensureTable()
      .then((t) => t.cast(round, mySeatNumber, cell, depth, bait, (stage) => (ticket.stage = stage)))
      .then((result) => {
        if (tally.round !== round) tally = { round, points: 0 };
        if (!result.snagged) tally = { round, points: tally.points + result.points };
        ticket.result = result;
        ticket.status = "done";
      })
      .catch((error) => {
        if (used.key === `${round}:${castTide}` && used.count > 0) used = { ...used, count: used.count - 1 };
        ticket.status = "failed";
        ticket.error = error instanceof Error ? error.message : "The cast did not reach the chain.";
      });
    return ticket;
  }

  function setNet(cell) {
    const key = tideKey();
    if (seat().netsSet || (netMark.key === key && netMark.sent)) {
      say("Your nets are already out for this tide.");
      return false;
    }
    if (netMark.key !== key || netMark.cell < 0) {
      netMark = { key, cell, sent: false };
      say(`First hidden net marked in ${cellName(cell)}. Press N in another square for the second, or here again to put both in one.`);
      return true;
    }
    const first = netMark.cell;
    netMark = { key, cell: first, sent: true };
    const round = snapshot.round.id;
    const mySeatNumber = seat().seat;
    say(`Setting hidden nets in ${cellName(first)} and ${cellName(cell)}. Nobody can see where they are.`);
    void ensureTable()
      .then((t) => t.setNets(round, mySeatNumber, first, cell))
      .then(() => say("Nets are set. Every common or uncommon fish a rival lands there this tide is yours, worth three fish."))
      .catch(() => {
        netMark = { key, cell: -1, sent: false };
        say("The nets did not reach the chain. Try again.");
      });
    return true;
  }

  const netsOut = () => netMark.key === tideKey() && netMark.cell >= 0;

  function paintFinal() {
    const final = snapshot?.final;
    if (!final || final.round !== seatedRound || shownFinal === final.round) return;
    shownFinal = final.round;
    verifyList.replaceChildren();
    finalList.replaceChildren(
      ...rankFinal(final, burner?.address).map((row) => {
        const item = document.createElement("li");
        if (row.mine) item.className = "mine";
        const rank = document.createElement("i");
        rank.textContent = String(row.rank);
        const name = document.createElement("span");
        name.textContent = row.name;
        const score = document.createElement("b");
        score.textContent = `${row.score} pts`;
        item.append(rank, name, score);
        return item;
      }),
    );
    finalNote.textContent = `Round ${final.round}. Scores were encrypted all round and opened with a proof checked by the contract.`;
    finalPanel.hidden = false;
  }

  void poll();
  setInterval(() => void poll(), POLL_MS);

  return {
    fishing,
    castsLeft,
    cast,
    setNet,
    netsOut,
    takeNote: () => notes.shift() ?? null,
    overlay: () => overlay,
    update(position) {
      const now = Date.now();
      if (now - lastPaint < PAINT_MS) return;
      lastPaint = now;
      distance = Math.hypot(position.x - site.berth.x, position.z - site.berth.z);
      const view = describeRound(snapshot, burner?.address, { joining, distance, castsLeft: castsLeft(), points: tally.round === snapshot?.round?.id ? tally.points : 0 }, now);
      panel.hidden = view.phase === "offline";
      panel.dataset.phase = view.phase;
      if (lineEl.textContent !== view.line) lineEl.textContent = view.line;
      const detail = failure && view.phase === "lobby" ? failure : view.detail;
      if (detailEl.textContent !== detail) detailEl.textContent = detail;
      joinButton.hidden = !view.canJoin;
      paintFinal();
      const me = seat();
      const live = snapshot?.round?.stage === Stage.Fishing;
      if (live) lakeRound = 0;
      const final = snapshot?.final;
      const showLake = Boolean(final?.lake) && final.round === lakeRound;
      const casts = showLake ? (final.casts ?? []) : live ? snapshot.casts : [];
      const mineSeat = showLake ? final.players.findIndex((player) => player.toLowerCase() === burner?.address?.toLowerCase()) : (me?.seat ?? -1);
      overlay = { casts: casts.map((cast) => ({ cell: cast.cell, mine: cast.seat === mineSeat })), lake: showLake ? final.lake : null, leviathan: showLake ? final.leviathan : null };
      legend.hidden = !live && !showLake;
    },
  };
}
