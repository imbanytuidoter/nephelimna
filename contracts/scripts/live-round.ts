import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { node } from "@zama-fhe/sdk/node";
import { JsonRpcProvider, Wallet } from "ethers";
import { network } from "hardhat";
import { unpackCell } from "@nephelimna/rules";

const STATE = process.env.LIVE_STATE ?? join(homedir(), ".config/nephelimna/live-round.json");
const OUT = process.env.LIVE_OUT ?? join(process.cwd(), "../docs/research/table-sepolia.json");
const SEATS = Number(process.env.LIVE_SEATS ?? 10);
const FILL_BATCH = Number(process.env.LIVE_FILL_BATCH ?? 4);
const HEAVY = { gasLimit: 16_700_000 };
const STIPEND = "0.01";
const CELLS = 64;
const DECRYPT_TRIES = 40;
const DECRYPT_PAUSE_MS = 6000;

type Row = { action: string; gas: string; seconds: number; note?: string | undefined };
type State = { address?: string; id?: number; players: string[]; sessions: string[]; done: string[]; rows: Row[] };

const { ethers } = await network.connect();
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl || !deployerKey) throw new Error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY are required");
const keeperWallet = new Wallet(deployerKey, new JsonRpcProvider(rpcUrl));
const zamaSepolia = { ...sepolia, network: rpcUrl };
const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], signer: keeperWallet, storage: new MemoryStorage(), relayers: { [zamaSepolia.id]: node() } }));
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { players: [], sessions: [], done: [], rows: [] };
const save = () => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  chmodSync(STATE, 0o600);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ address: state.address, round: state.id, seats: SEATS, rows: state.rows }, null, 2));
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
  const table = await ethers.deployContract("NepheTable", [keeper.address]);
  const receipt = await table.deploymentTransaction()!.wait();
  state.address = await table.getAddress();
  state.rows.push({ action: "deploy NepheTable", gas: receipt!.gasUsed.toString(), seconds: (Date.now() - started) / 1000 });
  say("deployed", state.address);
});
const table = await ethers.getContractAt("NepheTable", state.address!);
const address = state.address!;

await step("wallets", async () => {
  for (let i = 0; i < SEATS; i++) {
    state.players.push(ethers.Wallet.createRandom().privateKey);
    state.sessions.push(i === 0 ? "keeper" : ethers.Wallet.createRandom().privateKey);
  }
});
const players = state.players.map((key) => new ethers.Wallet(key, ethers.provider));
const sessions = state.sessions.map((key) => (key === "keeper" ? keeper : new ethers.Wallet(key, ethers.provider)));
const sessionAddress = async (i: number) => sessions[i]!.getAddress();

await step("fund", async () => {
  for (const wallet of [...players, ...sessions.slice(1)]) {
    await (await keeper.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther(STIPEND) })).wait();
  }
});

await step("open", async () => {
  await measure("open round", () => table.openRound());
  state.id = Number(await table.roundCount());
});
const id = state.id!;

await step("join", async () => {
  for (let i = 0; i < SEATS; i++) {
    const session = await sessionAddress(i);
    if (i === 0 || i === SEATS - 1) await measure(`join seat ${i}`, () => table.connect(players[i]!).join(id, session));
    else await (await table.connect(players[i]!).join(id, session)).wait();
  }
});

await step("fill", async () => {
  let generated = Number((await table.roundInfo(id)).generated);
  while (generated < CELLS) {
    const count = Math.min(FILL_BATCH, CELLS - generated);
    await measure(`fill lake, ${count} squares`, () => table.fillLake(id, count, HEAVY));
    generated += count;
  }
});

await step("start", async () => {
  await measure(`start round, ${SEATS} seats`, () => table.startRound(id, HEAVY));
});

await step("nets", async () => {
  for (let i = 1; i < SEATS; i++) {
    const user = await sessionAddress(i);
    const enc = await sdk.encrypt({
      values: [
        { type: "euint8", value: 27n },
        { type: "euint8", value: BigInt((i * 5) % CELLS) },
      ],
      contractAddress: hex(address),
      userAddress: hex(user),
    });
    const send = () => table.connect(sessions[i]!).setNets(id, i, enc.encryptedValues[0]!, enc.encryptedValues[1]!, enc.inputProof);
    if (i === 1) await measure("set nets", send);
    else await (await send()).wait();
  }
});

const castOnce = async (cell: number, choice: number, note: string) => {
  const started = Date.now();
  const enc = await sdk.encrypt({ values: [{ type: "euint8", value: BigInt(choice) }], contractAddress: hex(address), userAddress: hex(keeper.address) });
  const encryptSeconds = (Date.now() - started) / 1000;
  await measure(`cast, ${SEATS} seats, ${SEATS - 1} nets`, () => table.connect(keeper).cast(id, 0, cell, enc.encryptedValues[0]!, enc.inputProof, HEAVY), `${note}; encrypt ${encryptSeconds.toFixed(1)}s`);
  const [weight, rareNear] = await table.castResult(id, 0);
  const both = await retry("cast result", () =>
    sdk.decryption.decryptValues([
      { encryptedValue: hex(weight), contractAddress: hex(address) },
      { encryptedValue: hex(rareNear), contractAddress: hex(address) },
    ]),
  );
  const caught = { value: both.value[hex(weight)], seconds: both.seconds };
  state.rows.push({ action: "user decrypt of catch and sonar", gas: "0", seconds: caught.seconds, note: `weight ${caught.value}, rare near ${both.value[hex(rareNear)]}` });
  save();
  say("catch", caught.value, "in", caught.seconds, "s");
};

