export const FIGHT_RULES = {
  reelSpeed: 2.6,
  dragFree: 0.72,
  dragReeling: 1.2,
  breakTension: 1.0,
  landRadius: 2.6,
  minLine: 1.6,
  maxLine: 34,
  warning: 0.75,
  tiredBelow: 0.16,
  slackLimit: 3.5,
  jumpTime: 0.75,
  thrashTime: 0.75,
  thrashRange: 7,
  maxBearing: 1.05,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (rate, h) => 1 - Math.exp(-rate * h);
const range = (random, lo, hi) => lo + random() * (hi - lo);

const SWIM_AWAY = { run: 1, side: 0.3, hold: 0.55, tired: 0.1, jump: 0.6, thrash: 0.8, coil: 0.2 };

export function startFight(species, distance, random) {
  const fish = species.fight ?? { strength: 0.7, stamina: 0.9, runs: 1 };
  const fight = {
    strength: fish.strength,
    endurance: fish.stamina,
    runs: fish.runs ?? 1,
    line: clamp(distance, FIGHT_RULES.minLine + 1, FIGHT_RULES.maxLine),
    bearing: 0,
    stamina: 1,
    tension: 0.4,
    strain: 0,
    slack: 0,
    mode: "run",
    modeTime: 0,
    pull: 0,
    speed: 0,
    side: random() < 0.5 ? -1 : 1,
    jumpIn: -1,
    thrashCooldown: 2,
    next: null,
    crank: 0,
    slipping: false,
  };
  setMode(fight, "run", random, true);
  return fight;
}

function setMode(fight, mode, random, first = false) {
  const vigor = 0.45 + 0.55 * fight.stamina;
  fight.mode = mode;
  fight.jumpIn = -1;
  if (mode === "tired") {
    fight.modeTime = range(random, 1.5, 3);
    fight.pull = 0.12 * fight.strength;
    fight.speed = 0.3;
    if (random() < 0.6) fight.side = -fight.side;
  } else if (mode === "run") {
    fight.modeTime = range(random, 0.9, 2.2) * (0.7 + 0.3 * fight.endurance);
    fight.pull = range(random, 0.9, 1.25) * fight.strength * vigor;
    fight.speed = 1.8 * vigor;
    if (!first && random() < 0.28 * fight.runs * (0.6 + 0.4 * fight.stamina)) fight.jumpIn = range(random, 0.25, 0.6);
  } else if (mode === "side") {
    if (random() < 0.75) fight.side = -fight.side;
    fight.modeTime = range(random, 1.2, 3);
    fight.pull = range(random, 0.42, 0.65) * fight.strength * vigor;
    fight.speed = 1.05 * vigor;
  } else if (mode === "hold") {
    fight.modeTime = range(random, 1, 2.4);
    fight.pull = 0.35 * fight.strength * vigor;
    fight.speed = 0.35;
  } else if (mode === "jump") {
    fight.modeTime = FIGHT_RULES.jumpTime;
    fight.pull *= 0.6;
  } else if (mode === "thrash") {
    fight.modeTime = FIGHT_RULES.thrashTime;
    fight.pull = 0.8 * fight.strength * vigor;
    fight.thrashCooldown = 4;
  } else if (mode === "coil") {
    fight.modeTime = FIGHT_RULES.warning;
    fight.pull = 0.2 * fight.strength;
    fight.speed = 0.2;
  }
}

function chooseMode(fight, random) {
  if (fight.stamina < FIGHT_RULES.tiredBelow) return "tired";
  const roll = random();
  if (roll < (0.12 + 0.3 * fight.stamina) * Math.min(1.4, fight.runs)) return "run";
  if (roll < 0.78) return "side";
  return "hold";
}

export function stepFight(fight, h, reeling, random) {
  const events = [];
  const f = { ...fight };
  f.modeTime -= h;
  f.thrashCooldown -= h;
  if (f.jumpIn > 0) {
    f.jumpIn -= h;
    if (f.jumpIn <= 0 && f.mode === "run") {
      setMode(f, "jump", random);
      events.push("jump");
    }
  }
  if (f.modeTime <= 0) {
    if (f.mode === "jump") events.push("splash");
    if (f.mode === "coil") {
      setMode(f, "run", random);
      events.push("run");
    } else {
      let next = chooseMode(f, random);
      if (next !== "tired" && f.thrashCooldown <= 0 && f.tension > 0.45 && f.line < FIGHT_RULES.thrashRange && random() < 0.35) next = "thrash";
      if (next === "run") {
        setMode(f, "coil", random);
        events.push("warning");
      } else {
        const wasTired = f.mode === "tired";
        setMode(f, next, random);
        if (next === "tired" && !wasTired) events.push("tired");
        if (next === "thrash") events.push("thrash");
      }
    }
  }

  if (f.mode === "side" || f.mode === "tired") {
    f.bearing = clamp(f.bearing + (f.side * f.speed * h) / Math.max(3, f.line), -FIGHT_RULES.maxBearing, FIGHT_RULES.maxBearing);
    if (Math.abs(f.bearing) >= FIGHT_RULES.maxBearing) f.side = -f.side;
  }

  const pullOut = f.pull * (0.25 + 0.75 * SWIM_AWAY[f.mode]);
  const target = pullOut + (reeling ? 0.26 + 0.14 * f.stamina : 0);
  f.tension += (target - f.tension) * approach(9, h);

  const limit = reeling ? FIGHT_RULES.dragReeling : FIGHT_RULES.dragFree;
  let slip = 0;
  if (f.tension > limit) {
    slip = (f.tension - limit) * 4.5;
    f.line = Math.min(FIGHT_RULES.maxLine, f.line + slip * h);
    f.tension -= (f.tension - limit) * approach(30, h);
    f.crank -= (slip * h) / 0.16;
  }
  const slipping = slip > 0.04;
  if (slipping && !f.slipping) events.push("drag");
  f.slipping = slipping;

  if (reeling && f.tension < limit) {
    const rate = FIGHT_RULES.reelSpeed * (1 - 0.65 * Math.min(1, f.tension)) * (f.mode === "tired" ? 1.15 : 1);
    f.line = Math.max(FIGHT_RULES.minLine, f.line - rate * h);
    f.crank += (rate * h) / 0.16;
  }

  if (f.tension > FIGHT_RULES.breakTension) f.strain += ((f.tension - FIGHT_RULES.breakTension) * 2 + 0.6) * h;
  else f.strain = Math.max(0, f.strain - 0.5 * h);
  if (f.tension < 0.05 && f.stamina > 0.25) f.slack += h;
  else f.slack = 0;
  f.stamina = Math.max(0, f.stamina - (h * (0.022 + 0.075 * Math.min(f.tension, 1.3) + (f.mode === "run" ? 0.03 : 0))) / f.endurance);

  if (f.strain >= 1) return { fight: f, events, end: "snapped" };
  if (f.slack > FIGHT_RULES.slackLimit) return { fight: f, events, end: "threw" };
  if (f.mode !== "jump" && f.line <= FIGHT_RULES.landRadius) return { fight: f, events, end: "landed" };
  return { fight: f, events, end: null };
}
