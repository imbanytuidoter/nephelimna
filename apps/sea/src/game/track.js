export const TRACK = { delay: 0.5, ahead: 0.3, keep: 16, window: 20, gap: 2, rewind: 1 };

function wrap(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function blend(a, b, f) {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    yaw: a.yaw + wrap(b.yaw - a.yaw) * f,
  };
}

/** Reports reach us in uneven bunches, so each one is placed on the sender's own clock and the boat is drawn a fixed moment in the past, between two known reports, instead of chasing whichever report came last. */
export function createTrack() {
  let samples = [];
  let offsets = [];

  const reset = () => {
    samples = [];
    offsets = [];
  };

  return {
    push(boat, receive) {
      const heard = receive - (Number.isFinite(boat.age) ? boat.age / 1000 : 0);
      const clock = Number.isFinite(boat.t) ? boat.t : null;
      const last = samples.at(-1);
      if (last && clock !== null && last.clock !== null) {
        if (clock < last.clock - TRACK.rewind) reset();
        else if (clock <= last.clock) return;
      }
      let time = heard;
      if (clock !== null) {
        offsets = [...offsets, heard - clock].slice(-TRACK.window);
        time = clock + Math.min(...offsets);
      }
      const previous = samples.at(-1);
      if (previous && time <= previous.time) return;
      if (previous && time - previous.time > TRACK.gap) samples = [];
      samples = [...samples, { time, clock, x: boat.x, y: boat.y, z: boat.z, yaw: boat.yaw }].slice(-TRACK.keep);
    },
    at(now) {
      if (!samples.length) return null;
      const when = now - TRACK.delay;
      const first = samples[0];
      if (when <= first.time) return blend(first, first, 0);
      const after = samples.findIndex((s) => s.time >= when);
      if (after > 0) {
        const a = samples[after - 1];
        const b = samples[after];
        if (after > 1) samples = samples.slice(after - 1);
        return blend(a, b, (when - a.time) / (b.time - a.time));
      }
      const b = samples.at(-1);
      if (samples.length < 2) return blend(b, b, 0);
      const a = samples.at(-2);
      const ahead = Math.min(when - b.time, TRACK.ahead) / (b.time - a.time);
      return blend(b, { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y), z: b.z + (b.z - a.z), yaw: b.yaw + wrap(b.yaw - a.yaw) }, ahead);
    },
  };
}
