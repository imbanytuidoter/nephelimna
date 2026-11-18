import * as THREE from "three";
import { Bait, Depth, POINTS_LEVIATHAN, rarityFromPoints } from "@nephelimna/rules";
import { islandHeight } from "../../ocean/scene/islandHeight.js";
import { landFish, stowChest } from "../hold.js";
import { seeded } from "../life/random.js";
import { createCatchCard } from "./card.js";
import { createUnderwater } from "./underwater.js";
import { FIGHT_RULES } from "./fight.js";
import { createGear } from "./gear.js";
import { cellIndexAt } from "./lake.js";
import { LOOT } from "./loot.js";
import { NET } from "./net.js";
import { ROD, castDistance, createRod, flightTime, stepRod } from "./rod.js";
import { CHEST, LEVIATHAN, rollFish } from "./species.js";

const LAND_LEVEL = -0.4;
export const REST_ELEVATION = 0.5;
const BACK_SWING = 0.8;
const WHIP_TIME = 0.2;
const ROD_FOLLOW = 0.3;
const DEPTHS = [
  { value: Depth.Surface, label: "Surface" },
  { value: Depth.Middle, label: "Middle" },
  { value: Depth.Bottom, label: "Bottom" },
];
const BAITS = [
  { value: Bait.Worm, label: "Worm", hint: "common and uncommon fish" },
  { value: Bait.Spoon, label: "Spoon", hint: "uncommon, rare and mythic" },
  { value: Bait.LiveFish, label: "Live fish", hint: "mythic only" },
];
const PROMPT = {
  idle: "Cast",
  charging: "Let go to cast",
  flying: "",
  waiting: "Watch the float",
  take: "Strike!",
  fight: "Reel",
  landed: "",
  lost: "",
  retrieving: "",
};
const NOTES = {
  moving: "Drop the anchor to fish.",
  blocked: "That landed on dry ground.",
  empty: "Nothing here. Try another depth, bait or spot.",
  spooked: "Missed. It may come back.",
  missed: "It got away.",
  snapped: "The line snapped. Let go when it runs.",
  threw: "It threw the hook. Keep the line tight.",
  "no-net": `You need a net. The fish market sells one for ${NET.price} coins.`,
  "off-chart": "Fish inside the chart squares. Every cast there is a sealed transaction on Sepolia.",
  "sea-closed": "Cannot reach the chain right now. Try again in a moment.",
  "chain-failed": "The cast did not reach the chain. Try again.",
  kept: "This catch was already counted on chain, so it went straight to your hold.",
  "chain-unread": "Your cast landed on chain but could not be read yet. Its points still count.",
  snagged: "A hidden net took that fish. A rival scores it.",
  "line-left": "Your line stays out. Cast again. The catch shows up once it is decrypted.",
  "lines-busy": "Three sealed lines are still out. Wait for one to surface.",
  take: "It took the bait. Strike now!",
};
const MAX_LINES = 3;
const STAGE_SHORT = {
  Starting: "Starting",
  "Getting test ETH": "Getting ETH",
  "Putting your boat on chain": "Joining",
  "Sealing your bait": "Sealing",
  "Line out on Sepolia": "On chain",
  "Waiting for your last cast": "In queue",
  "Reading your catch": "Decrypting",
};
const TROPHY_SIZE = { common: 0.5, uncommon: 0.65, rare: 0.85, mythic: 1.2, chest: 1 };

const fwd = new THREE.Vector3();
const side = new THREE.Vector3();
const aim = new THREE.Vector3();
const right = new THREE.Vector3();
const origin = new THREE.Vector3();
const base = new THREE.Vector3();
const direction = new THREE.Vector3();
const target = new THREE.Vector3();
const fishAt = new THREE.Vector3();
const lift = new THREE.Vector3();
const lean = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const smooth = THREE.MathUtils.smoothstep;

