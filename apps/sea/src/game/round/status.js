import { Stage, TABLE } from "@nephelimna/rules";

export const JOIN_REACH = 160;

const clock = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function mySeat(snapshot, address) {
  if (!snapshot || !address) return null;
  return snapshot.seats.find((seat) => seat.player.toLowerCase() === address.toLowerCase()) ?? null;
}

export function describeRound(snapshot, me, local, now) {
  if (!snapshot || !snapshot.round) return { phase: "offline", line: "Round server is starting", detail: "", canJoin: false };
  const round = snapshot.round;
  const seat = mySeat(snapshot, me);
  const skew = now - snapshot.receivedAt + snapshot.now;
  if (local.joining) return { phase: "joining", line: local.joining, detail: `Round ${round.id}`, canJoin: false };
  if (round.stage === Stage.Lobby) {
    if (round.generated < TABLE.cells) return { phase: "filling", line: "The lake is being stocked", detail: `${round.generated} of ${TABLE.cells} squares, encrypted on chain`, canJoin: false };
    if (!seat) {
      const near = local.distance <= JOIN_REACH;
      return { phase: "lobby", line: `Round ${round.id} is open`, detail: near ? `${round.seats} of ${TABLE.maxSeats} boats` : "Return to the harbour to join", canJoin: near };
    }
    const wait = round.lobbyEndsAt === null ? "Waiting for the keeper" : `Starts in ${clock(round.lobbyEndsAt - skew)}`;
    return { phase: "seated", line: wait, detail: `${round.seats} of ${TABLE.maxSeats} boats · you are seat ${seat.seat + 1}`, canJoin: false };
  }
  if (round.stage === Stage.Fishing) {
    const left = round.tideEndsAt === null ? "" : ` · ${clock(round.tideEndsAt - skew)}`;
    if (!seat) return { phase: "watching", line: `Round ${round.id} is under way`, detail: `Tide ${round.tide} of ${TABLE.tides}${left} · next lobby opens after it`, canJoin: false };
    return { phase: "fishing", line: `Tide ${round.tide} of ${TABLE.tides}${left}`, detail: `Casts ${local.castsLeft} of ${TABLE.castsPerTide} · your catch ${local.points} pts`, canJoin: false };
  }
  if (round.stage === Stage.Finished || round.stage === Stage.Revealing) return { phase: "revealing", line: "The round is over", detail: "Scores are being decrypted and proven on chain", canJoin: false };
  return { phase: "revealed", line: `Round ${round.id} is revealed`, detail: "Next lobby opens in a moment", canJoin: false };
}

export function rankFinal(final, me) {
  return final.scores
    .map((score, seat) => {
      const player = final.players[seat];
      const mine = Boolean(me) && player.toLowerCase() === me.toLowerCase();
      return { seat, score, mine, name: mine ? "You" : (final.names[seat] ?? `Angler ${player.slice(2, 6)}`) };
    })
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function castsLeftNow(seat, localUsed) {
  if (!seat) return 0;
  return Math.max(0, Math.min(seat.castsLeft, TABLE.castsPerTide - localUsed));
}
