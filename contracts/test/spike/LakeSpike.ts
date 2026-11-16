import { writeFileSync, mkdirSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";
import { Bait, Depth, POINTS, bites, layerStep, unpackCell } from "@nephelimna/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

type Row = { action: string; hcu: number; depth: number; gas: string; execGas?: string };
const rows: Row[] = [];
const OUT = process.env.SPIKE_OUT;
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const choiceOf = (depth: Depth, bait: Bait) => depth | (bait << 2);
const GAS = { gasLimit: 16_000_000 };
const BATCH = 4;

function calldataGas(data: string): bigint {
  const bytes = Buffer.from(data.slice(2), "hex");
  return bytes.reduce((sum, b) => sum + (b === 0 ? 4n : 16n), 0n);
}

async function measure(action: string, tx: { data: string; wait: () => Promise<{ hash: string; gasUsed: bigint } | null> }): Promise<Row> {
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt");
  const info = await fhevm.computeTransactionHCU(receipt.hash);
  const row = { action, hcu: info.globalHCU, depth: info.maxHCUDepth, gas: receipt.gasUsed.toString(), execGas: (receipt.gasUsed - calldataGas(tx.data)).toString() };
  rows.push(row);
  return row;
}

async function deploy() {
  const signers = await ethers.getSigners();
  const lake = await ethers.deployContract("LakeSpike");
  return { lake, address: await lake.getAddress(), signers };
}

async function cellAt(lake: Awaited<ReturnType<typeof deploy>>["lake"], i: number) {
  return Number(await fhevm.cleartextDb.readUint16({ euint16: hex(await lake.cellHandle(i)) }));
}

describe("LakeSpike", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  after(function () {
    if (!OUT) return;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/spike-mock.json`, JSON.stringify(rows, null, 2));
  });

  it("measures lake generation per batch size", async function () {
    const { lake } = await deploy();
    for (const count of [1, 2, 4, 6]) {
      const row = await measure(`generate ${count} cells`, await lake.generate(0, count, GAS));
      expect(row.hcu).to.be.lessThan(20_000_000);
    }
    await measure("place leviathan", await lake.placeLeviathan());
    for (let i = 0; i < 6; i++) {
      const cell = unpackCell(await cellAt(lake, i));
      for (const layer of cell) {
        if (layer.rarity === 0) expect(layer.stock).to.equal(0);
        else expect(layer.stock).to.be.within(1, 2);
      }
    }
  });

  it("casts with the same outcome as the rules engine and measures cost", async function () {
    const { lake, address, signers } = await deploy();
    for (let from = 0; from < 64; from += BATCH) await (await lake.generate(from, BATCH, GAS)).wait();
    await (await lake.placeLeviathan()).wait();
    const caster = signers[0]!;

    for (let seat = 1; seat < 6; seat++) {
      const owner = signers[0]!;
      const enc = await fhevm.client.encryptValues({
        values: [
          { type: "euint8", value: 60 + seat },
          { type: "euint8", value: 50 + seat },
        ],
        contractAddress: address,
        userAddress: owner.address,
      });
      await (await lake.setTraps(seat, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof)).wait();
    }

    let target = -1;
    let depth: Depth = Depth.Surface;
    let bait: Bait = Bait.Worm;
    for (let i = 0; i < 40 && target < 0; i++) {
      const cell = unpackCell(await cellAt(lake, i));
      for (const d of [Depth.Surface, Depth.Middle, Depth.Bottom]) {
        const layer = cell[d];
        const b = [Bait.Worm, Bait.Spoon, Bait.LiveFish].find((x) => bites(x, layer.rarity));
        if (layer.stock > 0 && b !== undefined) {
          target = i;
          depth = d;
          bait = b;
          break;
        }
      }
    }
    expect(target).to.be.greaterThan(-1);

    const before = await cellAt(lake, target);
    const expected = POINTS[unpackCell(before)[depth].rarity];
    const one = await fhevm.helpers.encryptUint8({ value: choiceOf(depth, bait), contractAddress: address, userAddress: caster.address });
    await measure("cast x1 (5 opponents with traps)", await lake.cast(0, target, one.externalEuint8, one.inputProof, GAS));
    expect(await cellAt(lake, target)).to.equal(before - layerStep(depth));
    expect(Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.lastCatch()) }))).to.equal(expected);
    expect(await fhevm.cleartextDb.readBool({ ebool: hex(await lake.lastSnagged()) })).to.equal(false);

    const two = await fhevm.client.encryptValues({
      values: [
        { type: "euint8", value: choiceOf(Depth.Bottom, Bait.Spoon) },
        { type: "euint8", value: choiceOf(Depth.Middle, Bait.Worm) },
      ],
      contractAddress: address,
      userAddress: caster.address,
    });
    try {
      await measure("cast x2 in one tx (cells 18, 19)", await lake.castTwo(0, [18, 19], [two.encryptedValues[0]!, two.encryptedValues[1]!], two.inputProof, { gasLimit: 16_777_216 }));
    } catch {
      rows.push({ action: "cast x2 in one tx (cells 18, 19)", hcu: -1, depth: -1, gas: "over 16777216" });
    }
  });

  it("gives a trapped catch to the trap owner and tells the caster only that they snagged", async function () {
    const { lake, address, signers } = await deploy();
    for (let from = 0; from < 64; from += BATCH) await (await lake.generate(from, BATCH, GAS)).wait();
    await (await lake.placeLeviathan()).wait();
    let target = -1;
    let depth: Depth = Depth.Surface;
    let bait: Bait = Bait.Worm;
    for (let i = 0; i < 64 && target < 0; i++) {
      const cell = unpackCell(await cellAt(lake, i));
      const d = [Depth.Surface, Depth.Middle, Depth.Bottom].find((x) => cell[x].stock > 0);
      if (d === undefined) continue;
      const b = [Bait.Worm, Bait.Spoon, Bait.LiveFish].find((x) => bites(x, cell[d].rarity));
      if (b === undefined) continue;
      target = i;
      depth = d;
      bait = b;
    }
    const weight = POINTS[unpackCell(await cellAt(lake, target))[depth].rarity];
    const owner = signers[0]!;
    for (const seat of [2, 3]) {
      const enc = await fhevm.client.encryptValues({
        values: [
          { type: "euint8", value: target },
          { type: "euint8", value: 63 },
        ],
        contractAddress: address,
        userAddress: owner.address,
      });
      await (await lake.setTraps(seat, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof)).wait();
    }
    const c = await fhevm.helpers.encryptUint8({ value: choiceOf(depth, bait), contractAddress: address, userAddress: owner.address });
    await (await lake.cast(0, target, c.externalEuint8, c.inputProof, GAS)).wait();
    const score = async (s: number) => Number(await fhevm.cleartextDb.readUint32({ euint32: hex(await lake.scoreHandle(s)) }));
    expect(await score(2)).to.equal(weight);
    expect(await score(3)).to.equal(0);
    expect(await score(0)).to.equal(0);
    expect(await fhevm.cleartextDb.readBool({ ebool: hex(await lake.lastSnagged()) })).to.equal(true);
    expect(Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.lastCatch()) }))).to.equal(0);
  });

  it("catches the leviathan only on its cell, at the bottom, with live fish", async function () {
    const { lake, address, signers } = await deploy();
    for (let from = 0; from < 64; from += BATCH) await (await lake.generate(from, BATCH, GAS)).wait();
    await (await lake.placeLeviathan()).wait();
    const pos = Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.levHandle()) }));
    const caster = signers[0]!;
    const wrong = await fhevm.helpers.encryptUint8({ value: choiceOf(Depth.Bottom, Bait.Spoon), contractAddress: address, userAddress: caster.address });
    await (await lake.cast(0, pos, wrong.externalEuint8, wrong.inputProof, GAS)).wait();
    expect(Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.lastCatch()) }))).to.not.equal(100);
    const right = await fhevm.helpers.encryptUint8({ value: choiceOf(Depth.Bottom, Bait.LiveFish), contractAddress: address, userAddress: caster.address });
    await (await lake.cast(0, pos, right.externalEuint8, right.inputProof, GAS)).wait();
    expect(Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.lastCatch()) }))).to.equal(100);
    const again = await fhevm.helpers.encryptUint8({ value: choiceOf(Depth.Bottom, Bait.LiveFish), contractAddress: address, userAddress: caster.address });
    await (await lake.cast(0, pos, again.externalEuint8, again.inputProof, GAS)).wait();
    expect(Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.lastCatch()) }))).to.not.equal(100);
    const neighbour = pos % 8 === 7 ? pos - 1 : pos + 1;
    const probe = await fhevm.helpers.encryptUint8({ value: choiceOf(Depth.Surface, Bait.Worm), contractAddress: address, userAddress: caster.address });
    await (await lake.cast(0, neighbour, probe.externalEuint8, probe.inputProof, GAS)).wait();
    expect(await fhevm.cleartextDb.readBool({ ebool: hex(await lake.lastLevNear()) })).to.equal(true);
  });

  it("reveals a cell through checkSignatures once and rejects a forged value", async function () {
    const { lake } = await deploy();
    await (await lake.generate(0, BATCH, GAS)).wait();
    await (await lake.startReveal(3)).wait();
    const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicUint16WithSignatures({ euint16: hex(await lake.revealHandle()) });
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint16"], [clearValue ^ 1]);
    await expect(lake.finishReveal(forged, checkSignaturesArgs.decryptionProof)).to.be.revert(ethers);
    await measure("reveal: checkSignatures 1 handle", await lake.finishReveal(checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof));
    expect(Number(await lake.revealedCell())).to.equal(clearValue);
    await expect(lake.finishReveal(checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.be.revertedWithCustomError(lake, "AlreadyRevealed");
    for (let from = BATCH; from < 64; from += BATCH) await (await lake.generate(from, BATCH, GAS)).wait();
    await measure("reveal: makePubliclyDecryptable 64 cells", await lake.revealAll(GAS));
  });

  it("costs the same HCU whether the cast catches, misses or snags", async function () {
    const { lake, address, signers } = await deploy();
    for (let from = 0; from < 64; from += BATCH) await (await lake.generate(from, BATCH, GAS)).wait();
    await (await lake.placeLeviathan()).wait();
    const caster = signers[0]!;
    let cellIdx = -1;
    let catchChoice = 0;
    let missChoice = 0;
    for (const i of [9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30]) {
      const cell = unpackCell(await cellAt(lake, i));
      for (const d of [Depth.Surface, Depth.Middle, Depth.Bottom]) {
        const hit = [Bait.Worm, Bait.Spoon, Bait.LiveFish].find((x) => bites(x, cell[d].rarity));
        const miss = [Bait.Worm, Bait.Spoon, Bait.LiveFish].find((x) => !bites(x, cell[d].rarity));
        if (cell[d].stock > 1 && hit !== undefined && miss !== undefined) {
          cellIdx = i;
          catchChoice = choiceOf(d, hit);
          missChoice = choiceOf(d, miss);
          break;
        }
      }
      if (cellIdx >= 0) break;
    }
    expect(cellIdx).to.be.greaterThan(-1);
    const castOnce = async (label: string, choice: number) => {
      const c = await fhevm.helpers.encryptUint8({ value: choice, contractAddress: address, userAddress: caster.address });
      return measure(`cast ${label} (cell ${cellIdx})`, await lake.cast(0, cellIdx, c.externalEuint8, c.inputProof, GAS));
    };
    const otherTraps = await fhevm.client.encryptValues({
      values: [
        { type: "euint8", value: 0 },
        { type: "euint8", value: 1 },
      ],
      contractAddress: address,
      userAddress: caster.address,
    });
    await (await lake.setTraps(1, otherTraps.encryptedValues[0]!, otherTraps.encryptedValues[1]!, otherTraps.inputProof)).wait();
    const miss = await castOnce("miss", missChoice);
    const hit = await castOnce("catch", catchChoice);
    const snagTraps = await fhevm.client.encryptValues({
      values: [
        { type: "euint8", value: cellIdx },
        { type: "euint8", value: 1 },
      ],
      contractAddress: address,
      userAddress: caster.address,
    });
    await (await lake.setTraps(1, snagTraps.encryptedValues[0]!, snagTraps.encryptedValues[1]!, snagTraps.inputProof)).wait();
    const snag = await castOnce("snag", catchChoice);
    expect(await fhevm.cleartextDb.readBool({ ebool: hex(await lake.lastSnagged()) })).to.equal(true);
    expect(new Set([miss.hcu, hit.hcu, snag.hcu]).size).to.equal(1);
    expect(new Set([miss.depth, hit.depth, snag.depth]).size).to.equal(1);
  });
});