export function createFishing({ scene, body, patchMaterial, market, baseUrl, floaters, audio, sea, cellName }) {
  const random = seeded(Date.now() % 100000);
  const gear = createGear({ scene, patchMaterial, baseUrl });
  const card = createCatchCard(baseUrl);
  const underwater = createUnderwater({ baseUrl, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
  let rod = createRod();
  let depth = 0;
  let bait = 0;
  let pressed = false;
  let held = false;
  let netPressed = false;
  let netPlaced = false;
  let landing = null;
  let ticket = null;
  let lines = [];
  let floatLevel = 0;
  let fire = false;
  let active = false;
  let clock = 0;
  let crank = 0;
  let nibble = 0;
  let landedAt = 0;
  let noteUntil = 0;
  const probe = new THREE.Vector3();
  const castFrom = new THREE.Vector3();
  const castDir = new THREE.Vector3(1, 0, 0);

  const el = (id) => document.getElementById(id);
  const panel = el("fishing");
  const action = el("fish-action");
  const netButton = el("fish-net");
  const bonus = el("fish-bonus");
  const depthGroup = el("fish-depth");
  const baitGroup = el("fish-bait");
  const baitHint = el("fish-bait-hint");
  const actionLabel = el("fish-action-label");
  const actionDetail = el("fish-action-detail");
  const netTitle = netButton.querySelector(".net-title");
  const netDetail = netButton.querySelector(".net-detail");
  const message = el("fish-message");
  panel.hidden = true;

  const note = (text, seconds = 3.5) => {
    message.textContent = text;
    noteUntil = clock + seconds;
  };
  const segment = (group, options, pick) =>
    options.map((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.textContent = option.label;
      button.addEventListener("click", () => pick(index));
      group.append(button);
      return button;
    });
  let depthButtons = [];
  let baitButtons = [];
  const chips = () => {
    depthButtons.forEach((button, index) => button.setAttribute("aria-checked", String(index === depth)));
    baitButtons.forEach((button, index) => button.setAttribute("aria-checked", String(index === bait)));
    baitButtons.forEach((button, index) => (button.title = `Catches ${BAITS[index].hint}`));
    baitHint.textContent = BAITS[bait].hint;
  };
  let locked = null;
  const lockTackle = (value) => {
    if (locked === value) return;
    locked = value;
    for (const button of [...depthButtons, ...baitButtons]) button.disabled = value;
  };
  const cycleDepth = (to) => {
    if (rod.phase !== "idle") return;
    depth = to ?? (depth + 1) % DEPTHS.length;
    chips();
    audio.play("click", 0.5);
  };
  const cycleBait = (to) => {
    if (rod.phase !== "idle") return;
    bait = to ?? (bait + 1) % BAITS.length;
    chips();
    audio.play("click", 0.5);
  };
  depthButtons = segment(depthGroup, DEPTHS, (index) => cycleDepth(index));
  baitButtons = segment(baitGroup, BAITS, (index) => cycleBait(index));
  chips();

  const down = () => {
    if (!held) pressed = true;
    held = true;
  };
  const release = () => {
    held = false;
  };
  action.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    action.setPointerCapture(e.pointerId);
    down();
  });
  action.addEventListener("pointerup", release);
  action.addEventListener("pointercancel", release);
  netButton.addEventListener("click", () => (netPressed = true));
  addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, select, textarea, dialog")) return;
    if (e.code === "KeyF" || e.code === "Space") {
      e.preventDefault();
      down();
    }
    if (e.code === "KeyN") netPressed = true;
    if (e.code === "KeyB") cycleBait();
    if (e.code === "Digit1") cycleDepth(0);
    if (e.code === "Digit2") cycleDepth(1);
    if (e.code === "Digit3") cycleDepth(2);
  });
  addEventListener("keyup", (e) => {
    if (e.code === "KeyF" || e.code === "Space") release();
  });
  addEventListener("blur", release);

  const castPoint = (distance, out) => out.copy(castFrom).addScaledVector(castDir, distance);
  const ripple = (x, z, amp, size) => {
    floaters.impacts.push({ x, z, t: floaters.time, amp, size });
    if (floaters.impacts.length > 8) floaters.impacts.shift();
  };
  const splash = (position, power, sound, volume) => {
    gear.burst(position, Math.round(10 + 26 * power), 0.5 + power);
    ripple(position.x, position.z, 0.02 + 0.06 * power, 0.3 + 0.5 * power);
    if (sound) audio.play(sound, volume);
  };

  const resolve = (distance) => {
    castPoint(distance, target);
    if (islandHeight(target.x, target.z) > LAND_LEVEL) return { blocked: true };
    const index = cellIndexAt(target.x, target.z);
    if (!sea.fishing()) return { blocked: true, event: "sea-closed" };
    if (index < 0) return { blocked: true, event: "off-chart" };
    if (lines.length >= MAX_LINES) return { blocked: true, event: "lines-busy" };
    if (ticket) lines = [...lines, { ticket, x: target.x, z: target.z }];
    ticket = sea.cast(index, DEPTHS[depth].value, BAITS[bait].value);
    return { pending: true };
  };

  const outcome = (answer) => {
    if (answer.status === "failed") return { caught: false, event: answer.landed ? "chain-unread" : "chain-failed" };
    const { points, snagged, rareNear, leviathanNear } = answer.result;
    if (leviathanNear) card.showNote("Sonar", "Something huge is moving in a square next to this one.");
    else if (rareNear) card.showNote("Sonar", "A rare fish is in a square next to this one.");
    if (snagged) return { caught: false, event: "snagged" };
    if (points === 0) return random() < LOOT.chance ? { caught: true, shoal: false, species: CHEST } : { caught: false, event: "empty" };
    const species = points >= POINTS_LEVIATHAN ? { ...LEVIATHAN } : { ...rollFish(rarityFromPoints(points), random) };
    return { caught: true, shoal: false, species: { ...species, points } };
  };

  const verdict = () => {
    if (!ticket || ticket.status === "pending") return null;
    const answer = ticket;
    ticket = null;
    return outcome(answer);
  };

  const leave = () => {
    if (!ticket) return;
    castPoint(rod.distance, target);
    lines = [...lines, { ticket, x: target.x, z: target.z }];
    ticket = null;
  };

  const surface = () => {
    const done = lines.filter((line) => line.ticket.status !== "pending");
    if (!done.length) return;
    lines = lines.filter((line) => line.ticket.status === "pending");
    for (const line of done) {
      const where = cellName(line.ticket.cell);
      const result = outcome(line.ticket);
      ripple(line.x, line.z, 0.03, 0.4);
      if (result.caught) {
        land(result);
        note(`Your sealed line in ${where} surfaced with a catch.`, 5);
      } else if (result.event === "chain-failed") note(`The sealed line in ${where} did not reach the chain.`, 5);
      else if (result.event === "chain-unread") note(`The sealed line in ${where} landed but could not be read yet. Its points still count.`, 5);
      else if (result.event === "snagged") note(`Your sealed line in ${where}: a hidden net took the fish.`, 5);
      else note(`Your sealed line in ${where} came back empty.`, 5);
    }
  };

  const land = (caught) => {
    if (caught.species.rarity === "chest") {
      market.setHold(stowChest(market.hold));
      card.showChest("Stowed in your hold. Open it from the hold button.");
      audio.play("chest", 0.9);
      return;
    }
    const twin = market.hold.twin > 0;
    market.setHold(landFish(market.hold, caught.species));
    card.showFish(caught.species, twin);
    audio.play(caught.species.rarity === "rare" || caught.species.rarity === "mythic" ? "rare" : "catch", 0.8);
  };

  const onEvent = (event, before) => {
    switch (event) {
      case "draw":
        castFrom.copy(origin);
        break;
      case "cast":
        castDir.copy(aim);
        castFrom.copy(origin);
        audio.play("cast", 0.8);
        break;
      case "splash":
        castPoint(rod.distance, target).setY(floatLevel);
        splash(target, 0.25, "plop", 0.9);
        landedAt = clock;
        break;
      case "nibble":
        nibble = ROD.nibbleTime;
        castPoint(rod.distance, target);
        ripple(target.x, target.z, 0.012, 0.18);
        audio.play("click", 0.35, 1.6);
        break;
      case "take":
        castPoint(rod.distance, target).setY(floatLevel);
        splash(target, 0.35, "bite", 0.9);
        break;
      case "hooked":
        audio.play("splash_small", 0.8);
        break;
      case "warning":
        splash(fishAt, 0.3, "splash_small", 0.7);
        break;
      case "run":
        break;
      case "jump":
        splash(fishAt, 0.9, "splash_big", 0.9);
        break;
      case "splash-in":
        splash(fishAt, 0.7, "splash_medium", 0.8);
        break;
      case "thrash":
        splash(fishAt, 0.6, "splash_medium", 0.7);
        break;
      case "landed":
        splash(fishAt, 0.8, "splash_medium", 0.8);
        land(before.catch);
        landing = { kind: before.catch.species.rarity === "chest" ? "chest" : "fish", size: TROPHY_SIZE[before.catch.species.rarity], time: 0 };
        break;
      case "kept":
        land(before.catch);
        note(NOTES.kept);
        break;
      case "snapped":
        audio.play("snap", 1);
        note(NOTES.snapped);
        break;
      default:
        if (NOTES[event]) {
          note(NOTES[event]);
          if (event === "moving" || event === "blocked" || event === "no-net") audio.play("deny", 0.5);
        }
    }
  };

  return {
    probe,
    setProbeWater(level) {
      if (Number.isFinite(level)) floatLevel = level;
    },
    cycleDepth: () => cycleDepth(),
    gearSizes: { depths: DEPTHS.length, baits: BAITS.length },
    restore(saved) {
      depth = saved.depth;
      bait = saved.bait;
      chips();
    },
    setResolution(width, height) {
      gear.setResolution(width, height);
    },
    renderInset(renderer) {
      underwater.render(renderer);
    },
    get state() {
      return { rod, depth, bait, active };
    },
    update(dt, time, pov) {
      clock = time;
      fwd.set(1, 0, 0).applyQuaternion(body.quat);
      side.set(0, 0, 1).applyQuaternion(body.quat);
      const canFish = pov.active;
      if (pov.active !== active) {
        active = pov.active;
        panel.hidden = !active;
        gear.showRod(active);
        if (active) note(cellIndexAt(body.pos.x, body.pos.z) < 0 ? NOTES["off-chart"] : "Sealed waters. Nobody can see what is under a square, not even the server.", 5);
      }
      aim.copy(pov.aim);
      right.set(-aim.z, 0, aim.x);
      base.copy(pov.eye).addScaledVector(aim, 0.55).addScaledVector(right, 0.34).addScaledVector(WORLD_UP, -0.5);
      origin.copy(pov.eye).setY(0);
      if (pov.fire && !fire) down();
      if (!pov.fire && fire) release();
      fire = pov.fire;

      const before = rod;
      const step = stepRod(rod, dt, { held, pressed }, { canFish, random, resolve, verdict, leave });
      rod = step.rod;
      for (const event of step.events) onEvent(event === "splash" && before.phase === "fight" ? "splash-in" : event, before);
      underwater.update(dt, { active, rod, depth, bait, events: step.events });
      pressed = false;

      surface();
      const seaNote = sea.takeNote();
      if (seaNote) note(seaNote, 6);
      if (netPressed) {
        netPressed = false;
        if (!market.hold.hasNet) onEvent("no-net", rod);
        else if (!canFish) onEvent("moving", rod);
        else if (!sea.fishing()) onEvent("sea-closed", rod);
        else if (cellIndexAt(body.pos.x, body.pos.z) < 0) onEvent("off-chart", rod);
        else if (sea.setNet(cellIndexAt(body.pos.x, body.pos.z))) {
          gear.placeNet(body.pos, side.clone().negate().setY(0).normalize(), fwd, floatLevel);
          audio.play("splash_medium", 0.6);
          netPlaced = true;
        }
      }

      const fight = rod.fight;
      const fighting = rod.phase === "fight";
      const tension = fighting ? fight.tension : 0;
      const strain = fighting ? Math.max(fight.tension, 0.9 + fight.strain * 0.3 * (fight.strain > 0.05 ? 1 : 0)) : 0;

      let elevation = REST_ELEVATION;
      if (rod.phase === "charging") elevation += BACK_SWING * rod.charge;
      if (rod.phase === "flying") elevation += BACK_SWING * rod.charge * Math.max(0, 1 - rod.time / WHIP_TIME) - 0.25 * Math.sin(Math.min(1, rod.time / WHIP_TIME) * Math.PI);
      if (fighting) elevation += 0.25 * smooth(tension, 0.2, 1);
      const lineOut = rod.phase !== "idle" && rod.phase !== "charging" && rod.distance > 0;
      lift.copy(aim);
      if (lineOut) lift.addScaledVector(castDir, ROD_FOLLOW).normalize();
      direction.copy(lift).multiplyScalar(Math.cos(elevation)).addScaledVector(WORLD_UP, Math.sin(elevation));

      const out = active && ["flying", "waiting", "take", "fight", "retrieving", "lost"].includes(rod.phase) && rod.distance > 0;
      let floatDistance = 0;
      let flat = 0;
      let dip = 0;
      let lineLength = 1;
      let taut = 0;
      lean.set(0, 0, 0);
      if (out) {
        if (rod.phase === "flying") {
          const fly = Math.min(1, rod.time / flightTime(rod.distance));
          castPoint(rod.distance * fly, target);
          target.y = floatLevel + Math.sin(fly * Math.PI) * (1.6 + rod.distance * 0.08) + (1 - fly) * (base.y - floatLevel);
          flat = 1;
          lineLength = target.distanceTo(base) * 1.03;
          taut = 0.3;
        } else if (fighting) {
          fishAt.copy(castDir).applyAxisAngle(WORLD_UP, -fight.bearing).multiplyScalar(fight.line).add(castFrom).setY(floatLevel);
          target.copy(fishAt).addScaledVector(castDir, -0.35);
          dip = 0.05 + 0.05 * smooth(tension, 0.2, 1);
          lean.copy(castFrom).sub(fishAt).setY(0).normalize().multiplyScalar(-0.7 * Math.min(1, tension));
          lineLength = target.distanceTo(base);
          taut = 0.25 + 0.7 * smooth(tension, 0.05, 0.5);
        } else if (rod.phase === "retrieving" || rod.phase === "lost") {
          const back = Math.min(1, rod.time / (rod.phase === "lost" ? ROD.lostTime : ROD.retrieve));
          castPoint(rod.distance * (1 - back * 0.92), target).setY(floatLevel);
          flat = 0.6;
          lineLength = target.distanceTo(base) * 1.03;
          taut = 0.4;
        } else {
          castPoint(rod.distance, target).setY(floatLevel);
          const cocked = Math.min(1, (time - landedAt) / ROD.cockTime);
          flat = Math.max(0, 1 - cocked);
          const wobble = cocked < 1 ? 0 : Math.exp(-(time - landedAt - ROD.cockTime) * 3) * Math.sin((time - landedAt) * 14) * 0.35;
          lean.set(Math.sin(time * 1.1) * 0.06 + wobble, 0, Math.cos(time * 0.9) * 0.06);
          if (nibble > 0) {
            nibble -= dt;
            dip = 0.012 + 0.01 * Math.sin(time * 40);
            lean.x += Math.sin(time * 46) * 0.18;
          }
          if (rod.phase === "take") {
            const pulled = Math.min(1, rod.time / 0.25);
            if (rod.slide) {
              flat = pulled;
              lean.copy(castDir);
              target.addScaledVector(castDir, 1.1 * Math.min(1, rod.time / rod.window));
            } else dip = 0.085 * pulled;
          }
          lineLength = target.distanceTo(base) * 1.015;
          taut = 0.55;
        }
        floatDistance = target.distanceTo(pov.eye);
        probe.copy(target);
      }
      const bend = fighting ? 0.2 + 0.95 * smooth(tension, 0, 0.95) : rod.phase === "take" ? 0.3 : 0;
      if (fighting) crank = fight.crank;
      else if (rod.phase === "retrieving" || rod.phase === "lost") crank += dt * 14;
      if (active) gear.setRod(base, direction, out ? lift.subVectors(target, base).normalize() : DOWN, bend, crank);

      if (out) {
        gear.setFloat(target, floatDistance, lean, flat, dip);
        gear.setLine(target, Math.max(lineLength, 0.5), floatLevel + 0.01, taut, strain, dt);
        gear.setAim(null);
      } else {
        gear.setFloat(null);
        gear.setLine(null);
        if (rod.phase === "charging") {
          castFrom.copy(origin);
          castDir.copy(aim);
          castPoint(castDistance(rod.charge), target);
          probe.copy(target);
          target.y = floatLevel;
          gear.setAim(target, time * 6);
        } else gear.setAim(null);
      }

      if (rod.phase === "waiting" && rod.catch) {
        const near = 1 - Math.min(1, (rod.wait - rod.time) / Math.max(rod.wait, 0.1));
        const radius = 3.6 - 2.2 * near;
        const angle = time * 0.9;
        castPoint(rod.distance, lift).setY(floatLevel - 0.55);
        lift.x += Math.cos(angle) * radius;
        lift.z += Math.sin(angle) * radius;
        gear.setShadow(lift, -angle - Math.PI / 2, 0.8, smooth(near, 0.15, 0.6));
      } else if (fighting && fight.mode !== "jump") {
        lift.copy(fishAt).addScaledVector(castDir, 0.9).setY(floatLevel - 0.55);
        gear.setShadow(lift, Math.atan2(-castDir.z, castDir.x) + fight.bearing + (fight.mode === "tired" ? Math.PI : 0), 0.7 + 0.5 * fight.strength, 1);
      } else gear.setShadow(lift, 0, 1, 0);
      gear.stepSpray(dt);

      if (landing) {
        landing.time += dt;
        const t = Math.min(1, landing.time / 0.7);
        lift.copy(fishAt).lerp(gear.tip, t * 0.75);
        lift.y = floatLevel + (gear.tip.y - 0.7 - floatLevel) * t + Math.sin(t * Math.PI) * 0.5;
        gear.setTrophy(landing.kind, lift, landing.size, time * 5);
        if (landing.time > 1.8) landing = null;
      } else gear.setTrophy(null);
      if (!sea.netsOut()) netPlaced = false;
      gear.setNet(netPlaced, time, floatLevel);

      const reeling = fighting && held && !fight.slipping;
      audio.loop("reel", reeling || rod.phase === "retrieving" ? 0.55 : 0, reeling ? 0.8 + 0.4 * (1 - Math.min(1, tension)) : 1.2);
      audio.loop("drag", fighting && fight.slipping ? 0.7 : 0, 1);

      const label = rod.pending ? (ticket ? `${STAGE_SHORT[ticket.stage] ?? ticket.stage} ${Math.floor((Date.now() - ticket.startedAt) / 1000)}s` : "Checking") : (PROMPT[rod.phase] ?? "");
      const prompt = fighting && ["run", "coil", "jump"].includes(fight.mode) ? "Let it run" : label;
      if (actionLabel.textContent !== prompt) actionLabel.textContent = prompt;
      lockTackle(rod.phase !== "idle");
      action.classList.toggle("busy", rod.pending);
      action.classList.toggle("alert", rod.phase === "take");
      action.classList.toggle("ease", fighting && ["run", "coil", "jump"].includes(fight.mode));
      const gauge = fighting ? Math.min(1, strain) : rod.phase === "charging" ? rod.charge : rod.phase === "fight" ? 0 : 0;
      action.style.setProperty("--gauge", gauge.toFixed(3));
      action.style.setProperty("--gauge-colour", fighting ? (strain > 0.92 ? "#ff4a3a" : strain > 0.6 ? "#f0b04a" : "#8fd6c8") : "#f2f6f4");
      const line = fighting ? `${Math.max(0, fight.line - FIGHT_RULES.landRadius).toFixed(0)} m to the boat` : rod.phase === "charging" ? `${Math.round(castDistance(rod.charge))} m` : "";
      const linesOut = lines.length ? `${lines.length} ${lines.length === 1 ? "line" : "lines"} out` : "Hold, then let go";
      const detail = rod.pending ? "Hold to cast again" : rod.phase === "idle" ? linesOut : line;
      if (action.title !== (rod.pending ? ticket?.stage ?? "" : "")) action.title = rod.pending ? ticket?.stage ?? "" : "";
      if (actionDetail.textContent !== detail) actionDetail.textContent = detail;
      if (time > noteUntil && message.textContent) message.textContent = "";
      const twinText = market.hold.twin > 0 ? `x2 on your next ${market.hold.twin} fish` : "";
      if (bonus.textContent !== twinText) bonus.textContent = twinText;
      const netState = !market.hold.hasNet ? ["Net", `${NET.price} coins`, `Buy a hidden net at the fish market for ${NET.price} coins`] : sea.netsOut() ? ["Net", `${sea.netCount()} of ${sea.netLimit} out`, `${sea.netCount()} of your ${sea.netLimit} hidden nets ${sea.netCount() === 1 ? "is" : "are"} set. Each one stays for an hour`] : ["Net", "Set 1 h", "Set a hidden net in this square for an hour. Rivals' common and uncommon catches here score three times for you"];
      const netKey = netState.join("|");
      if (netButton.dataset.key !== netKey) {
        netButton.dataset.key = netKey;
        netTitle.textContent = netState[0];
        netDetail.textContent = netState[1];
        netButton.title = netState[2];
        netButton.setAttribute("aria-label", netState[2]);
      }
    },
  };
}
