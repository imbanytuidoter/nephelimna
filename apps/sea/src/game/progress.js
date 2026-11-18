import { SESSION_KEY, freezeSession } from "./session.js";
import { keepKeysInside } from "./rename.js";

const CODE_KEY = "nephelimna.code.v1";
const HOLD_KEY = "nephelimna.hold.v1";
const CODE_PATTERN = /^[0-9a-f]{32}$/;
const SEEN_KEY = "nephelimna.code.seen.v1";
const BACKUP_EVERY_MS = 15_000;
const FIRST_PROMPT_MS = 60_000;

function readCode() {
  try {
    const stored = localStorage.getItem(CODE_KEY);
    if (stored && CODE_PATTERN.test(stored)) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(CODE_KEY, code);
    return code;
  } catch {
    return null;
  }
}

export function createProgress({ baseUrl }) {
  const api = new URL(`${baseUrl}api/`, window.location.href);
  const el = (id) => document.getElementById(id);
  const dialog = el("progress");
  keepKeysInside(dialog);
  const status = el("progress-status");
  const codeField = el("progress-code");
  const code = readCode();
  let sent = "";
  let frozen = false;

  const payload = () => {
    try {
      const hold = localStorage.getItem(HOLD_KEY);
      const session = localStorage.getItem(SESSION_KEY);
      return hold === null && session === null ? null : JSON.stringify({ hold, session });
    } catch {
      return null;
    }
  };

  const backup = async () => {
    const data = payload();
    if (frozen || !code || !data || data === sent || document.hidden) return;
    try {
      const response = await fetch(new URL("save", api), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: code, data }) });
      if (response.ok) sent = data;
      else console.warn("backup refused", response.status);
    } catch (error) {
      console.warn("backup failed", error);
    }
  };

  addEventListener("pagehide", () => {
    const data = payload();
    if (frozen || !code || !data || data === sent) return;
    navigator.sendBeacon(new URL("save", api), new Blob([JSON.stringify({ key: code, data })], { type: "application/json" }));
  });
  setInterval(backup, BACKUP_EVERY_MS);

  const say = (text) => {
    status.textContent = text;
  };

  const restore = async () => {
    const entered = el("progress-enter").value.trim().toLowerCase();
    if (!CODE_PATTERN.test(entered)) return say("That is not a progress code. It is 32 characters: digits and letters a to f.");
    say("Looking for your save...");
    let result;
    try {
      const response = await fetch(new URL("load", api), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: entered }) });
      result = await response.json();
      if (!response.ok) return say(result.reason ?? "Could not load that save.");
    } catch (error) {
      console.warn("restore failed", error);
      return say("Could not reach the server. Try again.");
    }
    let saved;
    try {
      saved = JSON.parse(result.data);
    } catch (error) {
      console.warn("save unreadable", error);
      return say("That save could not be read.");
    }
    try {
      if (typeof saved.hold === "string") localStorage.setItem(HOLD_KEY, saved.hold);
      if (typeof saved.session === "string") localStorage.setItem(SESSION_KEY, saved.session);
      localStorage.setItem(CODE_KEY, entered);
    } catch (error) {
      console.warn("browser storage refused the save", error);
      return say("This browser does not allow saving here, so the code cannot be restored.");
    }
    frozen = true;
    freezeSession();
    say("Restored. Reloading...");
    setTimeout(() => location.reload(), 400);
  };

  const opener = el("progress-open");
  const seen = () => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return true;
    }
  };
  const markSeen = () => {
    opener.classList.remove("attention");
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
  };
  const open = () => {
    if (dialog.open) return;
    codeField.value = code ?? "Browser storage is blocked";
    say("");
    dialog.showModal();
  };
  opener.addEventListener("click", open);
  if (code && !seen()) {
    opener.classList.add("attention");
    setTimeout(() => {
      if (!seen() && !document.hidden) open();
    }, FIRST_PROMPT_MS);
  }
  el("progress-close").addEventListener("click", () => {
    markSeen();
    dialog.close();
  });
  el("progress-restore").addEventListener("click", restore);
  el("progress-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeField.value);
      markSeen();
      say("Copied. Keep it somewhere safe.");
    } catch {
      codeField.select();
      say("Press Ctrl+C to copy.");
    }
  });
  void backup();
}
