import { TABLE, TABLE_ABI, packChoice } from "@nephelimna/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const abi = parseAbi(TABLE_ABI);
const GAS_PRICE_FLOOR = 5_000_000n;
const GAS_PRICE_HEADROOM = 3n;
const RECEIPT_TIMEOUT_MS = 120_000;
const DECRYPT_TIMEOUT_MS = 45_000;
const DECRYPT_TRIES = 6;
const RETRY_MS = 2500;
const READ_TRIES = 8;
const BALANCE_TRIES = 40;
const AUDIT_CHUNK = 16;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(tries, run) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= tries) throw error;
      await pause(RETRY_MS);
    }
  }
}

export function createTable({ rpcUrl, address, key }) {
  const account = privateKeyToAccount(key);
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const sdk = new ZamaSDK(createConfig({ chains: [{ ...zamaSepolia, network: rpcUrl }], publicClient, walletClient, relayers: { [zamaSepolia.id]: web() } }));

  let queue = Promise.resolve();
  /** Two transactions from the session key at once would take the same nonce, so they are sent one after another. */
  const send = (functionName, args, gas) => {
    const next = queue.then(() => sendNow(functionName, args, gas));
    queue = next.catch(() => undefined);
    return next;
  };

  const sendNow = async (functionName, args, gas) => {
    const live = await publicClient.getGasPrice();
    const gasPrice = live * GAS_PRICE_HEADROOM > GAS_PRICE_FLOOR ? live * GAS_PRICE_HEADROOM : GAS_PRICE_FLOOR;
    const hash = await walletClient.sendTransaction({ to: address, data: encodeFunctionData({ abi, functionName, args }), gas, gasPrice, type: "legacy" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    if (receipt.status !== "success") throw new Error(`${functionName} was refused by the contract`);
    return receipt;
  };

  const encrypt = (values) => sdk.encrypt({ values: values.map((value) => ({ type: "euint8", value: BigInt(value) })), contractAddress: address, userAddress: account.address });

  return {
    address: account.address,
    async waitForGas(floor) {
      for (let i = 0; i < BALANCE_TRIES; i++) {
        if ((await publicClient.getBalance({ address: account.address })) >= floor) return true;
        await pause(RETRY_MS);
      }
      return false;
    },
    balance: () => publicClient.getBalance({ address: account.address }),
    join: (id) => send("join", [id, account.address], TABLE.joinGas),
    async setNets(id, seat, a, b) {
      const enc = await encrypt([a, b]);
      return send("setNets", [id, seat, enc.encryptedValues[0], enc.encryptedValues[1], enc.inputProof], TABLE.netsGas);
    },
    /** A node behind the one that mined the cast still serves the previous cast's handles, so the result is read at the cast's own block. */
    async cast(id, seat, cell, depth, bait, onStage = () => {}) {
      onStage("Encrypting");
      const enc = await encrypt([packChoice(depth, bait)]);
      onStage("Sent to Sepolia");
      const receipt = await send("cast", [id, seat, cell, enc.encryptedValues[0], enc.inputProof], TABLE.castGas);
      onStage("Decrypting result");
      const handles = await retry(READ_TRIES, () => publicClient.readContract({ address, abi, functionName: "castResult", args: [id, seat], blockNumber: receipt.blockNumber }));
      const clear = await retry(DECRYPT_TRIES, () => sdk.decryption.decryptValues(handles.map((encryptedValue) => ({ encryptedValue, contractAddress: address })), { timeout: DECRYPT_TIMEOUT_MS }));
      const [weight, rareNear, levNear, snagged] = handles.map((handle) => clear[handle]);
      return { points: Number(weight), rareNear: Boolean(rareNear), leviathanNear: Boolean(levNear), snagged: Boolean(snagged) };
    },
    /** Everything here comes from the chain and the Zama relayer, not from our server, so the round can be checked against the table the server showed. */
    async audit(final) {
      const seats = await Promise.all(final.players.map((_, seat) => publicClient.readContract({ address, abi, functionName: "seatInfo", args: [final.round, seat] })));
      const logs =
        final.fromBlock == null || final.toBlock == null
          ? null
          : await publicClient.getContractEvents({ address, abi, eventName: "CastMade", args: { round: final.round }, fromBlock: BigInt(final.fromBlock), toBlock: BigInt(final.toBlock) });
      const lake = [];
      for (let from = 0; from < TABLE.cells; from += AUDIT_CHUNK) {
        const handles = await Promise.all(Array.from({ length: AUDIT_CHUNK }, (_, i) => publicClient.readContract({ address, abi, functionName: "cellHandle", args: [final.round, from + i] })));
        const opened = await retry(DECRYPT_TRIES, () => sdk.decryption.decryptPublicValues(handles, { timeout: DECRYPT_TIMEOUT_MS }));
        lake.push(...handles.map((handle) => Number(opened.clearValues[handle])));
      }
      const levHandle = await publicClient.readContract({ address, abi, functionName: "leviathanHandle", args: [final.round] });
      const lev = await retry(DECRYPT_TRIES, () => sdk.decryption.decryptPublicValues([levHandle], { timeout: DECRYPT_TIMEOUT_MS }));
      return {
        scores: seats.map((seat) => Number(seat[4])),
        players: seats.map((seat) => seat[0]),
        casts: logs && logs.map((log) => ({ seat: log.args.seat, cell: log.args.cell, tide: log.args.tide })),
        lake,
        leviathan: Number(lev.clearValues[levHandle]),
      };
    },
    dispose: () => sdk.dispose(),
  };
}
