import { Stage, TABLE } from "@nephelimna/rules";

export interface RoundView {
  readonly id: number;
  readonly stage: number;
  readonly seats: number;
  readonly generated: number;
  readonly tide: number;
  readonly lakeOpened: boolean;
  readonly humans: number;
}

export interface Timers {
  readonly firstJoinAt: number | null;
  readonly tideStartedAt: number | null;
}

export interface Pace {
  readonly lobbyMs: number;
  readonly tideMs: number;
  readonly botSeats: number;
}

export type Step =
  | { readonly kind: "open" }
  | { readonly kind: "fill"; readonly count: number }
  | { readonly kind: "wait" }
  | { readonly kind: "seatBots"; readonly count: number }
  | { readonly kind: "start" }
  | { readonly kind: "turnTide" }
  | { readonly kind: "requestScores" }
  | { readonly kind: "revealScores" }
  | { readonly kind: "openLake" };

export function nextStep(view: RoundView | null, timers: Timers, now: number, pace: Pace): Step {
  if (!view || view.stage === Stage.None) return { kind: "open" };
  if (view.stage === Stage.Lobby) return lobbyStep(view, timers, now, pace);
  if (view.stage === Stage.Fishing) {
    if (timers.tideStartedAt !== null && now - timers.tideStartedAt < pace.tideMs) return { kind: "wait" };
    return { kind: "turnTide" };
  }
  if (view.stage === Stage.Finished) return { kind: "requestScores" };
  if (view.stage === Stage.Revealing) return { kind: "revealScores" };
  if (!view.lakeOpened) return { kind: "openLake" };
  return { kind: "open" };
}

function lobbyStep(view: RoundView, timers: Timers, now: number, pace: Pace): Step {
  if (view.generated < TABLE.cells) return { kind: "fill", count: Math.min(TABLE.fillBatch, TABLE.cells - view.generated) };
  if (view.humans === 0) return { kind: "wait" };
  const bots = view.seats - view.humans;
  const wanted = Math.min(pace.botSeats, TABLE.maxSeats - view.humans) - bots;
  if (wanted > 0) return { kind: "seatBots", count: wanted };
  if (view.seats === TABLE.maxSeats) return { kind: "start" };
  if (timers.firstJoinAt !== null && now - timers.firstJoinAt >= pace.lobbyMs) return { kind: "start" };
  return { kind: "wait" };
}

export function botCastTimes(tideStartedAt: number, tideMs: number, casts: number, jitter: () => number): number[] {
  const slot = tideMs / (casts + 1.5);
  return Array.from({ length: casts }, (_, i) => Math.round(tideStartedAt + slot * (i + 0.4 + jitter() * 0.6)));
}
