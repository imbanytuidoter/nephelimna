import { POINTS_LEVIATHAN, TABLE, unpackCell } from "@nephelimna/rules";

const BEST_FISH = 25;
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

export function checkRound(final, chain) {
  const checks = [];
  const add = (label, ok, detail) => checks.push({ label, ok, detail });
  add("Scores match the contract", same(chain.scores, final.scores), `Read from seatInfo on Sepolia: ${chain.scores.join(", ")}`);
  add(
    "Seats belong to the same keys",
    same(
      chain.players.map((player) => player.toLowerCase()),
      final.players.map((player) => player.toLowerCase()),
    ),
    `${chain.players.length} seats`,
  );
  if (chain.casts) {
    const perSeat = final.players.map((_, seat) => chain.casts.filter((cast) => cast.seat === seat).length);
    const limit = TABLE.tides * TABLE.castsPerTide;
    add("No boat cast more than the rules allow", perSeat.every((count) => count <= limit), `${chain.casts.length} casts on chain, at most ${Math.max(0, ...perSeat)} by one boat, limit ${limit}`);
    const total = final.scores.reduce((sum, score) => sum + score, 0);
    add("Total score fits the number of casts", total <= chain.casts.length * BEST_FISH + POINTS_LEVIATHAN, `${total} points from ${chain.casts.length} casts`);
  }
  if (!final.lake) add("The lake is still being opened", true, "Run the check again in a minute to compare all 64 squares");
  if (final.lake) {
    add("The opened lake matches a fresh decryption", same(chain.lake, final.lake) && chain.leviathan === final.leviathan, "64 squares and the Leviathan, decrypted again through the Zama relayer");
  }
  let valid = true;
  try {
    chain.lake.forEach((packed) => unpackCell(packed));
  } catch {
    valid = false;
  }
  add("Every square holds a legal stock", valid, "Three depths per square, rarity and count in range");
  return checks;
}

export function lakeRows(packed) {
  return unpackCell(packed).map((layer) => ({ rarity: layer.rarity, stock: layer.stock }));
}
