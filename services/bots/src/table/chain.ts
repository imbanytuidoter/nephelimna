import { TABLE_ABI } from "@nephelimna/rules";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, type PrivateKeyAccount, type PublicClient, type TransactionReceipt, createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const abi = parseAbi(TABLE_ABI);
const RECEIPT_TIMEOUT_MS = 120_000;
const GAS_PRICE_FLOOR = 5_000_000n;
const GAS_PRICE_HEADROOM = 3n;
/** Paying a brand new address costs more than the classic 21 000 gas on Sepolia, so the transfer is estimated, never assumed. */
const PAY_GAS_HEADROOM_PCT = 130n;

export interface Chain {
  readonly publicClient: PublicClient;
  readonly table: Hex;
  readonly sdk: ZamaSDK;
  readonly read: <T>(functionName: string, args: readonly unknown[], blockNumber?: bigint) => Promise<T>;
  readonly send: (account: PrivateKeyAccount, functionName: string, args: readonly unknown[], gas: bigint) => Promise<TransactionReceipt>;
  readonly pay: (account: PrivateKeyAccount, to: Hex, value: bigint) => Promise<TransactionReceipt>;
}

export function createChain(rpcUrl: string, table: Hex, keeper: PrivateKeyAccount): Chain {
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain: sepolia, transport }) as PublicClient;
  const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain: sepolia, transport });
  const sdk = new ZamaSDK(
    createConfig({
      chains: [{ ...zamaSepolia, network: rpcUrl }],
      publicClient,
      walletClient: wallet(keeper),
      storage: new MemoryStorage(),
      relayers: { [zamaSepolia.id]: node() },
    }),
  );
  const queues = new Map<Hex, Promise<unknown>>();

  /** Two transactions from one key sent at once would race for the same nonce, so each key sends in turn. */
  const inTurn = <T>(address: Hex, run: () => Promise<T>): Promise<T> => {
    const next = (queues.get(address) ?? Promise.resolve()).then(run, run);
    queues.set(
      address,
      next.catch(() => undefined),
    );
    return next;
  };

  const gasPrice = async () => {
    const live = await publicClient.getGasPrice();
    return live * GAS_PRICE_HEADROOM > GAS_PRICE_FLOOR ? live * GAS_PRICE_HEADROOM : GAS_PRICE_FLOOR;
  };

  const settle = async (hash: Hex, label: string) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    if (receipt.status !== "success") throw new Error(`${label} reverted in ${hash}`);
    return receipt;
  };

  return {
    publicClient,
    table,
    sdk,
    read: (functionName, args, blockNumber) =>
      publicClient.readContract({ address: table, abi, functionName: functionName as never, args: args as never, ...(blockNumber ? { blockNumber } : {}) }) as Promise<never>,
    send: (account, functionName, args, gas) =>
      inTurn(account.address, async () => {
        const data = encodeFunctionData({ abi, functionName: functionName as never, args: args as never });
        const hash = await wallet(account).sendTransaction({ to: table, data, gas, gasPrice: await gasPrice(), type: "legacy" });
        return settle(hash, functionName);
      }),
    pay: (account, to, value) =>
      inTurn(account.address, async () => {
        const estimate = await publicClient.estimateGas({ account: account.address, to, value });
        const hash = await wallet(account).sendTransaction({ to, value, gas: (estimate * PAY_GAS_HEADROOM_PCT) / 100n, gasPrice: await gasPrice(), type: "legacy" });
        return settle(hash, "payment");
      }),
  };
}
