import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error("no deployer account");
const table = await ethers.deployContract("NepheTable", [deployer.address]);
const receipt = await table.deploymentTransaction()?.wait();
if (!receipt || receipt.status !== 1) throw new Error("deploy failed");
const out = {
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  NepheTable: await table.getAddress(),
  keeper: deployer.address,
  deployedAt: new Date().toISOString().slice(0, 10),
  deployTx: receipt.hash,
  gasUsed: receipt.gasUsed.toString(),
};
writeFileSync(join(process.cwd(), "../deployments/sepolia.next.json"), JSON.stringify(out, null, 2));
process.stdout.write(`${JSON.stringify(out)}\n`);
