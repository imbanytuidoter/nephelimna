const SHOW_MS = 4200;

export function createCatchCard(baseUrl) {
  const card = document.getElementById("catch-card");
  const image = document.getElementById("catch-image");
  const name = document.getElementById("catch-name");
  const tag = document.getElementById("catch-rarity");
  const stats = document.getElementById("catch-stats");
  const value = document.getElementById("catch-value");
  let timer = 0;

  image.addEventListener("error", () => (image.hidden = true));
  card.addEventListener("click", () => (card.hidden = true));

  const show = ({ picture, title, rarity, lines, worth }) => {
    image.hidden = !picture;
    if (picture) image.src = `${baseUrl}fish/${picture}`;
    image.alt = title;
    name.textContent = title;
    tag.textContent = rarity ?? "";
    tag.hidden = !rarity;
    card.dataset.rarity = rarity ?? "note";
    stats.replaceChildren(...lines.map((text) => Object.assign(document.createElement("span"), { textContent: text })));
    value.textContent = worth ?? "";
    value.hidden = !worth;
    card.hidden = false;
    card.classList.remove("show");
    void card.offsetWidth;
    card.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => (card.hidden = true), SHOW_MS);
  };

  return {
    showFish(fish, twin) {
      const lines = [`${fish.kg} kg`, `${fish.cm} cm`, `Fight ${"★".repeat(fish.stars)}${"☆".repeat(5 - fish.stars)}`];
      if (fish.trophy) lines.push("Trophy size");
      if (twin) lines.push("Twin hook: counted twice");
      show({ picture: `${fish.slug}.webp`, title: fish.name, rarity: fish.rarity, lines, worth: `${fish.value * (twin ? 2 : 1)} coins at the market` });
    },
    showChest(text) {
      show({ picture: "chest.svg", title: "Sunken chest", rarity: "chest", lines: [text], worth: null });
    },
    showNote(title, text) {
      show({ picture: null, title, rarity: null, lines: [text], worth: null });
    },
  };
}
