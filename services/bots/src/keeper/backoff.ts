const BASE_MS = 4_000;
const MAX_MS = 120_000;

export interface TableBackoff {
  readonly ready: (id: bigint, now: number) => boolean;
  readonly fail: (id: bigint, now: number) => number;
  readonly clear: (id: bigint) => void;
}

/** One table whose action keeps reverting must not delay the reveal of every other table in the same sequential loop. */
export function createTableBackoff(): TableBackoff {
  const state = new Map<bigint, { readonly failures: number; readonly until: number }>();
  return {
    ready: (id, now) => (state.get(id)?.until ?? 0) <= now,
    fail: (id, now) => {
      const failures = (state.get(id)?.failures ?? 0) + 1;
      const wait = Math.min(BASE_MS * 2 ** (failures - 1), MAX_MS);
      state.set(id, { failures, until: now + wait });
      return wait;
    },
    clear: (id) => {
      state.delete(id);
    },
  };
}
