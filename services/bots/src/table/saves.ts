import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const KEY_PATTERN = /^[0-9a-f]{32}$/;
const MAX_ENTRIES = 5_000;
const MAX_DATA_BYTES = 12_000;
const FLUSH_DELAY_MS = 2_000;

export interface Saved {
  readonly data: string;
  readonly at: number;
}

export function createSaves(file: string | null) {
  const entries = new Map<string, Saved>();
  if (file && existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, Saved>;
      for (const [id, saved] of Object.entries(raw)) entries.set(id, saved);
    } catch (error) {
      renameSync(file, `${file}.broken-${Date.now()}`);
      process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), event: "saves-set-aside", error: String(error).slice(0, 200) })}\n`);
    }
  }

  let pending: NodeJS.Timeout | null = null;
  const write = () => {
    pending = null;
    if (!file) return;
    const temp = `${file}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(Object.fromEntries(entries)), { mode: 0o600 });
      renameSync(temp, file);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), event: "saves-write-failed", error: String(error).slice(0, 200) })}\n`);
    }
  };
  /** Each save used to rewrite the whole file at once, so a burst of saves stalled the server; writes now batch into one every couple of seconds. */
  const flush = () => {
    if (file && !pending) pending = setTimeout(write, FLUSH_DELAY_MS);
  };
  if (file) process.once("exit", () => pending && write());

  const idOf = (key: string) => createHash("sha256").update(key).digest("hex");

  return {
    put(key: unknown, data: unknown, now: number): boolean {
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return false;
      if (typeof data !== "string" || Buffer.byteLength(data, "utf8") > MAX_DATA_BYTES) return false;
      try {
        if (typeof JSON.parse(data) !== "object") return false;
      } catch {
        return false;
      }
      const id = idOf(key);
      entries.delete(id);
      if (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(id, { data, at: now });
      flush();
      return true;
    },
    get(key: unknown): string | null {
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return null;
      return entries.get(idOf(key))?.data ?? null;
    },
    size: () => entries.size,
    flushNow: () => {
      if (pending) clearTimeout(pending);
      write();
    },
  };
}
