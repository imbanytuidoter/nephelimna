const STIFFNESS = 700;
const DAMPING = 46;
const SKIN = 0.25;
const ROCK_REACH = 45;
const ROCK_WATERLINE = -0.5;
const SHOAL_DEPTH = -0.62;
const SHOAL_STEP = 0.8;
const SHOAL_STIFFNESS = 420;

/** A spring alone lets a fast boat sink past the middle of a thin pier and pop out the far side, so the part of the boat's speed that drives it into the obstacle is also removed outright each step. */
function pushOut(body, point, nx, nz, depth, stiffness, force, torque, scratch, stop) {
  const { push, arm, cross } = scratch;
  arm.subVectors(point, body.pos);
  cross.copy(body.angVel).cross(arm).add(body.vel);
  const closing = cross.x * nx + cross.z * nz;
  const strength = Math.max(0, body.cellMass * (stiffness * depth - DAMPING * closing));
  push.set(nx * strength, 0, nz * strength);
  force.add(push);
  torque.add(cross.copy(arm).cross(push));
  const inward = -(body.vel.x * nx + body.vel.z * nz);
  if (inward > stop.speed) {
    stop.speed = inward;
    stop.nx = nx;
    stop.nz = nz;
  }
}

export function rockFootprint(rock) {
  if (rock.top <= ROCK_WATERLINE) return 0;
  const rise = rock.top - rock.y;
  const sunk = Math.min(1, Math.max(0, (ROCK_WATERLINE - rock.y) / Math.max(rise, 1e-3)));
  return rock.r * Math.sqrt(Math.max(0, 1 - sunk * sunk));
}

export function createCollisions({ blocks = [], deckTop = 0, rocks = [], heightAt = null, vessels = () => [] }) {
  const solid = rocks.map((rock) => ({ x: rock.x, z: rock.z, r: rockFootprint(rock) })).filter((rock) => rock.r > 0.2);
  const near = [];

  const stop = { speed: 0, nx: 0, nz: 0 };
  let impact = 0;
  const pushBlock = (body, point, block, force, torque, scratch) => {
    const dx = point.x - block.x;
    const dz = point.z - block.z;
    const along = dx * block.ax.x + dz * block.ax.z;
    const across = -dx * block.ax.z + dz * block.ax.x;
    const overAlong = block.halfLength + SKIN - Math.abs(along);
    const overAcross = block.halfWidth + SKIN - Math.abs(across);
    if (overAlong <= 0 || overAcross <= 0) return;
    const cx = body.pos.x - block.x;
    const cz = body.pos.z - block.z;
    const centreAlong = cx * block.ax.x + cz * block.ax.z;
    const centreAcross = -cx * block.ax.z + cz * block.ax.x;
    const alongOut = Math.abs(centreAlong) - block.halfLength;
    const acrossOut = Math.abs(centreAcross) - block.halfWidth;
    if (alongOut > acrossOut) pushOut(body, point, block.ax.x * Math.sign(centreAlong), block.ax.z * Math.sign(centreAlong), overAlong, STIFFNESS, force, torque, scratch, stop);
    else pushOut(body, point, -block.ax.z * Math.sign(centreAcross), block.ax.x * Math.sign(centreAcross), overAcross, STIFFNESS, force, torque, scratch, stop);
  };

  const collide = (body, force, torque, scratch, step = 1 / 60) => {
    stop.speed = 0;
    const points = body.probeWorld.length ? body.probeWorld : body.world;
    near.length = 0;
    const hulls = vessels().filter((hull) => Math.abs(hull.x - body.pos.x) < ROCK_REACH && Math.abs(hull.z - body.pos.z) < ROCK_REACH);
    for (const rock of solid) {
      if (Math.abs(rock.x - body.pos.x) < ROCK_REACH && Math.abs(rock.z - body.pos.z) < ROCK_REACH) near.push(rock);
    }
    for (const point of points) {
      if (point.y <= deckTop) {
        for (const block of blocks) pushBlock(body, point, block, force, torque, scratch);
      }
      for (const hull of hulls) pushBlock(body, point, hull, force, torque, scratch);
      for (const rock of near) {
        const dx = point.x - rock.x;
        const dz = point.z - rock.z;
        const gap = Math.hypot(dx, dz);
        const depth = rock.r + SKIN - gap;
        if (depth <= 0 || gap < 1e-4) continue;
        const cx = body.pos.x - rock.x;
        const cz = body.pos.z - rock.z;
        const away = Math.hypot(cx, cz) || 1;
        pushOut(body, point, cx / away, cz / away, depth, STIFFNESS, force, torque, scratch, stop);
      }
      if (heightAt) {
        const bed = heightAt(point.x, point.z);
        if (bed > SHOAL_DEPTH) {
          const gx = heightAt(point.x + SHOAL_STEP, point.z) - bed;
          const gz = heightAt(point.x, point.z + SHOAL_STEP) - bed;
          const slope = Math.hypot(gx, gz);
          if (slope > 1e-4) pushOut(body, point, -gx / slope, -gz / slope, Math.min(1.2, bed - SHOAL_DEPTH), SHOAL_STIFFNESS, force, torque, scratch, stop);
        }
      }
    }
    impact = Math.max(impact, stop.speed);
    if (stop.speed > 0) {
      const brake = (body.mass * stop.speed) / step;
      force.x += stop.nx * brake;
      force.z += stop.nz * brake;
    }
  };
  collide.takeImpact = () => {
    const hit = impact;
    impact = 0;
    return hit;
  };
  return collide;
}
