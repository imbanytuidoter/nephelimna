import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { type Hex, isAddress } from "viem";
import { type Presence, createPresence } from "./presence.js";
import { createSaves } from "./saves.js";

const WINDOW_MS = 600_000;
const DRIPS_PER_IP = 4;
const RPC_PER_MINUTE = 600;
const MAX_BODY = 262_144;
const PRESENCE_PER_MINUTE = 900;
const PRESENCE_BODY = 1_024;
const SAVE_BODY = 16_384;
const SAVES_PER_MINUTE = 30;
const RPC_TIMEOUT_MS = 20_000;
const DRIPS_PER_IP_DAILY = 12;
const METHOD_LOG_CHARS = 64;
const DAY_MS = 86_400_000;
const RPC_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_estimateGas",
  "eth_sendRawTransaction",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByNumber",
  "eth_getLogs",
  "net_version",
]);

export interface Routes {
  readonly state: () => unknown;
  readonly drip: (address: Hex) => Promise<{ ok: boolean; reason?: string }>;
  readonly rpcUrl: string;
  readonly dailyDrips: number;
  readonly savesFile?: string | null;
  readonly log: (entry: Record<string, unknown>) => void;
  readonly presence?: Presence;
}

export function createLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number, weight = 1): boolean => {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length + weight > limit) {
      hits.set(key, recent);
      return false;
    }
    for (let i = 0; i < weight; i++) recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, times] of hits) if (times.every((time) => now - time >= windowMs)) hits.delete(k);
    return true;
  };
}

function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || request.socket.remoteAddress || "local";
}

async function readBody(request: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("bad json");
  }
}

class BadRequest extends Error {}

function reply(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

export function rpcAllowed(body: unknown): boolean {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20) return false;
  return calls.every((call) => typeof call === "object" && call !== null && RPC_METHODS.has((call as { method?: unknown }).method as string));
}

/** Wallet libraries cache "method not found" (-32601) and stop retrying, but treat an HTTP error as a transient failure and try again before every transaction. */
export function rpcRefusal(body: unknown): unknown {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20 || !calls.every((call) => typeof call === "object" && call !== null)) return null;
  const answers = calls.map((call) => {
    const { id = null, method } = call as { id?: unknown; method?: unknown };
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `the method ${String(method)} does not exist/is not available` } };
  });
  return Array.isArray(body) ? answers : answers[0];
}

export function createHttp(routes: Routes) {
  const dripByIp = createLimiter(DRIPS_PER_IP, WINDOW_MS);
  const dripByAddress = createLimiter(1, WINDOW_MS);
  const dripDaily = createLimiter(routes.dailyDrips, DAY_MS);
  const dripByIpDaily = createLimiter(DRIPS_PER_IP_DAILY, DAY_MS);
  const rpcByIp = createLimiter(RPC_PER_MINUTE, 60_000);
  const presenceByIp = createLimiter(PRESENCE_PER_MINUTE, 60_000);
  const presence = routes.presence ?? createPresence();
  const savesByIp = createLimiter(SAVES_PER_MINUTE, 60_000);
  const saves = createSaves(routes.savesFile ?? null);

  return createServer((request, response) => {
    void (async () => {
      const path = (request.url ?? "/").split("?")[0];
      const now = Date.now();
      try {
        if (request.method === "GET" && path === "/state") return reply(response, 200, routes.state());
        if (request.method === "POST" && path === "/presence") {
          if (!presenceByIp(clientIp(request), now)) return reply(response, 429, { error: "slow down" });
          const body = (await readBody(request, PRESENCE_BODY)) as Record<string, unknown>;
          const boats = presence.update(body, now);
          if (!boats) return reply(response, 400, { error: "bad position" });
          return reply(response, 200, { boats: boats.map(({ at, ...boat }) => ({ ...boat, age: now - at })) });
        }
        if (request.method === "POST" && path === "/save") {
          if (!savesByIp(clientIp(request), now)) return reply(response, 429, { ok: false, reason: "slow down" });
          const body = (await readBody(request, SAVE_BODY)) as { key?: unknown; data?: unknown };
          return saves.put(body.key, body.data, now) ? reply(response, 200, { ok: true }) : reply(response, 400, { ok: false, reason: "bad save" });
        }
        if (request.method === "POST" && path === "/load") {
          if (!savesByIp(clientIp(request), now)) return reply(response, 429, { ok: false, reason: "slow down" });
          const body = (await readBody(request, PRESENCE_BODY)) as { key?: unknown };
          const data = saves.get(body.key);
          return data === null ? reply(response, 404, { ok: false, reason: "no save under that code" }) : reply(response, 200, { ok: true, data });
        }
        if (request.method === "POST" && path === "/leave") {
          const body = (await readBody(request, PRESENCE_BODY)) as { id?: unknown };
          if (typeof body.id === "string") presence.leave(body.id);
          return reply(response, 200, { ok: true });
        }
        if (request.method === "POST" && path === "/drip") {
          const body = (await readBody(request)) as { address?: unknown };
          if (typeof body.address !== "string" || !isAddress(body.address)) return reply(response, 400, { ok: false, reason: "bad address" });
          const address = body.address.toLowerCase() as Hex;
          if (!dripByIp(clientIp(request), now) || !dripByIpDaily(clientIp(request), now) || !dripByAddress(address, now)) return reply(response, 429, { ok: false, reason: "slow down" });
          if (!dripDaily("all", now)) return reply(response, 429, { ok: false, reason: "the faucet is empty for today" });
          const result = await routes.drip(address);
          return reply(response, result.ok ? 200 : 503, result);
        }
        if (request.method === "POST" && path === "/rpc") {
          const body = await readBody(request);
          if (!rpcByIp(clientIp(request), now, Array.isArray(body) ? Math.max(1, body.length) : 1)) return reply(response, 429, { error: "slow down" });
          if (!rpcAllowed(body)) {
            routes.log({ event: "rpc-refused", methods: (Array.isArray(body) ? body : [body]).slice(0, 5).map((call) => String((call as { method?: unknown })?.method).slice(0, METHOD_LOG_CHARS)) });
            const refusal = rpcRefusal(body);
            return refusal ? reply(response, 200, refusal) : reply(response, 400, { error: "method not allowed" });
          }
          const upstream = await fetch(routes.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
          response.writeHead(upstream.status, { "content-type": "application/json", "cache-control": "no-store" });
          return response.end(await upstream.text());
        }
        return reply(response, 404, { error: "not found" });
      } catch (error) {
        if (error instanceof BadRequest) return reply(response, 400, { error: error.message });
        routes.log({ event: "http-error", path, error: String(error).slice(0, 200) });
        return reply(response, 500, { error: "server error" });
      }
    })();
  });
}
