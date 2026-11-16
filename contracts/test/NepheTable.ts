import { mkdirSync, writeFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";
import { Bait, Depth, POINTS, Rarity, bites, layerStep, resolveCast, unpackCell } from "@nephelimna/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

type Row = { action: string; hcu: number; depth: number; gas: string };
const rows: Row[] = [];
const OUT = process.env.TABLE_OUT;
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const choiceOf = (depth: Depth, bait: Bait) => depth | (bait << 2);
const GAS = { gasLimit: 16_000_000 };
const BATCH = 4;
const DEPTHS = [Depth.Surface, Depth.Middle, Depth.Bottom];
const BAITS = [Bait.Worm, Bait.Spoon, Bait.LiveFish];
const STAGE = { Lobby: 1n, Fishing: 2n, Finished: 3n, Revealing: 4n, Revealed: 5n };

async function measure(action: string, tx: { wait: () => Promise<{ hash: string; gasUsed: bigint } | null> }): Promise<Row> {
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt");
  const info = await fhevm.computeTransactionHCU(receipt.hash);
  const row = { action, hcu: info.globalHCU, depth: info.maxHCUDepth, gas: receipt.gasUsed.toString() };
  rows.push(row);
  return row;
}

async function open(players: number, fill = true) {
  const signers = await ethers.getSigners();
  const keeper = signers[0]!;
  const table = await ethers.deployContract("NepheTable", [keeper.address]);
  const address = await table.getAddress();
  await (await table.openRound()).wait();
  const id = 1;
  const fresh = async () => {
    const wallet = ethers.Wallet.createRandom(ethers.provider);
    await (await keeper.sendTransaction({ to: wallet.address, value: ethers.parseEther("5") })).wait();
    return wallet;
  };
  const wallets = signers.slice(1, 1 + players);
  const sessions: (typeof keeper | Awaited<ReturnType<typeof fresh>>)[] = [];
  for (let i = 0; i < players; i++) sessions.push(signers[11 + i] ?? (await fresh()));
  for (let i = 0; i < players; i++) await (await table.connect(wallets[i]!).join(id, sessions[i]!.address)).wait();
  if (fill) {
    for (let done = 0; done < 64; done += BATCH) await (await table.fillLake(id, BATCH, GAS)).wait();
    await (await table.startRound(id)).wait();
  }
  const cellAt = async (i: number) => Number(await fhevm.cleartextDb.readUint16({ euint16: hex(await table.cellHandle(id, i)) }));
  const score = async (seat: number) => Number(await fhevm.cleartextDb.readUint32({ euint32: hex(await table.scoreHandle(id, seat)) }));
  const cast = async (seat: number, cell: number, choice: number) => {
    const session = sessions[seat]!;
    const enc = await fhevm.helpers.encryptUint8({ value: choice, contractAddress: address, userAddress: session.address });
    return table.connect(session).cast(id, seat, cell, enc.externalEuint8, enc.inputProof, GAS);
  };
  const setNets = async (seat: number, a: number, b: number) => {
    const session = sessions[seat]!;
    const enc = await fhevm.client.encryptValues({
      values: [
        { type: "euint8", value: a },
        { type: "euint8", value: b },
      ],
      contractAddress: address,
      userAddress: session.address,
    });
    return table.connect(session).setNets(id, seat, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof);
  };
  const result = async (seat: number) => {
    const [weight, rareNear, levNear, snagged] = await table.castResult(id, seat);
    return {
      weight: Number(await fhevm.cleartextDb.readUint8({ euint8: hex(weight) })),
      rareNear: await fhevm.cleartextDb.readBool({ ebool: hex(rareNear) }),
      levNear: await fhevm.cleartextDb.readBool({ ebool: hex(levNear) }),
      snagged: await fhevm.cleartextDb.readBool({ ebool: hex(snagged) }),
    };
  };
  const find = async (want: (rarity: Rarity, stock: number) => boolean) => {
    for (let i = 0; i < 64; i++) {
      const cell = unpackCell(await cellAt(i));
      for (const d of DEPTHS) {
        const bait = BAITS.find((b) => bites(b, cell[d].rarity));
        if (bait !== undefined && want(cell[d].rarity, cell[d].stock)) return { cell: i, depth: d, bait, rarity: cell[d].rarity };
      }
    }
    throw new Error("no matching cell in this lake");
  };
  return { table, address, id, keeper, wallets, sessions, signers, cellAt, score, cast, setNets, result, find, fresh };
}

describe("NepheTable", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  after(function () {
    if (!OUT) return;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/table-mock.json`, JSON.stringify(rows, null, 2));
  });

  describe("lobby", function () {
    it("seats up to ten players, each with their own session key, and refuses an eleventh", async function () {
      const t = await open(10, false);
      const [stage, seats] = await t.table.roundInfo(t.id);
      expect(stage).to.equal(STAGE.Lobby);
      expect(seats).to.equal(10n);
      expect(await t.table.seatOf(t.id, t.wallets[3]!.address)).to.equal(3n);
      const late = await t.fresh();
      const spare = await t.fresh();
      await expect(t.table.connect(late).join(t.id, spare.address)).to.be.revertedWithCustomError(t.table, "TableFull");
    });

    it("refuses a second seat for the same wallet, a reused session key and a zero session", async function () {
      const t = await open(2, false);
      await expect(t.table.connect(t.wallets[0]!).join(t.id, t.signers[9]!.address)).to.be.revertedWithCustomError(t.table, "AlreadySeated");
      await expect(t.table.connect(t.signers[5]!).join(t.id, t.sessions[1]!.address)).to.be.revertedWithCustomError(t.table, "SessionTaken");
      await expect(t.table.connect(t.signers[5]!).join(t.id, ethers.ZeroAddress)).to.be.revertedWithCustomError(t.table, "ZeroSession");
    });

    it("lets only the keeper open rounds, fill the lake, start and turn tides", async function () {
      const t = await open(1, false);
      const stranger = t.wallets[0]!;
      await expect(t.table.connect(stranger).openRound()).to.be.revertedWithCustomError(t.table, "NotKeeper");
      await expect(t.table.connect(stranger).fillLake(t.id, 1, GAS)).to.be.revertedWithCustomError(t.table, "NotKeeper");
      await expect(t.table.connect(stranger).startRound(t.id)).to.be.revertedWithCustomError(t.table, "NotKeeper");
      await expect(t.table.connect(stranger).turnTide(t.id)).to.be.revertedWithCustomError(t.table, "NotKeeper");
    });

    it("does not start before the whole lake is filled, and bounds the fill batch", async function () {
      const t = await open(1, false);
      await expect(t.table.fillLake(t.id, 7, GAS)).to.be.revertedWithCustomError(t.table, "BadBatch");
      await expect(t.table.fillLake(t.id, 0, GAS)).to.be.revertedWithCustomError(t.table, "BadBatch");
      await (await t.table.fillLake(t.id, 6, GAS)).wait();
      await expect(t.table.startRound(t.id)).to.be.revertedWithCustomError(t.table, "LakeNotReady");
    });

    it("does not start an empty table and closes the lobby once the round starts", async function () {
      const empty = await open(0, false);
      for (let done = 0; done < 64; done += BATCH) await (await empty.table.fillLake(empty.id, BATCH, GAS)).wait();
      await expect(empty.table.startRound(empty.id)).to.be.revertedWithCustomError(empty.table, "NoPlayers");
      const t = await open(1);
      await expect(t.table.connect(t.signers[5]!).join(t.id, t.signers[6]!.address)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await expect(t.table.fillLake(t.id, 1, GAS)).to.be.revertedWithCustomError(t.table, "WrongStage");
    });
  });

  describe("casting", function () {
    it("gives the same catch, points and remaining stock as the rules engine", async function () {
      const t = await open(2);
      const spot = await t.find((_, stock) => stock > 0);
      const before = unpackCell(await t.cellAt(spot.cell));
      const expected = resolveCast(before, spot.depth, spot.bait);
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      expect((await t.result(0)).weight).to.equal(expected.points);
      expect(await t.score(0)).to.equal(expected.points);
      expect(await t.score(1)).to.equal(0);
      expect(unpackCell(await t.cellAt(spot.cell))).to.deep.equal(expected.cell);
    });

    it("catches nothing with the wrong bait and leaves the stock alone", async function () {
      const t = await open(1);
      const spot = await t.find((rarity, stock) => stock > 0 && BAITS.some((b) => !bites(b, rarity)));
      const wrong = BAITS.find((b) => !bites(b, spot.rarity))!;
      const before = await t.cellAt(spot.cell);
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, wrong))).wait();
      expect((await t.result(0)).weight).to.equal(0);
      expect(await t.cellAt(spot.cell)).to.equal(before);
      expect(await t.score(0)).to.equal(0);
    });

    it("accepts casts only from the seat's session key", async function () {
      const t = await open(2);
      const enc = await fhevm.helpers.encryptUint8({ value: 0, contractAddress: t.address, userAddress: t.wallets[0]!.address });
      await expect(t.table.connect(t.wallets[0]!).cast(t.id, 0, 5, enc.externalEuint8, enc.inputProof, GAS)).to.be.revertedWithCustomError(t.table, "NotSession");
      const other = await fhevm.helpers.encryptUint8({ value: 0, contractAddress: t.address, userAddress: t.sessions[1]!.address });
      await expect(t.table.connect(t.sessions[1]!).cast(t.id, 0, 5, other.externalEuint8, other.inputProof, GAS)).to.be.revertedWithCustomError(t.table, "NotSession");
      await expect(t.table.connect(t.sessions[1]!).cast(t.id, 4, 5, other.externalEuint8, other.inputProof, GAS)).to.be.revertedWithCustomError(t.table, "BadSeat");
    });

    it("rejects a cell off the lake before doing any encrypted work", async function () {
      const t = await open(1);
      await expect(t.cast(0, 64, 0)).to.be.revertedWithCustomError(t.table, "BadCell");
    });

    it("allows six casts per tide and gives them back when the tide turns", async function () {
      const t = await open(1);
      for (let i = 0; i < 6; i++) await (await t.cast(0, i, 0)).wait();
      await expect(t.cast(0, 7, 0)).to.be.revertedWithCustomError(t.table, "NoCastsLeft");
      await (await t.table.turnTide(t.id)).wait();
      await (await t.cast(0, 7, 0)).wait();
      expect((await t.table.seatInfo(t.id, 0)).castsLeft).to.equal(5n);
    });

    it("tells the caster when rare fish are in a neighbouring square", async function () {
      const t = await open(1);
      const rare = await t.find((rarity, stock) => rarity >= Rarity.Rare && stock > 0);
      const neighbour = rare.cell % 8 === 7 ? rare.cell - 1 : rare.cell + 1;
      await (await t.cast(0, neighbour, choiceOf(Depth.Surface, Bait.Worm))).wait();
      expect((await t.result(0)).rareNear).to.equal(true);
    });
  });

  describe("hidden nets", function () {
    it("give the net owner three fish worth of points for a small catch and tell the caster only that it was snagged", async function () {
      const t = await open(3);
      const spot = await t.find((rarity, stock) => rarity <= Rarity.Uncommon && rarity >= Rarity.Common && stock > 0);
      await (await t.setNets(1, spot.cell, 63)).wait();
      await (await t.setNets(2, 62, 61)).wait();
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      const seen = await t.result(0);
      expect(seen.snagged).to.equal(true);
      expect(seen.weight).to.equal(0);
      expect(await t.score(1)).to.equal(POINTS[spot.rarity]! * 3);
      expect(await t.score(0)).to.equal(0);
      expect(await t.score(2)).to.equal(0);
    });

    it("do not take rare fish", async function () {
      const t = await open(2);
      const spot = await t.find((rarity, stock) => rarity >= Rarity.Rare && stock > 0);
      await (await t.setNets(1, spot.cell, 63)).wait();
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      expect((await t.result(0)).snagged).to.equal(false);
      expect(await t.score(0)).to.equal(POINTS[spot.rarity]);
      expect(await t.score(1)).to.equal(0);
    });

    it("can be set once per tide, only by the seat's session, and stop working when the tide turns", async function () {
      const t = await open(2);
      const spot = await t.find((rarity, stock) => rarity <= Rarity.Uncommon && rarity >= Rarity.Common && stock > 1);
      await (await t.setNets(1, spot.cell, 63)).wait();
      await expect(t.setNets(1, 5, 6)).to.be.revertedWithCustomError(t.table, "NetsAlreadySet");
      const enc = await fhevm.client.encryptValues({ values: [{ type: "euint8", value: 1 }, { type: "euint8", value: 2 }], contractAddress: t.address, userAddress: t.sessions[0]!.address });
      await expect(t.table.connect(t.sessions[0]!).setNets(t.id, 1, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof)).to.be.revertedWithCustomError(t.table, "NotSession");
      await (await t.table.turnTide(t.id)).wait();
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      expect((await t.result(0)).snagged).to.equal(false);
      expect(await t.score(0)).to.equal(POINTS[spot.rarity]);
    });
  });

  describe("leviathan", function () {
    it("is caught once, only on its square, at the bottom, with live fish, and shows on the sonar next door", async function () {
      const t = await open(1);
      const pos = Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await t.table.leviathanHandle(t.id)) }));
      await (await t.cast(0, pos, choiceOf(Depth.Bottom, Bait.Spoon))).wait();
      expect((await t.result(0)).weight).to.not.equal(100);
      await (await t.cast(0, pos, choiceOf(Depth.Bottom, Bait.LiveFish))).wait();
      expect((await t.result(0)).weight).to.equal(100);
      await (await t.cast(0, pos, choiceOf(Depth.Bottom, Bait.LiveFish))).wait();
      expect((await t.result(0)).weight).to.not.equal(100);
      const neighbour = pos % 8 === 7 ? pos - 1 : pos + 1;
      await (await t.cast(0, neighbour, choiceOf(Depth.Surface, Bait.Worm))).wait();
      expect((await t.result(0)).levNear).to.equal(true);
    });
  });

  describe("stages and reveal", function () {
    it("moves only forward: three tides, finish, reveal, then nothing more", async function () {
      const t = await open(1);
      await expect(t.table.requestScores(t.id)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await (await t.table.turnTide(t.id)).wait();
      await (await t.table.turnTide(t.id)).wait();
      expect((await t.table.roundInfo(t.id)).tide).to.equal(3n);
      await (await t.table.turnTide(t.id)).wait();
      expect((await t.table.roundInfo(t.id)).stage).to.equal(STAGE.Finished);
      await expect(t.table.turnTide(t.id)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await expect(t.cast(0, 1, 0)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await expect(t.setNets(0, 1, 2)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await expect(t.table.openLake(t.id)).to.be.revertedWithCustomError(t.table, "WrongStage");
    });

    it("reveals the score with a KMS proof, rejects a forged value and cannot be replayed", async function () {
      const t = await open(1);
      const spot = await t.find((_, stock) => stock > 0);
      await (await t.cast(0, spot.cell, choiceOf(spot.depth, spot.bait))).wait();
      const expected = await t.score(0);
      for (let i = 0; i < 3; i++) await (await t.table.turnTide(t.id)).wait();
      await (await t.table.requestScores(t.id)).wait();
      await expect(t.table.requestScores(t.id)).to.be.revertedWithCustomError(t.table, "WrongStage");
      const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicUint32WithSignatures({ euint32: hex(await t.table.scoreHandle(t.id, 0)) });
      expect(Number(clearValue)).to.equal(expected);
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint32"], [Number(clearValue) + 50]);
      await expect(t.table.revealScores(t.id, forged, checkSignaturesArgs.decryptionProof)).to.be.revert(ethers);
      await measure("reveal scores, 1 seat", await t.table.revealScores(t.id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof));
      expect((await t.table.seatInfo(t.id, 0)).finalScore).to.equal(BigInt(expected));
      expect((await t.table.roundInfo(t.id)).stage).to.equal(STAGE.Revealed);
      await expect(t.table.revealScores(t.id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.be.revertedWithCustomError(t.table, "WrongStage");
      await measure("open lake, 64 squares and leviathan", await t.table.openLake(t.id, GAS));
      await expect(t.table.openLake(t.id, GAS)).to.be.revertedWithCustomError(t.table, "WrongStage");
    });
  });

  describe("cost and leaks", function () {
    it("costs the same HCU whether a cast misses, catches or is netted, with ten boats at the table", async function () {
      const t = await open(10);
      let cellIdx = -1;
      let catchChoice = 0;
      let missChoice = 0;
      for (const i of [9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30]) {
        const cell = unpackCell(await t.cellAt(i));
        for (const d of DEPTHS) {
          const hit = BAITS.find((b) => bites(b, cell[d].rarity));
          const miss = BAITS.find((b) => !bites(b, cell[d].rarity));
          if (cell[d].stock > 1 && cell[d].rarity <= Rarity.Uncommon && hit !== undefined && miss !== undefined) {
            cellIdx = i;
            catchChoice = choiceOf(d, hit);
            missChoice = choiceOf(d, miss);
            break;
          }
        }
        if (cellIdx >= 0) break;
      }
      expect(cellIdx).to.be.greaterThan(-1);
      for (let seat = 1; seat < 10; seat++) await (await t.setNets(seat, seat === 1 ? 0 : 40 + seat, 1)).wait();
      const miss = await measure("cast miss, 10 seats, 9 with nets", await t.cast(0, cellIdx, missChoice));
      const hit = await measure("cast catch, 10 seats, 9 with nets", await t.cast(0, cellIdx, catchChoice));
      await (await t.table.turnTide(t.id)).wait();
      for (let seat = 1; seat < 10; seat++) await (await t.setNets(seat, seat === 1 ? cellIdx : 40 + seat, 1)).wait();
      const snag = await measure("cast netted, 10 seats, 9 with nets", await t.cast(0, cellIdx, catchChoice));
      expect((await t.result(0)).snagged).to.equal(true);
      expect(new Set([miss.hcu, hit.hcu, snag.hcu]).size).to.equal(1);
      expect(new Set([miss.depth, hit.depth, snag.depth]).size).to.equal(1);
      expect(hit.hcu).to.be.lessThan(20_000_000);
      expect(hit.depth).to.be.lessThan(5_000_000);
      expect(BigInt(hit.gas) < 16_777_216n).to.equal(true);
    });

    it("measures the keeper's lake fill and round start", async function () {
      const t = await open(1, false);
      const row = await measure("fill lake, 6 squares", await t.table.fillLake(t.id, 6, GAS));
      expect(row.hcu).to.be.lessThan(20_000_000);
      for (let done = 6; done < 64; done += Math.min(BATCH, 64 - done)) await (await t.table.fillLake(t.id, Math.min(BATCH, 64 - done), GAS)).wait();
      await measure("start round with leviathan", await t.table.startRound(t.id));
      expect(layerStep(Depth.Middle)).to.equal(32);
    });
  });
});
