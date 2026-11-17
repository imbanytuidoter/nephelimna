import { SEA } from "@nephelimna/rules";

export function describeSea(snapshot, local) {
  if (!snapshot) return { phase: "offline", line: "Cannot reach the chain right now", detail: "Fishing waits for the server", canPost: false };
  if (!snapshot.ready) return { phase: "filling", line: "The sea is being sealed", detail: `${snapshot.generated} of ${SEA.cells} squares encrypted on chain`, canPost: false };
  if (local.joining) return { phase: "joining", line: local.joining, detail: "Once per browser, about 20 seconds", canPost: false };
  if (!local.joined) return { phase: "open", line: `Nephelimna · ${snapshot.anglers} anglers`, detail: local.failure ?? "Cast inside the chart squares. Your first cast puts your boat on chain.", canPost: false };
  const line = `Your total: ${local.total === null ? "reading" : `${local.total} pts`}`;
  if (local.posting) return { phase: "posting", line, detail: "Posting your score with a proof", canPost: false };
  return { phase: "fishing", line, detail: local.failure ?? "Only you can see it until you post it", canPost: (local.total ?? 0) > 0 };
}

export function markBoard(rows, me) {
  const mine = me?.toLowerCase();
  return rows.map((row) => ({ ...row, name: row.name ?? `Angler ${row.player.slice(2, 6).toLowerCase()}`, mine: row.player.toLowerCase() === mine }));
}

export function groupBoard(rows) {
  const rank = (list) => list.map((row, i) => ({ ...row, rank: i + 1 }));
  return { people: rank(rows.filter((row) => !row.bot)), ai: rank(rows.filter((row) => row.bot)) };
}
