import { describe, expect, test } from "vitest";
import { clientKey, createLimiter, rpcAllowed, rpcRefusal } from "../src/table/http.js";

describe("table http guards", () => {
  test("lets a key through only up to its limit inside the window", () => {
    const allow = createLimiter(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 10)).toBe(true);
    expect(allow("a", 20)).toBe(false);
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1011)).toBe(true);
  });

  test("forwards only read and raw send calls to the node", () => {
    expect(rpcAllowed({ method: "eth_call" })).toBe(true);
    expect(rpcAllowed([{ method: "eth_call" }, { method: "eth_sendRawTransaction" }])).toBe(true);
    expect(rpcAllowed({ method: "eth_sendTransaction" })).toBe(false);
    expect(rpcAllowed({ method: "debug_traceCall" })).toBe(false);
    expect(rpcAllowed([])).toBe(false);
    expect(rpcAllowed("eth_call")).toBe(false);
  });

  test("answers a refused method as a JSON-RPC method-not-found error so wallets stop asking, and rejects malformed bodies", () => {
    expect(rpcRefusal({ jsonrpc: "2.0", id: 7, method: "eth_fillTransaction" })).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32601, message: "the method eth_fillTransaction does not exist/is not available" } });
    expect(rpcRefusal([{ id: 1, method: "eth_call" }, { id: 2, method: "eth_sign" }])).toEqual([
      { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "the method eth_call does not exist/is not available" } },
      { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "the method eth_sign does not exist/is not available" } },
    ]);
    expect(rpcRefusal("eth_call")).toBeNull();
    expect(rpcRefusal([])).toBeNull();
  });
  test("keys IPv6 clients on their /64 and leaves IPv4 alone", () => {
    expect(clientKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(clientKey("2001:db8:1:2:1:1:1:1")).toBe(clientKey("2001:db8:1:2:ffff::1"));
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(clientKey("10.0.0.1")).toBe("10.0.0.1");
  });
});
