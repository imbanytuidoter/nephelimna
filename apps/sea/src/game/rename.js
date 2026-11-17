import { NAME_LIMIT } from "./names.js";

/** Game keys listen on the window, so typing a name such as "Swift" would steer the boat and swallow the letters unless key presses stop at the dialog. */
export function keepKeysInside(dialog) {
  for (const type of ["keydown", "keyup"]) dialog.addEventListener(type, (e) => e.stopPropagation());
}

export function createRename({ presence }) {
  const el = (id) => document.getElementById(id);
  const dialog = el("rename");
  const input = el("rename-input");
  const status = el("rename-status");
  input.maxLength = NAME_LIMIT;
  keepKeysInside(dialog);

  el("online").addEventListener("click", () => {
    if (dialog.open) return;
    input.value = presence.name;
    status.textContent = "";
    dialog.showModal();
    input.select();
  });
  el("rename-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = presence.rename(input.value);
    if (!name) {
      status.textContent = "That name will not work. Use 2 to 20 letters, digits, spaces, dots, hyphens or apostrophes.";
      return;
    }
    dialog.close();
  });
  el("rename-close").addEventListener("click", () => dialog.close());
}
