export const LOOT = { chance: 0.14, coins: [50, 160], twin: 3, netRefund: 200 };

export function rollLoot(random, hold) {
  const roll = random();
  if (roll < 0.6) {
    const coins = Math.round(LOOT.coins[0] + random() * (LOOT.coins[1] - LOOT.coins[0]));
    return { kind: "coins", coins, text: `${coins} coins` };
  }
  if (roll < 0.85) return { kind: "twin", twin: LOOT.twin, text: `Twin hook: your next ${LOOT.twin} fish count double in your hold` };
  if (hold.hasNet) return { kind: "coins", coins: LOOT.netRefund, text: `${LOOT.netRefund} coins` };
  return { kind: "net", text: "A hidden net. Set it in a chart square from the net button." };
}

export function applyLoot(hold, loot) {
  if (loot.kind === "coins") return { ...hold, coins: hold.coins + loot.coins };
  if (loot.kind === "twin") return { ...hold, twin: hold.twin + loot.twin };
  return { ...hold, hasNet: true };
}
