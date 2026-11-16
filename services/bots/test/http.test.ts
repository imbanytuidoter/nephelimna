import { describe, expect, test } from "vitest";
import { createLimiter, rpcAllowed } from "../src/table/http.js";

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
});
