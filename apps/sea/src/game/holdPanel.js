import { pictureSlug } from "./fishing/species.js";
import { applyLoot, rollLoot } from "./fishing/loot.js";
import { holdValue, openChest } from "./hold.js";

const SLOTS = 4;

function slot(className) {
  const cell = document.createElement("div");
  if (className) cell.className = className;
  return cell;
}

function padded(cells) {
  const count = Math.max(SLOTS, Math.ceil(cells.length / SLOTS) * SLOTS);
  return [...cells, ...Array.from({ length: count - cells.length }, () => slot("empty"))];
}

function fishCell(item, baseUrl) {
  const cell = slot();
  const mark = document.createElement("i");
  mark.className = `rarity ${item.rarity}`;
  const image = document.createElement("img");
  image.alt = item.name;
  const slug = pictureSlug(item);
  if (slug) image.src = `${baseUrl}fish/${slug}.webp`;
  const count = document.createElement("span");
  count.className = "n";
  count.textContent = `${item.count}`;
  cell.title = `${item.name} ×${item.count}, ${item.value} coins`;
  cell.append(mark, image, count);
  return cell;
}

function chestCell(baseUrl) {
  const cell = slot("chest");
  const image = document.createElement("img");
  image.alt = "Sunken chest";
  image.src = `${baseUrl}fish/chest.svg`;
  cell.append(image);
  return cell;
}

function tagCell(text, title) {
  const cell = slot();
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  cell.title = title;
  cell.append(tag);
  return cell;
}

export function createHoldPanel({ market, baseUrl, audio, random = Math.random }) {
  const el = (id) => document.getElementById(id);
  const panel = el("hold-panel");
  const opener = el("hold-open");
  const badge = el("hold-badge");
  const openChestButton = el("hold-open-chest");
  const reveal = el("hold-reveal");
  let open = false;

  const renderChip = (hold) => {
    const fish = hold.items.reduce((sum, item) => sum + item.count, 0);
    const chip = el("hold-chip");
    const coins = document.createElement("b");
    coins.textContent = `${hold.coins}`;
    chip.replaceChildren(coins, fish ? ` coins · ${fish} fish` : " coins");
    badge.hidden = hold.chests === 0;
    badge.textContent = `${hold.chests}`;
    opener.setAttribute("aria-label", `Open your hold (I). ${hold.coins} coins, ${fish} fish, ${hold.chests} chests`);
  };
  const renderPanel = (hold) => {
    el("hold-coins").textContent = `${hold.coins} coins`;
    const fish = hold.items.reduce((sum, item) => sum + item.count, 0);
    el("hold-catch-label").textContent = fish ? `Catch · ${fish} fish · worth ${holdValue(hold)} at the market` : "Catch · empty";
    el("hold-fish").replaceChildren(...padded(hold.items.map((item) => fishCell(item, baseUrl))));
    el("hold-chests").replaceChildren(...padded(Array.from({ length: hold.chests }, () => chestCell(baseUrl))));
    openChestButton.hidden = hold.chests === 0 || !reveal.hidden;
    const gear = [];
    if (hold.hasNet) gear.push(tagCell("Net", "Hidden net: press N in a chart square"));
    if (hold.twin > 0) gear.push(tagCell(`Twin ×${hold.twin}`, `Twin hook: your next ${hold.twin} fish count double`));
    el("hold-gear").replaceChildren(...padded(gear));
  };
  const render = (hold) => {
    renderChip(hold);
    if (open) renderPanel(hold);
  };
  const show = (value) => {
    open = value;
    panel.hidden = !open;
    if (!open) return;
    reveal.hidden = true;
    renderPanel(market.hold);
    el("hold-close").focus();
  };

  opener.addEventListener("click", () => show(!open));
  el("hold-close").addEventListener("click", () => show(false));
  openChestButton.addEventListener("click", () => {
    const loot = rollLoot(random, market.hold);
    el("hold-reveal-image").src = `${baseUrl}fish/chest.svg`;
    el("hold-reveal-text").textContent = loot.text;
    reveal.hidden = false;
    reveal.classList.remove("open");
    void reveal.offsetWidth;
    reveal.classList.add("open");
    audio.play("chest", 0.9);
    market.setHold(openChest(market.hold, loot, applyLoot));
  });
  el("hold-reveal-done").addEventListener("click", () => {
    reveal.hidden = true;
    renderPanel(market.hold);
  });
  addEventListener("keydown", (e) => {
    if (e.code === "KeyI" && !e.repeat) show(!open);
    if (e.code === "Escape" && open) show(false);
  });
  market.subscribe(render);

  return {
    get open() {
      return open;
    },
  };
}
