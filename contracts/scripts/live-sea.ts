import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { node } from "@zama-fhe/sdk/node";
import { JsonRpcProvider, Wallet } from "ethers";
import { network } from "hardhat";
import { SEA, packChoice } from "@nephelimna/rules";

const STATE = process.env.LIVE_STATE ?? join(homedir(), ".config/nephelimna/live-sea.json");
const OUT = process.env.LIVE_OUT ?? join(process.cwd(), "../docs/research/sea-sepolia.json");
const PLAYERS = 4;
const HEAVY = { gasLimit: 16_700_000 };
const STIPEND = "0.01";
const DECRYPT_TRIES = 40;
const DECRYPT_PAUSE_MS = 6000;

type Row = { action: string; gas: string; seconds: number; note?: string | undefined };
type State = { address?: string; players: string[]; done: string[]; rows: Row[] };

const { ethers } = await network.connect();
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl || !deployerKey) throw new Error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY are required");
const keeperWallet = new Wallet(deployerKey, new JsonRpcProvider(rpcUrl));
const zamaSepolia = { ...sepolia, network: rpcUrl };
const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], signer: keeperWallet, storage: new MemoryStorage(), relayers: { [zamaSepolia.id]: node() } }));
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { players: [], done: [], rows: [] };
const save = () => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  chmodSync(STATE, 0o600);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ address: state.address, rows: state.rows }, null, 2));
};
const say = (...parts: unknown[]) => process.stdout.write(`${parts.map(String).join(" ")}\n`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function measure(action: string, send: () => Promise<{ wait: () => Promise<{ gasUsed: bigint; status: number | null } | null> }>, note?: string) {
  const started = Date.now();
  const receipt = await (await send()).wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${action} failed`);
  const row = { action, gas: receipt.gasUsed.toString(), seconds: (Date.now() - started) / 1000, note };
  state.rows.push(row);
  save();
  say(JSON.stringify(row));
  return row;
}

async function step(name: string, run: () => Promise<void>) {
  if (state.done.includes(name)) return;
  say(`> ${name}`);
  await run();
  state.done.push(name);
  save();
}

async function retry<T>(label: string, run: () => Promise<T>): Promise<{ value: T; seconds: number }> {
  const started = Date.now();
  let last: unknown;
  for (let i = 0; i < DECRYPT_TRIES; i++) {
    try {
      return { value: await run(), seconds: (Date.now() - started) / 1000 };
    } catch (error) {
      last = error;
      await sleep(DECRYPT_PAUSE_MS);
    }
  }
  throw new Error(`${label} never became decryptable: ${String(last).slice(0, 300)}`);
}

const [keeper] = await ethers.getSigners();
if (!keeper) throw new Error("no deployer account");
say("keeper", keeper.address, "balance", ethers.formatEther(await ethers.provider.getBalance(keeper.address)));

await step("deploy", async () => {
  const started = Date.now();
  const sea = await ethers.deployContract("NepheSea", [keeper.address]);
  const receipt = await sea.deploymentTransaction()!.wait();
  state.address = await sea.getAddress();
  state.rows.push({ action: "deploy NepheSea", gas: receipt!.gasUsed.toString(), seconds: (Date.now() - started) / 1000 });
  say("deployed", state.address);
});
const sea = await ethers.getContractAt("NepheSea", state.address!);
const address = state.address!;

await step("wallets", async () => {
  for (let i = 1; i < PLAYERS; i++) state.players.push(ethers.Wallet.createRandom().privateKey);
});
const others = state.players.map((key) => new ethers.Wallet(key, ethers.provider));

await step("fund", async () => {
  for (const wallet of others) await (await keeper.sendTransaction({ to: wallet.address, value: ethers.parseEther(STIPEND) })).wait();
});

await step("join", async () => {
  await measure("join", () => sea.connect(keeper).join(keeper.address, "0x"));
  for (const wallet of others) await (await sea.connect(wallet).join(wallet.address, "0x")).wait();
});

await step("fill", async () => {
  let generated = Number(await sea.generated());
  while (generated < SEA.cells) {
    const count = Math.min(SEA.fillBatch, SEA.cells - generated);
    await measure(`fill sea, ${count} squares`, () => sea.fillSea(count, HEAVY));
    generated += count;
  }
});

const castOnce = async (cell: number, choice: number, label: string) => {
  const started = Date.now();
  const enc = await sdk.encrypt({ values: [{ type: "euint8", value: BigInt(choice) }], contractAddress: hex(address), userAddress: hex(keeper.address) });
  const encryptSeconds = (Date.now() - started) / 1000;
  await measure(label, () => sea.connect(keeper).cast(cell, enc.encryptedValues[0]!, enc.inputProof, HEAVY), `encrypt ${encryptSeconds.toFixed(1)}s`);
  const [weight, rareNear, levNear, snagged] = await sea.castResult(keeper.address);
  const read = await retry("cast result", () =>
    sdk.decryption.decryptValues([weight, rareNear, levNear, snagged].map((handle) => ({ encryptedValue: hex(handle), contractAddress: hex(address) }))),
  );
  state.rows.push({ action: "user decrypt of catch, sonar and snag", gas: "0", seconds: read.seconds, note: `weight ${read.value[hex(weight)]}, snagged ${read.value[hex(snagged)]}` });
  state.rows.push({ action: `${label}, start to result`, gas: "0", seconds: (Date.now() - started) / 1000 });
  save();
};

await step("casts without nets", async () => {
  await castOnce(27, packChoice(0, 0), "cast, interior square, no nets");
  await castOnce(0, packChoice(2, 2), "cast, corner square, no nets");
});

await step("nets", async () => {
  for (const [i, wallet] of others.entries()) {
    for (const cell of [27, (i * 7 + 3) % SEA.cells]) {
      const enc = await sdk.encrypt({ values: [{ type: "euint8", value: BigInt(cell) }], contractAddress: hex(address), userAddress: hex(wallet.address) });
      const send = () => sea.connect(wallet).setNet(enc.encryptedValues[0]!, enc.inputProof);
      if (i === 0 && cell === 27) await measure("set net", send);
      else await (await send()).wait();
    }
  }
});

await step("casts with nets", async () => {
  await castOnce(27, packChoice(0, 0), `cast, interior square, ${2 * others.length} nets`);
  await castOnce(27, packChoice(1, 1), `cast, interior square, ${2 * others.length} nets`);
});

await step("post", async () => {
  if (!(await sea.anglerInfo(keeper.address))[2]) await measure("post score", () => sea.connect(keeper).postScore("Sea test"));
  const handle = hex(await sea.postHandle(keeper.address));
  const { value: res, seconds } = await retry("posted total", () => sdk.decryption.decryptPublicValues([handle]));
  const total = Number(BigInt(`0x${res.abiEncodedClearValues.slice(2, 66)}`));
  state.rows.push({ action: "public decrypt of one total", gas: "0", seconds, note: `total ${total}` });
  const forged = `0x${(BigInt(total) + 50n).toString(16).padStart(64, "0")}`;
  let forgedRejected = false;
  try {
    await sea.confirmScore.staticCall(keeper.address, forged, res.decryptionProof);
  } catch {
    forgedRejected = true;
  }
  if (!forgedRejected) throw new Error("a forged total was accepted");
  await measure("confirm score", () => sea.confirmScore(keeper.address, res.abiEncodedClearValues, res.decryptionProof, HEAVY), "forged value rejected first");
  await sleep(12_000);
  let replayRejected = false;
  try {
    await sea.confirmScore.staticCall(keeper.address, res.abiEncodedClearValues, res.decryptionProof);
  } catch {
    replayRejected = true;
  }
  const [, casts, posting, posted] = await sea.anglerInfo(keeper.address);
  state.rows.push({ action: "post checks", gas: "0", seconds: 0, note: `replay rejected ${replayRejected}; stored ${posted}; match ${Number(posted) === total}; posting ${posting}; casts ${casts}` });
});

save();
sdk.terminate();
say("balance left", ethers.formatEther(await ethers.provider.getBalance(keeper.address)));
for (const row of state.rows) say(`${row.action} | ${row.gas} | ${row.seconds.toFixed(1)}s | ${(row.note ?? "").slice(0, 70)}`);
