import { describe, expect, it } from "vitest";
import { cleanName, createPresence } from "../src/table/presence.js";

const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";
const at = (id: string, x = 1) => ({ id, x, y: 0.3, z: 2, yaw: 0.5 });

describe("presence", () => {
  it("returns other boats but not the sender", () => {
    const presence = createPresence();
    presence.update(at(A), 0);
    const seen = presence.update(at(B, 9), 10);
    expect(seen?.map((boat) => boat.id)).toEqual([A]);
  });

  it("drops a boat that stopped reporting", () => {
    const presence = createPresence();
    presence.update(at(A), 0);
    expect(presence.update(at(B), 20_000)).toEqual([]);
  });

  it("rejects bad ids and non finite or huge positions", () => {
    const presence = createPresence();
    expect(presence.update({ ...at(A), id: "short" }, 0)).toBeNull();
    expect(presence.update({ ...at(A), x: Number.NaN }, 0)).toBeNull();
    expect(presence.update({ ...at(A), z: 1e9 }, 0)).toBeNull();
    expect(presence.update({ ...at(A), x: "1" }, 0)).toBeNull();
  });

  it("removes a boat that leaves and caps the room", () => {
    const presence = createPresence();
    presence.update(at(A), 0);
    presence.leave(A);
    expect(presence.size(1)).toBe(0);
    for (let i = 0; i < 64; i++) presence.update(at(i.toString(16).padStart(16, "0")), 1);
    expect(presence.update(at(B), 2)).toBeNull();
  });

  it("passes the sender's own clock so others can space its reports evenly, and drops a bad one", () => {
    const presence = createPresence();
    presence.update({ ...at(A), t: 812.25 }, 0);
    expect(presence.update(at(B), 1)?.[0]?.t).toBe(812.25);
    presence.update({ ...at(A), t: "soon" }, 2);
    expect(presence.update(at(B), 3)?.[0]?.t).toBeNull();
  });

  it("passes a chosen name to other boats", () => {
    const presence = createPresence();
    presence.update({ ...at(A), name: "  Old   Salt " }, 0);
    expect(presence.update(at(B), 1)?.[0]?.name).toBe("Old Salt");
  });

  it("drops names that are too short, too long or carry markup", () => {
    expect(cleanName("Мала Щука")).toBe("Мала Щука");
    expect(cleanName("O'Neil-2")).toBe("O'Neil-2");
    expect(cleanName("x")).toBeNull();
    expect(cleanName("a".repeat(21))).toBeNull();
    expect(cleanName("<b>hi</b>")).toBeNull();
    expect(cleanName("http://spam.io")).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});
