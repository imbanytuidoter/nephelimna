import { expect } from "chai";
import { network } from "hardhat";
import { DEPTHS, Rarity, packCell, unpackCell, type Cell } from "@nephelimna/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

const hex = (value: string): `0x${string}` => value as `0x${string}`;

describe("LakeSmoke", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  it("extracts the same layer bits as the rules engine", async function () {
    const cell: Cell = [{ rarity: Rarity.Common, stock: 2 }, { rarity: Rarity.Rare, stock: 1 }, { rarity: Rarity.Mythic, stock: 3 }];
    const lake = await ethers.deployContract("LakeSmoke");
    await (await lake.seed(packCell(cell))).wait();
    for (const depth of DEPTHS) {
      await (await lake.pick(depth)).wait();
      const bits = Number(await fhevm.cleartextDb.readUint8({ euint8: hex(await lake.layer()) }));
      expect(unpackCell(bits)[0]).to.deep.equal(cell[depth]);
    }
  });
});
