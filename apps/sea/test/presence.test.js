import * as THREE from "three";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("three/addons/loaders/GLTFLoader.js", () => ({ GLTFLoader: class { load() {} } }));

function element() {
  return { children: [], hidden: false, textContent: "", style: {}, dataset: {}, className: "", append(child) { this.children.push(child); child.parent = this; }, remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); } };
}

function setup(boats) {
  const nodes = { "boat-tags": element(), "online-text": element() };
  const store = new Map();
  const sent = [];
  vi.stubGlobal("document", { hidden: false, getElementById: (id) => nodes[id], createElement: () => element() });
  vi.stubGlobal("sessionStorage", { getItem: () => "aaaaaaaaaaaaaaaa", setItem: () => {} });
  vi.stubGlobal("window", { location: { href: "https://example.test/sea/" } });
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("innerWidth", 800);
  vi.stubGlobal("innerHeight", 600);
  vi.stubGlobal("localStorage", { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) });
  vi.stubGlobal("fetch", async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ boats }) };
  });
  return { nodes, store, sent };
}

afterEach(() => vi.unstubAllGlobals());

describe("presence tags", () => {
  test("another boat gets a name tag placed over it on screen and the HUD counts it", async () => {
    const { nodes } = setup([{ id: "6856bd000abc467a", x: 0, y: 0, z: -60, yaw: 0 }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPresence } = await import("../src/game/presence.js");
    const { boatName } = await import("../src/game/names.js");
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.updateMatrixWorld();
    const body = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    const presence = createPresence({ scene: new THREE.Scene(), patchMaterial: () => {}, baseUrl: "/sea/", body, camera });
    expect(nodes["online-text"].textContent).toContain("alone at sea");
    presence.update(1);
    await new Promise((r) => setTimeout(r, 0));
    presence.update(0.016);
    const tags = nodes["boat-tags"].children;
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe(boatName("6856bd000abc467a"));
    expect(tags[0].hidden).toBe(false);
    expect(tags[0].dataset.far).toMatch(/^\d+ m$/);
    expect(tags[0].style.transform).toContain("translate(400");
    expect(nodes["online-text"].textContent).toContain("1 other boat");
    const [hull] = presence.hulls();
    expect(hull.ax.x).toBeCloseTo(1);
    expect(hull.ax.z).toBeCloseTo(0);
    expect(hull.halfLength).toBeGreaterThan(3);
    expect(Math.abs(hull.z + 60)).toBeLessThan(1);
  });

  test("a renamed player is sent under the new name, keeps it, and others see their chosen names", async () => {
    const { nodes, store, sent } = setup([{ id: "6856bd000abc467a", name: "Old Salt", x: 0, y: 0, z: -60, yaw: 0 }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPresence } = await import("../src/game/presence.js");
    const { boatName } = await import("../src/game/names.js");
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    const body = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    const presence = createPresence({ scene: new THREE.Scene(), patchMaterial: () => {}, baseUrl: "/sea/", body, camera });
    expect(presence.name).toBe(boatName("aaaaaaaaaaaaaaaa"));
    expect(presence.rename("<script>")).toBeNull();
    expect(presence.rename("  Морський   Вовк ")).toBe("Морський Вовк");
    expect(nodes["online-text"].textContent).toContain("You are Морський Вовк");
    expect([...store.values()]).toContain("Морський Вовк");
    presence.update(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.at(-1).name).toBe("Морський Вовк");
    expect(nodes["boat-tags"].children[0].textContent).toBe("Old Salt");
    expect(presence.rename("")).toBe(boatName("aaaaaaaaaaaaaaaa"));
    expect(store.size).toBe(0);
  });
});
