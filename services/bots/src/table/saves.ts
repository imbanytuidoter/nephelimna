import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const KEY_PATTERN = /^[0-9a-f]{32}$/;
const MAX_ENTRIES = 5_000;
const MAX_DATA_BYTES = 12_000;

export interface Saved {
  readonly data: string;
  readonly at: number;
}

export function createSaves(file: string | null) {
  const entries = new Map<string, Saved>();
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, Saved>;
    for (const [id, saved] of Object.entries(raw)) entries.set(id, saved);
  }

  const flush = () => {
    if (!file) return;
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(Object.fromEntries(entries)), { mode: 0o600 });
    renameSync(temp, file);
  };

  const idOf = (key: string) => createHash("sha256").update(key).digest("hex");

  return {
    put(key: unknown, data: unknown, now: number): boolean {
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return false;
      if (typeof data !== "string" || data.length > MAX_DATA_BYTES) return false;
      try {
        if (typeof JSON.parse(data) !== "object") return false;
      } catch {
        return false;
      }
      const id = idOf(key);
      if (!entries.has(id) && entries.size >= MAX_ENTRIES) {
        const oldest = [...entries.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) entries.delete(oldest[0]);
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
  };
}
