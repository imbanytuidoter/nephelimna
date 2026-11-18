# Nephelimna

A 3D sea fishing game on one always-on encrypted sea: what lives in every square, your depth and bait, the hidden nets and every total stay encrypted on Zama FHEVM.

Built for the Zama Developer Program, Mainnet Season 5, Confidential Gaming. Sepolia only.

- Play: https://nephelimna.imbanytui.xyz/sea/
- Contract: [`0x05371fD71D88D57c5A6B7419538bF50601237c2E`](https://sepolia.etherscan.io/address/0x05371fD71D88D57c5A6B7419538bF50601237c2E) (`NepheSea`, Sepolia)
- Video: VIDEO_ID

## Play it in two minutes

No wallet and no test ETH needed. The page makes a session key in your browser and a faucet tops it up.

1. Open the link. You start at the pier with a `Controls` window on the left. Every row in it is also a button.
2. Sail into the 8 by 8 chart squares around the island (`W A S D`, chart on `M`), press `G` to drop anchor.
3. Pick depth (`1 2 3`) and bait (`B`), hold `Space` or the mouse to aim, let go to cast. Your first cast puts your boat on chain, once per browser.
4. The float waits while the cast is sealed, mined and decrypted for you; the big button shows each step with its seconds. Then the fish bites and you reel it in, or the line comes back empty.
5. Your total is shown at the top and only you can read it. **Post my score** opens it once with a proof and puts it on the **Leaderboard**.

Coins, the fish market, flags and the net purchase are kept in the browser and backed up on the save server under your progress code, not on chain. Every fish comes from the encrypted sea.

AI anglers run by the sea service fish only while people are at sea. They are marked AI on the leaderboard and over their boats, and they cast and post through the same contract as everyone else.

## What is encrypted

| Thing | Who can see it | How |
|---|---|---|
| The sea: 64 squares, three depths each, rarity and stock | nobody, not even the keeper | `FHE.randEuint16` per square, never decrypted |
| The Leviathan's square | nobody | `FHE.randEuint8(64)`, moves when it is caught |
| Depth and bait of a cast | only the caster | one encrypted `euint8` input per cast, never revealed |
| What a cast caught | only the caster | result handles are allowed to the caster's session key |
| Sonar: is a rare fish or the Leviathan in a neighbouring square | only the caster | encrypted flags over the eight neighbours |
| Hidden nets | only their owner | the square is an encrypted input; a net takes a rival's common or uncommon catch there and scores it three times |
| Totals | only their owner, until posted | encrypted counters, readable by the owner's key |

Public by design: who joined, which square each cast went to, who set a net and when (not where), posted totals.

## What a rival cannot learn

- **Whether your cast caught anything.** A miss, a catch, the Leviathan and a netted catch run the same sequence of FHE operations. A fresh square is rolled on every cast and kept only after a catch, with `FHE.select`. Gas and HCU depend only on the public square and the number of live nets. Encrypted conditions are never used in `if`, `require` or `revert`.
- **Where the rare fish are.** A square that gave a fish is rerolled in the same transaction, so a catch tells nobody, not even you, what is there now.
- **Where a net is.** Nets live in eight global slots, so writing one never shows its square. Every live net of another player has its owner's total rewritten on every cast, hit or not.

## Fairness

- **Randomness is on chain.** The keeper only calls `fillSea`; it supplies no values and cannot read what was generated. Restocking happens inside the player's own cast.
- **Posted totals are proven.** `postScore` marks the stored total handle for public decryption; `confirmScore` accepts the cleartext only with a KMS proof checked by `FHE.checkSignatures` against that stored handle, once. A forged value and a replayed proof are both rejected; both were tried on Sepolia.
- **Every board row links to the transaction** that checked its proof.
- **Limit of the check:** depth and bait stay encrypted forever, so nobody can replay a single cast. Trust in the per-cast arithmetic comes from the contract code and the FHEVM, not from a replay.

## Measured on Sepolia (2026-11-16)

| Action | Gas |
|---|---|
| Cast, no live nets | 3.8M to 4.3M |
| Cast with 6 live nets of other players | 6.1M |
| Fill 4 squares of the sea | 4.35M |
| Join | 0.64M |
| Set a hidden net | 0.59M |
| Post a total | 0.29M |
| Confirm a posted total with its proof | 0.48M |

A cast took 12 to 56 seconds from encryption to a decrypted result: about 4 to 7 s to encrypt, 5 to 12 s to mine, 3 to 44 s for the user decryption. Opening a posted total took 3 s once, and more than ten minutes once, so the service keeps retrying until the proof arrives.

## How it is built

```
apps/sea            game client: three.js (WebGL2), plain JS, no framework
  src/ocean         vendored Ultra Water ocean (MIT), see its LICENSE and notices
  src/game          our code: boat, harbour, fishing, market, chart
  src/game/sea      chain side: session key, sealed casts, hidden nets, totals, board
contracts           NepheSea + libraries NepheLake, NepheCast, NepheTraps, NepheScore, NepheReveal
packages/rules      rules engine shared by client, service and parity tests; contract ABI
services/bots       sea service: keeper, board, faucet for guest keys, RPC proxy, presence
infra               Caddy site and systemd unit
```

The browser encrypts and sends its own casts with `@zama-fhe/sdk` and decrypts its own results. The sea service never sees depth, bait, a catch or a total before it is posted. It fills the sea once, reads the contract events for the board, and submits the proven confirmation of each posted total.

## Run it

Node 22.23.4 or newer and pnpm 10.

```bash
pnpm install
pnpm test
```

Contract tests (mock FHEVM, includes HCU measurements, a forged total and a replayed proof):

```bash
pnpm --filter @nephelimna/contracts test
```

Client in dev mode, proxying `/api` to a local table service on port 3430:

```bash
pnpm --filter @nephelimna/sea dev
```

Sea service. It needs `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `SEA_ADDRESS` and `SEA_STATE_FILE` in the environment, and `SEA_START_BLOCK` set to the deploy block on first start:

```bash
cd services/bots && node --import tsx src/table/main.ts
```

On a server, `infra/systemd/nephelimna-table.service` runs it as user `nephelimna` from `/srv/nephelimna` with Node 22.23.4 or newer on the path and the env files in `/etc/nephelimna`. Put a different user, checkout or Node path in a drop-in, `/etc/systemd/system/nephelimna-table.service.d/host.conf`; clear `EnvironmentFile=` and `ExecStart=` there before setting new values.

A scripted run on a fresh sea on Sepolia with gas and latency rows (fill, casts with and without nets, a posted total with a forged and a replayed proof):

```bash
cd contracts && npx hardhat run scripts/live-sea.ts --network sepolia
```

## Known limits

- Guest keys live in the browser's local storage and are not part of the progress code. Clearing it loses the boat and its sealed total; the code brings back coins, hold and position.
- The faucet and the keeper are paid by one key; the faucet is rate limited per address, per IP and per day.
- The eight net slots are shared by every player and joining is free, so many fresh boats could hold all of them.
- A posted score waits for the keeper to relay its proof. While the keeper is down, that player cannot post again.
- Coins, the net purchase and flags are kept in the browser and on the save server, not on chain.
- A posted total is public at that moment; the difference between two posts shows what was caught in between. The player decides when to post.
- The sonar fires often because rare fish are common in the current sea tables.
- Wallet connect is not wired yet; every player is a guest.

## Credits and licences

MIT, see `LICENSE`. Third-party work is listed in `CREDITS.md`: the Ultra Water ocean (MIT), CC0 sounds, public domain fish illustrations by the U.S. Fish and Wildlife Service.
