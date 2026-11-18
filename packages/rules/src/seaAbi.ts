export const SEA_ABI = [
  "function keeper() view returns (address)",
  "function generated() view returns (uint8)",
  "function fillSea(uint8 count)",
  "function join(address session, bytes consent)",
  "function joinDigest(address player) view returns (bytes32)",
  "function gates(address player) view returns (uint32 casts, uint32 castsAtPost, uint32 castsAtNet)",
  "function cast(uint8 cell, bytes32 choice, bytes proof)",
  "function setNet(bytes32 cell, bytes proof)",
  "function postScore(string name)",
  "function confirmScore(address player, bytes cleartexts, bytes proof)",
  "function playerOf(address session) view returns (address)",
  "function anglerInfo(address player) view returns (address session, uint32 casts, bool posting, uint32 posted, uint64 postedAt)",
  "function castResult(address player) view returns (bytes32 weight, bytes32 rareNear, bytes32 levNear, bytes32 snagged)",
  "function scoreHandle(address player) view returns (bytes32)",
  "function postHandle(address player) view returns (bytes32)",
  "function netInfo(uint8 slot) view returns (address owner, uint64 until)",
  "function cellHandle(uint8 cell) view returns (bytes32)",
  "function leviathanHandle() view returns (bytes32)",
  "event SeaFilled(uint8 generated)",
  "event Joined(address indexed player, address session)",
  "event CastMade(address indexed player, uint8 cell)",
  "event NetSet(address indexed player, uint8 slot, uint64 until)",
  "event ScorePostRequested(address indexed player, string name)",
  "event ScorePosted(address indexed player, uint32 score)",
  "error NotKeeper()",
  "error BadBatch()",
  "error SeaNotReady()",
  "error AlreadyJoined()",
  "error SessionTaken()",
  "error ZeroSession()",
  "error NotSession()",
  "error BadCell()",
  "error TooManyNets()",
  "error NetsFull()",
  "error NameTooLong()",
  "error AlreadyPosting()",
  "error NothingToPost()",
  "error BadConsent()",
  "error NothingNewToPost()",
  "error NeedMoreCasts()",
] as const;

export const SEA = {
  cells: 64,
  fillBatch: 4,
  netSlots: 8,
  netsPerPlayer: 2,
  castsPerNet: 3,
  netLifetimeMs: 3_600_000,
  nameBytes: 64,
  castGas: 12_000_000n,
  fillGas: 6_500_000n,
  netGas: 1_000_000n,
  joinGas: 1_000_000n,
  postGas: 700_000n,
  confirmGas: 600_000n,
} as const;

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
