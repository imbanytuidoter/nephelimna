import { startFight, stepFight } from "./fight.js";

export const ROD = {
  chargeTime: 1.1,
  maxCast: 22,
  minShare: 0.3,
  flightBase: 0.55,
  flightPerMetre: 0.022,
  cockTime: 0.5,
  biteMin: 2,
  biteMax: 6,
  shoalBite: 1.2,
  emptyWait: 6,
  nibbleGap: 0.85,
  nibbleTime: 0.3,
  takeMin: 0.9,
  takeMax: 1.3,
  spook: 1.35,
  holdToRetrieve: 0.6,
  retrieve: 1.1,
  landedTime: 1.4,
  lostTime: 0.9,
  sealedHold: 25,
  sealedNibbleFirst: 2.2,
  sealedNibbleGap: 1.6,
  sealedNibbleSpread: 3,
};

export function castDistance(charge) {
  return ROD.maxCast * (ROD.minShare + (1 - ROD.minShare) * charge);
}

export function flightTime(distance) {
  return ROD.flightBase + ROD.flightPerMetre * distance;
}

export function createRod() {
  return { phase: "idle", time: 0, charge: 0, distance: 0, wait: 0, nibbles: 0, nibbleAt: 0, window: 0, hold: 0, pending: false, spooked: false, slide: false, catch: null, fight: null };
}

const to = (rod, phase, extra = {}) => ({ ...rod, phase, time: 0, hold: 0, ...extra });

function plan(rod, outcome, random, spooked) {
  const nibbles = Math.floor(random() * 4);
  const base = outcome.shoal ? ROD.shoalBite : ROD.biteMin + random() * (ROD.biteMax - ROD.biteMin);
  const wait = base * (spooked ? ROD.spook : 1) + nibbles * ROD.nibbleGap;
  return to(rod, "waiting", { wait, nibbles, nibbleAt: wait - nibbles * ROD.nibbleGap, catch: outcome, spooked, slide: random() < 0.3 });
}

export function stepRod(rod, dt, input, world) {
  const time = rod.time + dt;
  const one = (next, event) => ({ rod: next, events: event ? [event] : [] });
  switch (rod.phase) {
    case "idle":
      if (input.pressed && world.canFish) return one(to(rod, "charging", { charge: 0, catch: null, fight: null }), "draw");
      return one(rod, input.pressed ? "moving" : null);
    case "charging": {
      const charge = Math.min(1, time / ROD.chargeTime);
      if (!world.canFish) return one(to(rod, "idle"));
      if (!input.held) return one(to(rod, "flying", { charge, distance: castDistance(charge) }), "cast");
      return one({ ...rod, time, charge });
    }
    case "flying": {
      if (time < flightTime(rod.distance)) return one({ ...rod, time });
      const outcome = world.resolve(rod.distance);
      if (outcome.blocked) return one(to(rod, "retrieving"), outcome.event ?? "blocked");
      if (outcome.pending) return one(to(rod, "waiting", { wait: Infinity, nibbles: 0, nibbleAt: ROD.sealedNibbleFirst, catch: null, pending: true }), "splash");
      if (!outcome.caught) return one(to(rod, "waiting", { wait: ROD.emptyWait, nibbles: 0, nibbleAt: Infinity, catch: null }), "splash");
      return one(plan(rod, outcome, world.random, false), "splash");
    }
    case "waiting": {
      if (!world.canFish) return one(to(rod, "retrieving", { catch: null }), "reeled");
      if (rod.pending) {
        const verdict = world.verdict();
        if (!verdict) {
          const hold = input.held ? rod.hold + dt : 0;
          if (hold >= ROD.holdToRetrieve || time >= ROD.sealedHold) {
            world.leave();
            return one(to(rod, "retrieving", { catch: null, pending: false }), "line-left");
          }
          const nibbled = time >= rod.nibbleAt;
          const nibbleAt = nibbled ? time + ROD.sealedNibbleGap + world.random() * ROD.sealedNibbleSpread : rod.nibbleAt;
          return one({ ...rod, time, hold, nibbleAt }, nibbled ? "nibble" : null);
        }
        if (!verdict.caught) return one(to(rod, "retrieving", { catch: null, pending: false }), verdict.event);
        return one(plan({ ...rod, pending: false }, verdict, world.random, false), "answered");
      }
      const hold = input.held ? rod.hold + dt : 0;
      if (hold >= ROD.holdToRetrieve) return one(to(rod, "retrieving", { catch: null }), "reeled");
      if (time >= rod.wait) {
        if (!rod.catch) return one(to(rod, "retrieving"), "empty");
        return one(to(rod, "take", { window: ROD.takeMin + world.random() * (ROD.takeMax - ROD.takeMin) }), "take");
      }
      const done = rod.nibbles - Math.max(0, Math.ceil((rod.wait - time) / ROD.nibbleGap - 1e-6));
      const before = rod.nibbles - Math.max(0, Math.ceil((rod.wait - rod.time) / ROD.nibbleGap - 1e-6));
      const nibbled = rod.catch && time >= rod.nibbleAt && done > before;
      return one({ ...rod, time, hold }, nibbled ? "nibble" : null);
    }
    case "take":
      if (!world.canFish) return one(to(rod, "retrieving", { catch: null }), "reeled");
      if (input.pressed) return one(to(rod, "fight", { fight: startFight(rod.catch.species, rod.distance, world.random) }), "hooked");
      if (time > rod.window) {
        if (rod.spooked) return one(to(rod, "retrieving", { catch: null }), "missed");
        return one(plan(rod, { ...rod.catch, shoal: false }, world.random, true), "spooked");
      }
      return one({ ...rod, time });
    case "fight": {
      if (!world.canFish) return one(to(rod, "lost", { catch: null, fight: null }), "snapped");
      const step = stepFight(rod.fight, dt, input.held, world.random);
      if (step.end === "landed") return { rod: to(rod, "landed", { fight: step.fight }), events: [...step.events, "landed"] };
      if (step.end) return { rod: to(rod, "lost", { catch: null, fight: step.fight }), events: [...step.events, step.end] };
      return { rod: { ...rod, time, fight: step.fight }, events: step.events };
    }
    case "landed":
      if (time > ROD.landedTime) return one(to(rod, "idle", { catch: null, fight: null }));
      return one({ ...rod, time });
    case "lost":
      if (time > ROD.lostTime) return one(to(rod, "idle", { fight: null }));
      return one({ ...rod, time });
    case "retrieving":
      if (time > ROD.retrieve) return one(to(rod, "idle", { catch: null }));
      return one({ ...rod, time });
    default:
      return one(rod);
  }
}
