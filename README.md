# Nephelimna

A 3D sea fishing game where the lake, your depth and bait, the hidden nets and every score stay encrypted on Zama FHEVM until the round ends.

Built for the Zama Developer Program, Mainnet Season 5, Confidential Gaming. Sepolia only.

- Play: https://nephelimna.imbanytui.xyz/sea/
- Contract: [`0xB3757D000DBB7D6423352C7106FDb9950DAD7dCC`](https://sepolia.etherscan.io/address/0xB3757D000DBB7D6423352C7106FDb9950DAD7dCC) (`NepheTable`, Sepolia)
- Video: VIDEO_ID

## Play it in two minutes

No wallet and no test ETH needed. The page makes a session key in your browser and a faucet tops it up.

1. Open the link. You start at the pier with a `Controls` window on the left. Every row in it is also a button.
2. Press **Join round** in the panel at the top (only offered near the harbour). The lobby starts 40 seconds after the first person joins. Four bots fill the table.
3. Sail anywhere (`W A S D`), press `G` to drop anchor, then hold `Space` or the mouse to aim, let go to cast.
4. Pick depth (`1 2 3`) and bait (`B`) before the cast. The float waits 20 to 50 seconds while the cast is sealed, sent and decrypted (the big button shows the step and the seconds), then the fish bites or the line comes back empty.
5. Three tides of 2.5 minutes, six casts per tide. Then the contract opens the scores, and you can open the whole lake on the chart (`M`) and press **Verify round**.

Outside a round the sea is free roam: fish, sell at the market, buy a net and flags. That part runs in the browser only.

## What is encrypted

| Thing | Who can see it during the round | How |
|---|---|---|
| The lake: 64 squares, three depths each, rarity and stock | nobody, not even the keeper | `FHE.randEuint16` per square, never decrypted until the end |
| The Leviathan's square | nobody | `FHE.randEuint8(64)` |
| Depth and bait of a cast | only the caster | one encrypted `euint8` input per cast, never revealed, even after the round |
| What a cast caught | only the caster | result handles are allowed to the caster's session key |
| Sonar: is a rare fish or the Leviathan in a neighbouring square | only the caster | encrypted flags computed over the eight neighbours |
| Hidden nets: two squares per tide | only their owner | encrypted inputs; a net takes every common or uncommon fish a rival lands there and scores it three times |
| Scores | nobody | encrypted counters, updated for every seat on every cast |

Public by design: who sits at the table, which square each cast went to, how many casts are left, the tide.

## What a rival cannot learn

- **Whether your cast caught anything.** A miss, a catch, the Leviathan and a netted catch run the same sequence of FHE operations. Gas and HCU depend only on the public square and seat count. Encrypted conditions are never used in `if`, `require` or `revert`, only `FHE.select`.
- **Whose net fired.** Every opponent's score handle is rewritten on every cast, hit or not.
- **What is left in a square.** Stock goes down under encryption.

## Fairness

- **Randomness is on chain.** The keeper only calls `fillLake`; it supplies no values and cannot read what was generated.
- **Scores are proven.** `revealScores` accepts cleartexts only with a KMS proof checked by `FHE.checkSignatures` against the handles the contract stored itself. A forged value and a replayed reveal are both rejected; both were tried on Sepolia.
- **Stages only move forward** and each reveal runs once.
- **Verify round** in the game reads Sepolia and the Zama relayer directly, not our server, and checks: final scores, seat keys, cast counts against the rules, that the total score is possible for that many casts, and that the opened lake matches a fresh public decryption.
- **Limit of the check:** depth and bait stay encrypted forever, so nobody can replay a single cast. Trust in the per-cast arithmetic comes from the contract code and the FHEVM, not from a replay.

## Measured on Sepolia (2026-11-14)

| Action | Gas |
|---|---|
| Cast with 10 seats and 9 nets set | 5.9M to 6.5M |
| Fill 4 squares of the lake | 4.35M |
| Join | 0.75M |
| Set nets | 0.83M |
| Reveal scores, 10 seats | 0.53M |
| Open the lake, 64 squares | 8.07M |

A cast takes 20 to 50 seconds end to end in a browser: about 4 s to encrypt, 5 to 12 s to mine, 3 to 9 s for the user decryption, plus retries when a node lags. The slowest test cast took 72 s.

## How it is built

```
apps/sea            game client: three.js (WebGL2), plain JS, no framework
  src/ocean         vendored Ultra Water ocean (MIT), see its LICENSE and notices
  src/game          our code: boat, harbour, fishing, market, chart
  src/game/round    chain mode: session key, sealed casts, nets, final, verify
contracts           NepheTable + libraries NepheLake, NepheCast, NepheTraps, NepheScore, NepheReveal
packages/rules      rules engine shared by client, service and parity tests; contract ABI
services/bots       table service: keeper, bots, faucet for guest keys, RPC proxy
infra               Caddy site and systemd unit
```

The browser encrypts and sends its own casts with `@zama-fhe/sdk`. The table service never sees depth, bait or a catch. It opens rounds, stocks the lake ahead of time, turns the tides, plays the bots and submits the proven reveal.

## Run it

Node 22.23.4 or newer and pnpm 10.

```bash
pnpm install
pnpm test
```

Contract tests (19, mock FHEVM, includes HCU measurements, a forged reveal and a replayed proof):

```bash
pnpm --filter @nephelimna/contracts test
```

Client in dev mode, proxying `/api` to a local table service on port 3430:

```bash
pnpm --filter @nephelimna/sea dev
```

Table service. It needs `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `TABLE_ADDRESS`, `BOT_SEED` and `TABLE_STATE_FILE` in the environment:

```bash
cd services/bots && node --import tsx src/table/main.ts
```

A full scripted round on Sepolia with gas and latency rows:

```bash
cd contracts && npx hardhat run scripts/live-round.ts --network sepolia
```

## Known limits

- Guest keys live in the browser's local storage. Clearing it loses the seat.
- The faucet and the bots are paid by one keeper key; the faucet is rate limited per address, per IP and per day.
- Coins, the net purchase and flags are local to the browser and are not on chain.
- The sonar fires often because rare fish are common in the current lake tables.
- Wallet connect is not wired yet; every player is a guest.

## Credits and licences

MIT, see `LICENSE`. Third-party work is listed in `CREDITS.md`: the Ultra Water ocean (MIT), CC0 sounds, public domain fish illustrations by the U.S. Fish and Wildlife Service.
