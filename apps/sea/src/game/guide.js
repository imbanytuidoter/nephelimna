import { keepKeysInside } from "./rename.js";

const STORE = "nephelimna.guide.v1";

export function createGuide() {
  const dialog = document.getElementById("guide");
  const opener = document.getElementById("guide-open");
  let seen = false;
  try {
    seen = localStorage.getItem(STORE) === "seen";
  } catch {
    seen = false;
  }
  opener.classList.toggle("attention", !seen);
  keepKeysInside(dialog);
  opener.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    opener.classList.remove("attention");
    try {
      localStorage.setItem(STORE, "seen");
    } catch {
      seen = true;
    }
  });
  document.getElementById("guide-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}
