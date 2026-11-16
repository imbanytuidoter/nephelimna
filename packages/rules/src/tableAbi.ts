export const TABLE_ABI = [
  "function keeper() view returns (address)",
  "function roundCount() view returns (uint32)",
  "function lakeOpened(uint32 id) view returns (bool)",
  "function openRound() returns (uint32)",
  "function join(uint32 id, address session)",
  "function fillLake(uint32 id, uint8 count)",
  "function startRound(uint32 id)",
  "function setNets(uint32 id, uint8 seat, bytes32 a, bytes32 b, bytes proof)",
  "function cast(uint32 id, uint8 seat, uint8 cell, bytes32 choice, bytes proof)",
  "function turnTide(uint32 id)",
  "function requestScores(uint32 id)",
  "function revealScores(uint32 id, bytes cleartexts, bytes proof)",
  "function openLake(uint32 id)",
  "function roundInfo(uint32 id) view returns (uint8 stage, uint8 seats, uint8 generated, uint8 tide)",
  "function seatInfo(uint32 id, uint8 seat) view returns (address player, address session, uint8 castsLeft, bool netsSet, uint32 finalScore)",
  "function seatOf(uint32 id, address player) view returns (uint8)",
  "function castResult(uint32 id, uint8 seat) view returns (bytes32 weight, bytes32 rareNear, bytes32 levNear, bytes32 snagged)",
  "function scoreHandle(uint32 id, uint8 seat) view returns (bytes32)",
  "function cellHandle(uint32 id, uint8 cell) view returns (bytes32)",
  "function leviathanHandle(uint32 id) view returns (bytes32)",
  "event RoundOpened(uint32 indexed round)",
  "event Joined(uint32 indexed round, uint8 seat, address player, address session)",
  "event RoundStarted(uint32 indexed round, uint8 seats)",
  "event NetsSet(uint32 indexed round, uint8 seat, uint8 tide)",
  "event CastMade(uint32 indexed round, uint8 seat, uint8 cell, uint8 tide)",
  "event TideTurned(uint32 indexed round, uint8 tide)",
  "event RoundFinished(uint32 indexed round)",
  "event ScoresRevealed(uint32 indexed round, uint32[] scores)",
  "error WrongStage()",
  "error TableFull()",
  "error AlreadySeated()",
  "error SessionTaken()",
  "error NoCastsLeft()",
  "error NetsAlreadySet()",
] as const;

export const TABLE = {
  cells: 64,
  maxSeats: 10,
  tides: 3,
  castsPerTide: 6,
  fillBatch: 4,
  noSeat: 255,
  castGas: 9_000_000n,
  fillGas: 6_500_000n,
  netsGas: 1_500_000n,
  joinGas: 1_200_000n,
} as const;

export const Stage = { None: 0, Lobby: 1, Fishing: 2, Finished: 3, Revealing: 4, Revealed: 5 } as const;

export const POINTS_LEVIATHAN = 100;

export function packChoice(depth: number, bait: number): number {
  return depth | (bait << 2);
}

export function rarityFromPoints(points: number): number {
  if (points >= 25) return 4;
  if (points >= 8) return 3;
  if (points >= 3) return 2;
  if (points >= 1) return 1;
  return 0;
}
