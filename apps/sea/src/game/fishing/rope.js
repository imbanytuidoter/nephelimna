const GRAVITY = 9.81;
const DAMPING = 0.985;
const ITERATIONS = 8;

export function createRope(count) {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  let ready = false;

  const reset = (ax, ay, az, bx, by, bz) => {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      x[i] = px[i] = ax + (bx - ax) * t;
      y[i] = py[i] = ay + (by - ay) * t;
      z[i] = pz[i] = az + (bz - az) * t;
    }
    ready = true;
  };

  return {
    count,
    x,
    y,
    z,
    reset,
    clear() {
      ready = false;
    },
    step(dt, a, b, length, floor, taut = 0) {
      if (!ready) reset(a.x, a.y, a.z, b.x, b.y, b.z);
      const h = Math.min(dt, 1 / 30);
      const segment = length / (count - 1);
      for (let i = 1; i < count - 1; i++) {
        const vx = (x[i] - px[i]) * DAMPING;
        const vy = (y[i] - py[i]) * DAMPING;
        const vz = (z[i] - pz[i]) * DAMPING;
        px[i] = x[i];
        py[i] = y[i];
        pz[i] = z[i];
        x[i] += vx;
        y[i] += vy - GRAVITY * h * h;
        z[i] += vz;
      }
      for (let pass = 0; pass < ITERATIONS; pass++) {
        x[0] = a.x;
        y[0] = a.y;
        z[0] = a.z;
        x[count - 1] = b.x;
        y[count - 1] = b.y;
        z[count - 1] = b.z;
        for (let i = 0; i < count - 1; i++) {
          const dx = x[i + 1] - x[i];
          const dy = y[i + 1] - y[i];
          const dz = z[i + 1] - z[i];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          if (d <= segment) continue;
          const k = ((d - segment) / d) * 0.5;
          const first = i === 0 ? 0 : 1;
          const last = i + 1 === count - 1 ? 0 : 1;
          const share = first + last || 1;
          x[i] += dx * k * ((2 * first) / share);
          y[i] += dy * k * ((2 * first) / share);
          z[i] += dz * k * ((2 * first) / share);
          x[i + 1] -= dx * k * ((2 * last) / share);
          y[i + 1] -= dy * k * ((2 * last) / share);
          z[i + 1] -= dz * k * ((2 * last) / share);
        }
        for (let i = 1; i < count - 1; i++) if (y[i] < floor) y[i] = floor;
      }
      if (taut > 0) {
        for (let i = 1; i < count - 1; i++) {
          const t = i / (count - 1);
          x[i] += (a.x + (b.x - a.x) * t - x[i]) * taut;
          y[i] += (a.y + (b.y - a.y) * t - y[i]) * taut;
          z[i] += (a.z + (b.z - a.z) * t - z[i]) * taut;
        }
      }
    },
  };
}
