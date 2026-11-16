import { mkdirSync, writeFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";
import { Bait, Depth, POINTS, Rarity, bites, unpackCell } from "@nephelimna/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

type Row = { action: string; hcu: number; depth: number; gas: string };
const rows: Row[] = [];
const OUT = process.env.TABLE_OUT;
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const choiceOf = (depth: Depth, bait: Bait) => depth | (bait << 2);
const GAS = { gasLimit: 16_000_000 };
const BATCH = 6;
const HOUR = 3600;
const DEPTHS = [Depth.Surface, Depth.Middle, Depth.Bottom];
const BAITS = [Bait.Worm, Bait.Spoon, Bait.LiveFish];

async function measure(action: string, tx: { wait: () => Promise<{ hash: string; gasUsed: bigint } | null> }): Promise<Row> {
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt");
  const info = await fhevm.computeTransactionHCU(receipt.hash);
  const row = { action, hcu: info.globalHCU, depth: info.maxHCUDepth, gas: receipt.gasUsed.toString() };
  rows.push(row);
  return row;
}

async function sea(players: number, fill = true) {
  const signers = await ethers.getSigners();
  const keeper = signers[0]!;
  const contract = await ethers.deployContract("NepheSea", [keeper.address]);
  const address = await contract.getAddress();
  const fresh = async () => {
    const wallet = ethers.Wallet.createRandom(ethers.provider);
    await (await keeper.sendTransaction({ to: wallet.address, value: ethers.parseEther("5") })).wait();
    return wallet;
  };
  const wallets = signers.slice(1, 1 + players);
  const sessions: (typeof keeper | Awaited<ReturnType<typeof fresh>>)[] = [];
  for (let i = 0; i < players; i++) sessions.push(signers[11 + i] ?? (await fresh()));
  for (let i = 0; i < players; i++) await (await contract.connect(wallets[i]!).join(sessions[i]!.address)).wait();
  if (fill) for (let done = 0; done < 64; done += BATCH) await (await contract.fillSea(Math.min(BATCH, 64 - done), GAS)).wait();
  const cellAt = async (i: number) => Number(await fhevm.cleartextDb.readUint16({ euint16: hex(await contract.cellHandle(i)) }));
  const leviathan = async () => Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await contract.leviathanHandle()) }));
  const score = async (i: number) => Number(await fhevm.cleartextDb.readUint32({ euint32: hex(await contract.scoreHandle(wallets[i]!.address)) }));
  const cast = async (i: number, cell: number, choice: number) => {
    const session = sessions[i]!;
    const enc = await fhevm.helpers.encryptUint8({ value: choice, contractAddress: address, userAddress: session.address });
    return contract.connect(session).cast(cell, enc.externalEuint8, enc.inputProof, GAS);
  };
  const setNet = async (i: number, cell: number) => {
    const session = sessions[i]!;
    const enc = await fhevm.helpers.encryptUint8({ value: cell, contractAddress: address, userAddress: session.address });
    return contract.connect(session).setNet(enc.externalEuint8, enc.inputProof, GAS);
  };
  const result = async (i: number) => {
    const [weight, rareNear, levNear, snagged] = await contract.castResult(wallets[i]!.address);
    return {
      weight: Number(await fhevm.cleartextDb.readUint8({ euint8: hex(weight) })),
      rareNear: await fhevm.cleartextDb.readBool({ ebool: hex(rareNear) }),
      levNear: await fhevm.cleartextDb.readBool({ ebool: hex(levNear) }),
      snagged: await fhevm.cleartextDb.readBool({ ebool: hex(snagged) }),
    };
  };
  const find = async (want: (rarity: Rarity, stock: number, cell: number) => boolean) => {
    for (let i = 0; i < 64; i++) {
      const cell = unpackCell(await cellAt(i));
      for (const d of DEPTHS) {
        const bait = BAITS.find((b) => bites(b, cell[d].rarity));
        if (bait !== undefined && cell[d].stock > 0 && want(cell[d].rarity, cell[d].stock, i)) return { cell: i, depth: d, bait, rarity: cell[d].rarity };
      }
    }
    return null;
  };
  return { contract, address, keeper, wallets, sessions, signers, cellAt, leviathan, score, cast, setNet, result, find, fresh };
}

