import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { NET } from "./fishing/net.js";
import { pictureSlug } from "./fishing/species.js";
import { FLAGS, FLAG_PRICE, drawFlag } from "./flags.js";
import { buyFlag, buyNet, createHold, holdValue, parseHold, sellAll, sellKind } from "./hold.js";

const REFLECTION_LAYER = 1;
const TRADE_RANGE = 16;
const TRADE_SPEED = 3;
const STALL_SCALE = 0.86;
const STALL_INSET = 2.3;
const SAVE_KEY = "nephelimna.hold.v1";

function loadHold() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? parseHold(text) : createHold();
  } catch {
    return createHold();
  }
}

function saveHold(hold) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(hold));
  } catch (error) {
    console.warn("hold was not saved", error);
  }
}

export function marketSpot(site) {
  const reach = site.head.length / 2;
  return {
    stall: { x: site.head.center.x - site.side.x * (reach - STALL_INSET), z: site.head.center.z - site.side.z * (reach - STALL_INSET) },
    berth: { x: site.head.center.x - site.side.x * (reach + 4), z: site.head.center.z - site.side.z * (reach + 4) },
  };
}

export function canTrade(spot, boat, speed) {
  return Math.hypot(boat.x - spot.berth.x, boat.z - spot.berth.z) < TRADE_RANGE && Math.abs(speed) < TRADE_SPEED;
}

export function fishRow(item, baseUrl) {
  const row = document.createElement("li");
  const image = document.createElement("img");
  image.alt = "";
  const slug = pictureSlug(item);
  if (slug) image.src = `${baseUrl}fish/${slug}.webp`;
  const who = document.createElement("span");
  who.className = "who";
  const name = document.createElement("span");
  name.textContent = `${item.name} ×${item.count}`;
  const detail = document.createElement("small");
  const mark = document.createElement("i");
  mark.className = `rarity ${item.rarity}`;
  detail.append(mark, item.rarity);
  who.append(name, detail);
  row.append(image, who);
  return row;
}

export function placeStall({ scene, site, patchMaterial, baseUrl, onChanged }) {
  const spot = marketSpot(site);
  new GLTFLoader().load(
    `${baseUrl}models/market.glb`,
    (gltf) => {
      gltf.scene.position.set(spot.stall.x, site.deckTop, spot.stall.z);
      gltf.scene.rotation.y = Math.atan2(-site.side.x, -site.side.z);
      gltf.scene.scale.setScalar(STALL_SCALE);
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        node.layers.enable(REFLECTION_LAYER);
        for (const material of [node.material].flat()) patchMaterial(material);
      });
      scene.add(gltf.scene);
      onChanged();
    },
    undefined,
    (error) => console.error("market model failed to load", error),
  );
  return spot;
}

