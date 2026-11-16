import { SEA, SEA_ABI, packChoice } from "@nephelimna/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const abi = parseAbi(SEA_ABI);
const GAS_PRICE_FLOOR = 5_000_000n;
const GAS_PRICE_HEADROOM = 3n;
const RECEIPT_TIMEOUT_MS = 120_000;
const DECRYPT_TIMEOUT_MS = 45_000;
const DECRYPT_TRIES = 6;
const RETRY_MS = 2500;
const READ_TRIES = 8;
const BALANCE_TRIES = 40;

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

export function createSeaChain({ rpcUrl, address, key }) {
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
    async joined() {
      const player = await publicClient.readContract({ address, abi, functionName: "playerOf", args: [account.address] });
      return !/^0x0{40}$/i.test(player);
    },
    join: () => send("join", [account.address], SEA.joinGas),
    async setNet(cell) {
      const enc = await encrypt([cell]);
      return send("setNet", [enc.encryptedValues[0], enc.inputProof], SEA.netGas);
    },
    /** A node behind the one that mined the cast still serves the previous cast's handles, so the result is read at the cast's own block. */
    async cast(cell, depth, bait, onStage = () => {}) {
      onStage("Sealing your bait");
      const enc = await encrypt([packChoice(depth, bait)]);
      onStage("Out on Sepolia");
      const receipt = await send("cast", [cell, enc.encryptedValues[0], enc.inputProof], SEA.castGas);
      onStage("Reading your catch");
      const handles = await retry(READ_TRIES, () => publicClient.readContract({ address, abi, functionName: "castResult", args: [account.address], blockNumber: receipt.blockNumber }));
      const clear = await retry(DECRYPT_TRIES, () => sdk.decryption.decryptValues(handles.map((encryptedValue) => ({ encryptedValue, contractAddress: address })), { timeout: DECRYPT_TIMEOUT_MS }));
      const [weight, rareNear, levNear, snagged] = handles.map((handle) => clear[handle]);
      return { points: Number(weight), rareNear: Boolean(rareNear), leviathanNear: Boolean(levNear), snagged: Boolean(snagged), blockNumber: receipt.blockNumber };
    },
    async total(blockNumber) {
      const handle = await retry(READ_TRIES, () => publicClient.readContract({ address, abi, functionName: "scoreHandle", args: [account.address], ...(blockNumber ? { blockNumber } : {}) }));
      const clear = await retry(DECRYPT_TRIES, () => sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress: address }], { timeout: DECRYPT_TIMEOUT_MS }));
      return Number(clear[handle]);
    },
    postScore: (name) => send("postScore", [name], SEA.postGas),
    dispose: () => sdk.dispose(),
  };
}
