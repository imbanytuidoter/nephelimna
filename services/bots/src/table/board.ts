import { SEA } from "@nephelimna/rules";
import type { Hex } from "viem";
import { cleanName } from "./presence.js";

const SEEN_SPAN = 2_000;

interface Base {
  readonly player: Hex;
  readonly block: number;
  readonly tx: string;
  readonly index?: number;
}

export type SeaEvent =
  | (Base & { readonly kind: "joined" })
  | (Base & { readonly kind: "cast"; readonly cell?: number })
  | (Base & { readonly kind: "requested"; readonly name: string })
  | (Base & { readonly kind: "posted"; readonly score: number });

export interface Entry {
  readonly player: Hex;
  readonly name: string | null;
  readonly score: number;
  readonly block: number;
  readonly tx: string;
}

export interface Row extends Entry {
  readonly rank: number;
}

export interface BoardState {
  readonly anglers: number;
  readonly casts: number;
  readonly pending: readonly Hex[];
  readonly names: Readonly<Record<string, string | null>>;
  readonly entries: Readonly<Record<string, Entry>>;
  readonly seen: readonly { readonly key: string; readonly block: number }[];
}

export function emptyBoard(): BoardState {
  return { anglers: 0, casts: 0, pending: [], names: {}, entries: {}, seen: [] };
}

export function fillCount(generated: number): number {
  return Math.max(0, Math.min(SEA.fillBatch, SEA.cells - generated));
}

const keyOf = (event: SeaEvent) => `${event.tx}:${event.index ?? 0}:${event.kind}`;

function applyOne(state: BoardState, event: SeaEvent): BoardState {
  const who = event.player.toLowerCase();
  if (event.kind === "joined") return { ...state, anglers: state.anglers + 1 };
  if (event.kind === "cast") return { ...state, casts: state.casts + 1 };
  if (event.kind === "requested") {
    const pending = state.pending.includes(event.player) ? state.pending : [...state.pending, event.player];
    return { ...state, pending, names: { ...state.names, [who]: cleanName(event.name) } };
  }
  const entry: Entry = { player: event.player, name: state.names[who] ?? null, score: event.score, block: event.block, tx: event.tx };
  return { ...state, pending: state.pending.filter((player) => player.toLowerCase() !== who), entries: { ...state.entries, [who]: entry } };
}

export function applyEvents(state: BoardState, events: readonly SeaEvent[]): BoardState {
  let next = state;
  for (const event of events) {
    const key = keyOf(event);
    if (next.seen.some((item) => item.key === key)) continue;
    next = { ...applyOne(next, event), seen: [...next.seen, { key, block: event.block }] };
  }
  const top = next.seen.reduce((max, item) => Math.max(max, item.block), 0);
  return { ...next, seen: next.seen.filter((item) => item.block >= top - SEEN_SPAN) };
}

export function rankBoard(state: BoardState, limit = 50): Row[] {
  return Object.values(state.entries)
    .sort((a, b) => b.score - a.score || a.block - b.block)
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}