export function createMarket({ scene, site, patchMaterial, baseUrl, onChanged, onSold, onFlag }) {
  const spot = placeStall({ scene, site, patchMaterial, baseUrl, onChanged });

  const el = (id) => document.getElementById(id);
  const prompt = el("trade-prompt");
  const panel = el("market-panel");
  const list = el("market-list");
  const sell = el("market-sell");
  const buy = el("market-net");
  const flagGrid = el("market-flags");
  const preview = el("market-flag-preview").getContext("2d");
  const flagAct = el("market-flag-act");
  const tabs = ["sell", "gear", "flags"].map((name) => ({ name, tab: el(`market-tab-${name}`), pane: el(`market-pane-${name}`) }));
  const listeners = new Set();
  let hold = loadHold();
  let near = false;
  let open = false;
  let picked = hold.flag;

  const commit = (next) => {
    if (next === hold) return;
    hold = next;
    render();
  };
  const flagButtons = Object.keys(FLAGS).map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 60;
    drawFlag(canvas.getContext("2d"), id, 96, 60);
    const label = document.createElement("span");
    button.append(canvas, label);
    button.addEventListener("click", () => {
      picked = id;
      if (hold.flags.includes(id)) commit(buyFlag(hold, id, FLAG_PRICE));
      render();
    });
    flagGrid.append(button);
    return { id, button, label };
  });

  const renderSell = () => {
    list.replaceChildren(
      ...hold.items.map((item) => {
        const row = fishRow(item, baseUrl);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Sell ${item.value}`;
        button.addEventListener("click", () => {
          onSold?.();
          commit(sellKind(hold, item.name, item.rarity));
        });
        row.append(button);
        return row;
      }),
    );
    const value = holdValue(hold);
    const fish = hold.items.reduce((sum, item) => sum + item.count, 0);
    el("market-empty").hidden = fish > 0;
    el("market-total-row").hidden = fish === 0;
    el("market-total").textContent = `${value}`;
    el("market-tab-sell-note").textContent = fish ? `${fish} fish` : "empty";
    sell.hidden = fish === 0;
    sell.textContent = `Sell everything for ${value}`;
  };
  const renderGear = () => {
    const note = "Use the Net button in a chart square to set a hidden net for an hour. When a rival lands a common or uncommon fish there, you score it three times. Where you set it stays encrypted.";
    el("market-net-note").textContent = hold.hasNet ? note : `${note} ${NET.price} coins.`;
    buy.hidden = hold.hasNet;
    el("market-net-owned").hidden = !hold.hasNet;
    buy.textContent = `Buy ${NET.price}`;
    buy.disabled = hold.coins < NET.price;
  };
  const renderFlags = () => {
    const owned = hold.flags.includes(picked);
    drawFlag(preview, picked, 224, 140);
    el("market-flag-name").textContent = FLAGS[picked].name;
    el("market-flag-state").textContent = hold.flag === picked ? "Flying on your boat" : owned ? "Yours" : `${FLAG_PRICE} coins`;
    flagAct.hidden = hold.flag === picked;
    flagAct.textContent = owned ? "Fly this flag" : `Buy and fly for ${FLAG_PRICE}`;
    flagAct.disabled = !owned && hold.coins < FLAG_PRICE;
    for (const { id, button, label } of flagButtons) {
      const have = hold.flags.includes(id);
      label.textContent = have ? FLAGS[id].name : `${FLAG_PRICE}`;
      button.setAttribute("aria-label", have ? FLAGS[id].name : `${FLAGS[id].name}, ${FLAG_PRICE} coins`);
      button.classList.toggle("locked", !have);
      button.classList.toggle("selected", id === picked);
    }
    el("market-tab-flags-note").textContent = `${hold.flags.length} of ${flagButtons.length}`;
  };
  const render = () => {
    el("market-coins").textContent = `${hold.coins} coins`;
    renderSell();
    renderGear();
    renderFlags();
    onFlag?.(hold.flag);
    saveHold(hold);
    for (const listener of listeners) listener(hold);
  };
  const select = (name) => {
    for (const t of tabs) {
      t.tab.setAttribute("aria-selected", String(t.name === name));
      t.pane.hidden = t.name !== name;
    }
  };
  const show = (value) => {
    open = value && near;
    panel.hidden = !open;
    if (!open) return;
    picked = hold.flag;
    select("sell");
    render();
    el("market-close").focus();
  };
  for (const t of tabs) t.tab.addEventListener("click", () => select(t.name));
  prompt.addEventListener("click", () => show(true));
  el("market-close").addEventListener("click", () => show(false));
  sell.addEventListener("click", () => {
    if (holdValue(hold) > 0) onSold?.();
    commit(sellAll(hold));
  });
  buy.addEventListener("click", () => commit(buyNet(hold, NET.price)));
  flagAct.addEventListener("click", () => commit(buyFlag(hold, picked, FLAG_PRICE)));
  addEventListener("keydown", (e) => {
    if (e.code === "KeyE") show(!open);
    if (e.code === "Escape") show(false);
  });
  render();

  return {
    spot,
    get hold() {
      return hold;
    },
    setHold(next) {
      commit(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(hold);
    },
    update(boat, speed) {
      const now = canTrade(spot, boat, speed);
      if (now === near) return;
      near = now;
      prompt.hidden = !near;
      if (!near) show(false);
    },
  };
}
