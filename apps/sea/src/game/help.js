const STORE = "nephelimna.help.v1";
const NARROW = 560;

export function helpRows({ deck, touch, nearMarket, hasNet, canJoin, inRound, netPrice }) {
  const rows = [];
  const add = (keys, text, press = null) => rows.push({ keys, text, press });
  if (!deck) {
    if (touch) add(["Left thumb"], "Steer and throttle");
    else {
      add(["W", "S"], "Throttle ahead and astern");
      add(["A", "D"], "Steer");
    }
    add(["G"], "Drop anchor and fish. Works at any speed", "KeyG");
    add(["M"], "Open the chart", "KeyM");
    add(["I"], "Your hold: catch, chests, gear", "KeyI");
    if (nearMarket) add(["E"], "Trade at the fish market", "KeyE");
    if (canJoin) add(["Join"], "Join the round on Sepolia", "join");
    return rows;
  }
  if (touch) {
    add(["Left thumb"], "Walk on deck");
    add(["Right thumb"], "Look around");
    add(["Big button"], "Hold to aim, let go to cast, hold to reel");
  } else {
    add(["Click"], "Click the sea, then move the mouse to look");
    add(["W", "A", "S", "D"], "Walk on deck");
    add(["Space"], "Hold to aim, let go to cast, hold to reel");
  }
  add(["1", "2", "3"], "Depth of the hook. Each fish lives at one depth", "depth");
  add(["B"], "Bait: worm for common fish, spoon for better ones, live fish for mythic", "KeyB");
  add(["N"], hasNet ? (inRound ? "Mark a hidden net in this square" : "Set the net, it fills in 15 seconds") : `Net: buy it at the fish market for ${netPrice} coins`, hasNet ? "KeyN" : null);
  add(["I"], "Your hold: catch, chests, gear", "KeyI");
  add(["G"], "Weigh anchor, back to the helm", "KeyG");
  add(["M"], "Open the chart", "KeyM");
  return rows;
}

export function createHelp({ touch, netPrice, onDepth, onJoin }) {
  const panel = document.getElementById("help");
  const list = document.getElementById("help-list");
  const toggle = document.getElementById("help-toggle");
  let open = true;
  try {
    const saved = localStorage.getItem(STORE);
    open = saved === null ? !touch && window.innerWidth >= NARROW : saved === "open";
  } catch {
    open = !touch;
  }
  let shown = "";

  const paintOpen = () => {
    panel.classList.toggle("closed", !open);
    toggle.textContent = open ? (touch ? "Hide" : "Hide (H)") : touch ? "Controls" : "Controls (H)";
    toggle.setAttribute("aria-expanded", String(open));
  };
  const flip = () => {
    open = !open;
    try {
      localStorage.setItem(STORE, open ? "open" : "closed");
    } catch {
      open = Boolean(open);
    }
    paintOpen();
  };
  toggle.addEventListener("click", flip);
  addEventListener("keydown", (e) => {
    if (e.code === "KeyH" && !e.repeat) flip();
  });
  paintOpen();
  panel.hidden = false;

  const act = (press) => {
    if (press === "depth") return onDepth();
    if (press === "join") return onJoin();
    dispatchEvent(new KeyboardEvent("keydown", { code: press }));
  };

  return {
    update(context) {
      const rows = helpRows({ ...context, touch, netPrice });
      const key = JSON.stringify(rows);
      if (key === shown) return;
      shown = key;
      list.replaceChildren(
        ...rows.map((row) => {
          const item = document.createElement("li");
          const body = document.createElement(row.press ? "button" : "div");
          if (row.press) {
            body.type = "button";
            body.addEventListener("click", () => act(row.press));
          }
          const keys = document.createElement("span");
          keys.className = "keys";
          for (const name of row.keys) {
            const cap = document.createElement("kbd");
            cap.textContent = name;
            keys.append(cap);
          }
          const text = document.createElement("span");
          text.textContent = row.text;
          body.append(keys, text);
          item.append(body);
          return item;
        }),
      );
    },
  };
}