type Sea = Awaited<ReturnType<typeof sea>>;

async function seaWith(players: number, want: (rarity: Rarity, stock: number, cell: number) => boolean, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const s = await sea(players);
    const spot = await s.find(want);
    if (spot) return { s, spot };
  }
  throw new Error("no sea had a matching square");
}

async function later(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("NepheSea", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  after(function () {
    if (!OUT) return;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/sea-mock.json`, JSON.stringify(rows, null, 2));
  });

  describe("filling the sea", function () {
    it("is filled only by the keeper, in bounded batches, once, and casting waits for the last square", async function () {
      const s = await sea(1, false);
      await expect(s.contract.connect(s.wallets[0]!).fillSea(1, GAS)).to.be.revertedWithCustomError(s.contract, "NotKeeper");
      await expect(s.contract.fillSea(7, GAS)).to.be.revertedWithCustomError(s.contract, "BadBatch");
      await expect(s.contract.fillSea(0, GAS)).to.be.revertedWithCustomError(s.contract, "BadBatch");
      await measure("fill 6 squares", await s.contract.fillSea(6, GAS));
      await expect(s.cast(0, 3, 0)).to.be.revertedWithCustomError(s.contract, "SeaNotReady");
      for (let done = 6; done < 64; done += BATCH) await (await s.contract.fillSea(Math.min(BATCH, 64 - done), GAS)).wait();
      expect(await s.contract.generated()).to.equal(64n);
      await expect(s.contract.fillSea(1, GAS)).to.be.revertedWithCustomError(s.contract, "BadBatch");
      expect(await s.leviathan()).to.be.lessThan(64);
    });
  });

  describe("joining", function () {
    it("lets a player join once with a session key nobody else uses", async function () {
      const s = await sea(2, false);
      const [session] = await s.contract.anglerInfo(s.wallets[0]!.address);
      expect(session).to.equal(s.sessions[0]!.address);
      expect(await s.contract.playerOf(s.sessions[1]!.address)).to.equal(s.wallets[1]!.address);
      await expect(s.contract.connect(s.wallets[0]!).join(s.signers[9]!.address)).to.be.revertedWithCustomError(s.contract, "AlreadyJoined");
      await expect(s.contract.connect(s.signers[5]!).join(s.sessions[1]!.address)).to.be.revertedWithCustomError(s.contract, "SessionTaken");
      await expect(s.contract.connect(s.signers[5]!).join(ethers.ZeroAddress)).to.be.revertedWithCustomError(s.contract, "ZeroSession");
    });
  });

  describe("casting", function () {
    it("scores the rules engine's points for a catch, lets the player read the total, and rerolls the square", async function () {
      const { s, spot } = await seaWith(2, () => true);
      const handle = await s.contract.cellHandle(spot.cell);
      await measure("cast, catch", await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait)));
      expect((await s.result(0)).weight).to.equal(POINTS[spot.rarity]);
      expect(await s.score(0)).to.equal(POINTS[spot.rarity]);
      expect(await s.score(1)).to.equal(0);
      expect(await s.contract.cellHandle(spot.cell)).to.not.equal(handle);
      const total = await fhevm.helpers.decryptUint32({ euint32: hex(await s.contract.scoreHandle(s.wallets[0]!.address)), contractAddress: s.address, userAddress: s.sessions[0]!.address });
      expect(total).to.equal(POINTS[spot.rarity]);
      const [, casts] = await s.contract.anglerInfo(s.wallets[0]!.address);
      expect(casts).to.equal(1n);
    });

    it("catches nothing with the wrong bait and leaves the square as it was", async function () {
      const { s, spot } = await seaWith(1, (rarity) => BAITS.some((b) => !bites(b, rarity)));
      const wrong = BAITS.find((b) => !bites(b, spot.rarity))!;
      const before = await s.cellAt(spot.cell);
      await measure("cast, miss", await s.cast(0, spot.cell, choiceOf(spot.depth, wrong)));
      expect((await s.result(0)).weight).to.equal(0);
      expect(await s.cellAt(spot.cell)).to.equal(before);
      expect(await s.score(0)).to.equal(0);
    });

    it("costs the same encrypted work for a miss and a catch", async function () {
      const { s, spot } = await seaWith(1, (rarity) => BAITS.some((b) => !bites(b, rarity)));
      const wrong = BAITS.find((b) => !bites(b, spot.rarity))!;
      const miss = await measure("cast, miss (pair)", await s.cast(0, spot.cell, choiceOf(spot.depth, wrong)));
      const hit = await measure("cast, catch (pair)", await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait)));
      expect(hit.hcu).to.equal(miss.hcu);
      expect(hit.depth).to.equal(miss.depth);
    });

    it("lands the Leviathan with live fish at the bottom of its square, then moves it", async function () {
      const s = await sea(1);
      const at = await s.leviathan();
      const handle = await s.contract.leviathanHandle();
      await measure("cast, leviathan", await s.cast(0, at, choiceOf(Depth.Bottom, Bait.LiveFish)));
      expect((await s.result(0)).weight).to.equal(100);
      expect(await s.score(0)).to.equal(100);
      expect(await s.contract.leviathanHandle()).to.not.equal(handle);
    });

    it("tells the caster when rare fish or the Leviathan are in a neighbouring square", async function () {
      const { s, spot } = await seaWith(1, (rarity) => rarity >= Rarity.Rare);
      const neighbour = spot.cell % 8 === 7 ? spot.cell - 1 : spot.cell + 1;
      await (await s.cast(0, neighbour, choiceOf(Depth.Surface, Bait.Worm))).wait();
      expect((await s.result(0)).rareNear).to.equal(true);
      const lev = await s.leviathan();
      const beside = lev % 8 === 7 ? lev - 1 : lev + 1;
      await (await s.cast(0, beside, choiceOf(Depth.Surface, Bait.Worm))).wait();
      expect((await s.result(0)).levNear).to.equal(true);
    });

    it("accepts casts only from a joined session key and only on the 64 squares", async function () {
      const s = await sea(1);
      const enc = await fhevm.helpers.encryptUint8({ value: 0, contractAddress: s.address, userAddress: s.wallets[0]!.address });
      await expect(s.contract.connect(s.wallets[0]!).cast(5, enc.externalEuint8, enc.inputProof, GAS)).to.be.revertedWithCustomError(s.contract, "NotSession");
      await expect(s.cast(0, 64, 0)).to.be.revertedWithCustomError(s.contract, "BadCell");
    });
  });

  describe("hidden nets", function () {
    it("takes a small catch for the net owner, times three, and the caster sees only that it was snagged", async function () {
      const { s, spot } = await seaWith(2, (rarity) => rarity <= Rarity.Uncommon);
      await measure("set net", await s.setNet(1, spot.cell));
      await measure("cast, netted, 1 net", await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait)));
      const r = await s.result(0);
      expect(r.snagged).to.equal(true);
      expect(r.weight).to.equal(0);
      expect(await s.score(0)).to.equal(0);
      expect(await s.score(1)).to.equal(POINTS[spot.rarity] * 3);
    });

    it("never nets the owner's own cast and stops working after an hour", async function () {
      const { s, spot } = await seaWith(2, (rarity) => rarity <= Rarity.Uncommon);
      await (await s.setNet(0, spot.cell)).wait();
      await (await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      expect((await s.result(0)).snagged).to.equal(false);
      expect(await s.score(0)).to.equal(POINTS[spot.rarity]);
      const again = await s.find((rarity) => rarity <= Rarity.Uncommon);
      if (!again) this.skip();
      await (await s.setNet(1, again!.cell)).wait();
      await later(HOUR + 1);
      await (await s.cast(0, again!.cell, choiceOf(again!.depth, again!.bait))).wait();
      expect((await s.result(0)).snagged).to.equal(false);
    });

    it("allows two live nets per player and eight in the whole sea", async function () {
      const s = await sea(5);
      await (await s.setNet(0, 1)).wait();
      await (await s.setNet(0, 2)).wait();
      await expect(s.setNet(0, 3)).to.be.revertedWithCustomError(s.contract, "TooManyNets");
      for (let i = 1; i < 4; i++) for (const c of [10 + i, 20 + i]) await (await s.setNet(i, c)).wait();
      await expect(s.setNet(4, 40)).to.be.revertedWithCustomError(s.contract, "NetsFull");
      const [owner, until] = await s.contract.netInfo(0);
      expect(owner).to.equal(s.wallets[0]!.address);
      expect(until).to.be.greaterThan(0n);
      await later(HOUR + 1);
      await (await s.setNet(4, 40)).wait();
    });

    it("costs the same encrypted work whether a live net catches or not", async function () {
      const { s, spot } = await seaWith(3, (rarity) => rarity <= Rarity.Uncommon);
      await (await s.setNet(1, spot.cell)).wait();
      await (await s.setNet(2, (spot.cell + 9) % 64)).wait();
      const netted = await measure("cast, 2 nets, netted", await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait)));
      const free = await measure("cast, 2 nets, free", await s.cast(0, spot.cell, choiceOf(spot.depth, Bait.LiveFish)));
      expect((await s.result(0)).snagged).to.equal(false);
      expect(netted.hcu).to.equal(free.hcu);
      expect(netted.depth).to.equal(free.depth);
    });
  });

  describe("posting a score", function () {
    it("opens the total once with a proof, refuses a forged value and a replay, and keeps the name", async function () {
      const { s, spot } = await seaWith(1, () => true);
      await (await s.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      const player = s.wallets[0]!.address;
      await expect(s.contract.connect(s.sessions[0]!).postScore("x".repeat(65))).to.be.revertedWithCustomError(s.contract, "NameTooLong");
      await expect(s.contract.confirmScore(player, "0x", "0x")).to.be.revertedWithCustomError(s.contract, "NothingToPost");
      await expect(s.contract.connect(s.sessions[0]!).postScore("Old Salt")).to.emit(s.contract, "ScorePostRequested").withArgs(player, "Old Salt");
      await expect(s.contract.connect(s.sessions[0]!).postScore("Old Salt")).to.be.revertedWithCustomError(s.contract, "AlreadyPosting");
      await (await s.cast(0, (spot.cell + 1) % 64, choiceOf(Depth.Surface, Bait.Worm))).wait();
      const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicUint32WithSignatures({ euint32: hex(await s.contract.postHandle(player)) });
      expect(clearValue).to.equal(POINTS[spot.rarity]);
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [999]);
      await expect(s.contract.confirmScore(player, forged, checkSignaturesArgs.decryptionProof)).to.be.revert(ethers);
      await expect(s.contract.confirmScore(player, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.emit(s.contract, "ScorePosted").withArgs(player, POINTS[spot.rarity]);
      await expect(s.contract.confirmScore(player, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.be.revertedWithCustomError(s.contract, "NothingToPost");
      const [, , posting, posted] = await s.contract.anglerInfo(player);
      expect(posting).to.equal(false);
      expect(posted).to.equal(BigInt(POINTS[spot.rarity]));
    });

    it("lets only a joined session ask to post", async function () {
      const s: Sea = await sea(1, false);
      await expect(s.contract.connect(s.signers[8]!).postScore("Nobody")).to.be.revertedWithCustomError(s.contract, "NotSession");
    });
  });
});