await step("casts", async () => {
  await castOnce(27, 0 | (0 << 2), "netted interior square, surface worm");
  await castOnce(27, 1 | (1 << 2), "netted interior square, middle spoon");
  await castOnce(0, 2 | (2 << 2), "corner square, bottom live fish");
  await castOnce(36, 2 | (0 << 2), "interior square, bottom worm");
});

await step("tides", async () => {
  await measure("turn tide", () => table.turnTide(id, HEAVY));
  await (await table.turnTide(id, HEAVY)).wait();
  await (await table.turnTide(id, HEAVY)).wait();
});

await step("request", async () => {
  await measure(`request scores, ${SEATS} seats`, () => table.requestScores(id, HEAVY));
});

await step("reveal", async () => {
  const handles: `0x${string}`[] = [];
  for (let s = 0; s < SEATS; s++) handles.push(hex(await table.scoreHandle(id, s)));
  const { value: res, seconds } = await retry("scores", () => sdk.decryption.decryptPublicValues(handles));
  const args = { abiEncodedCleartexts: res.abiEncodedClearValues, decryptionProof: res.decryptionProof };
  const words = (args.abiEncodedCleartexts.length - 2) / 64;
  const scores = Array.from({ length: words }, (_, i) => Number(BigInt(`0x${args.abiEncodedCleartexts.slice(2 + i * 64, 66 + i * 64)}`)));
  state.rows.push({ action: `public decrypt of ${SEATS} scores`, gas: "0", seconds, note: `scores ${scores.join(",")}` });
  const forged = `0x${(BigInt(`0x${args.abiEncodedCleartexts.slice(2, 66)}`) + 50n).toString(16).padStart(64, "0")}${args.abiEncodedCleartexts.slice(66)}`;
  let forgedRejected = false;
  try {
    await table.revealScores.staticCall(id, forged, args.decryptionProof);
  } catch {
    forgedRejected = true;
  }
  if (!forgedRejected) throw new Error("forged scores were accepted");
  await measure(`reveal scores, ${SEATS} seats`, () => table.revealScores(id, args.abiEncodedCleartexts, args.decryptionProof, HEAVY), "forged value rejected first");
  let replayRejected = false;
  try {
    await table.revealScores.staticCall(id, args.abiEncodedCleartexts, args.decryptionProof);
  } catch {
    replayRejected = true;
  }
  const stored = [];
  await sleep(15_000);
  for (let s = 0; s < SEATS; s++) stored.push(Number((await table.seatInfo(id, s)).finalScore));
  state.rows.push({ action: "reveal checks", gas: "0", seconds: 0, note: `replay rejected ${replayRejected}; stored ${stored.join(",")}; match ${stored.join() === scores.join()}` });
});

await step("lake", async () => {
  if (!(await table.lakeOpened(id))) await measure("open lake, 64 squares and leviathan", () => table.openLake(id, HEAVY));
  const handles: `0x${string}`[] = [];
  for (let i = 0; i < CELLS; i++) handles.push(hex(await table.cellHandle(id, i)));
  const started = Date.now();
  let values: bigint[] = [];
  let requests = 1;
  try {
    const res = await sdk.decryption.decryptPublicValues(handles);
    values = handles.map((handle) => BigInt(res.clearValues[handle] as bigint));
  } catch (error) {
    say("one request for 64 squares failed:", String(error).slice(0, 400));
    requests = 4;
    values = [];
    for (let from = 0; from < CELLS; from += 16) {
      const part = handles.slice(from, from + 16);
      const { value: res } = await retry(`lake ${from}`, () => sdk.decryption.decryptPublicValues(part));
      values.push(...part.map((handle) => BigInt(res.clearValues[handle] as bigint)));
    }
  }
  const leviathan = hex(await table.leviathanHandle(id));
  const { value: lev } = await retry("leviathan", () => sdk.decryption.decryptPublicValues([leviathan]));
  state.rows.push({
    action: "public decrypt of 64 squares",
    gas: "0",
    seconds: (Date.now() - started) / 1000,
    note: `${requests} request(s); leviathan at ${lev.clearValues[leviathan]}; squares 27,0,36: ${[27, 0, 36].map((i) => JSON.stringify(unpackCell(Number(values[i])))).join(" ")}`,
  });
  writeFileSync(OUT.replace(".json", "-lake.json"), JSON.stringify(values.map(Number)));
});

save();
sdk.terminate();
say("balance left", ethers.formatEther(await ethers.provider.getBalance(keeper.address)));
for (const row of state.rows) say(`${row.action} | ${row.gas} | ${row.seconds.toFixed(1)}s | ${(row.note ?? "").slice(0, 70)}`);
