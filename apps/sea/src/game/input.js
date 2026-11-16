const KEYS = {
  KeyW: ["throttle", 1],
  ArrowUp: ["throttle", 1],
  KeyS: ["throttle", -1],
  ArrowDown: ["throttle", -1],
  KeyD: ["rudder", 1],
  ArrowRight: ["rudder", 1],
  KeyA: ["rudder", -1],
  ArrowLeft: ["rudder", -1],
};

const STICK_RADIUS = 56;
const LOOK_SPEED = 0.006;
const DEAD_ZONE = 0.12;

const shape = (v) => (Math.abs(v) < DEAD_ZONE ? 0 : (Math.sign(v) * (Math.abs(v) - DEAD_ZONE)) / (1 - DEAD_ZONE));

export function createInput(surface, stickEl) {
  const held = new Set();
  const state = { throttle: 0, rudder: 0, lookYaw: 0, lookPitch: 0, lookAge: 99, used: false, turn: 0, tilt: 0, fire: false, locked: false };
  const stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
  const look = { id: null, x: 0, y: 0 };
  const knob = stickEl.firstElementChild;

  const fromKeys = (axis) => {
    let v = 0;
    for (const code of held) if (KEYS[code]?.[0] === axis) v += KEYS[code][1];
    return Math.max(-1, Math.min(1, v));
  };

  addEventListener("keydown", (e) => {
    if (!KEYS[e.code]) return;
    e.preventDefault();
    held.add(e.code);
    state.used = true;
  });
  addEventListener("keyup", (e) => held.delete(e.code));
  addEventListener("blur", () => held.clear());

  const placeStick = () => {
    stickEl.style.transform = `translate(${stick.x - STICK_RADIUS}px, ${stick.y - STICK_RADIUS}px)`;
    knob.style.transform = `translate(${stick.dx}px, ${stick.dy}px)`;
  };

  document.addEventListener("pointerlockchange", () => {
    state.locked = document.pointerLockElement === surface;
    if (!state.locked) state.fire = false;
  });

  surface.addEventListener("pointerdown", (e) => {
    const touch = e.pointerType !== "mouse";
    if (state.locked) {
      if (e.button === 0) state.fire = true;
      return;
    }
    if (touch && e.clientX < innerWidth * 0.5 && stick.id === null) {
      stick.id = e.pointerId;
      stick.x = e.clientX;
      stick.y = e.clientY;
      stick.dx = stick.dy = 0;
      stickEl.hidden = false;
      placeStick();
      state.used = true;
    } else if (look.id === null) {
      look.id = e.pointerId;
      look.x = e.clientX;
      look.y = e.clientY;
    }
    surface.setPointerCapture(e.pointerId);
  });

  surface.addEventListener("pointermove", (e) => {
    if (state.locked) {
      state.turn += e.movementX * LOOK_SPEED * 0.45;
      state.tilt -= e.movementY * LOOK_SPEED * 0.45;
      return;
    }
    if (e.pointerId === stick.id) {
      const dx = e.clientX - stick.x;
      const dy = e.clientY - stick.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, STICK_RADIUS / len);
      stick.dx = dx * k;
      stick.dy = dy * k;
      placeStick();
    } else if (e.pointerId === look.id) {
      state.turn += (e.clientX - look.x) * LOOK_SPEED;
      state.tilt -= (e.clientY - look.y) * LOOK_SPEED;
      state.lookYaw -= (e.clientX - look.x) * LOOK_SPEED;
      state.lookPitch = Math.max(-0.25, Math.min(0.6, state.lookPitch + (e.clientY - look.y) * LOOK_SPEED * 0.6));
      look.x = e.clientX;
      look.y = e.clientY;
      state.lookAge = 0;
    }
  });

  const release = (e) => {
    if (e.button === 0) state.fire = false;
    if (e.pointerId === stick.id) {
      stick.id = null;
      stick.dx = stick.dy = 0;
      stickEl.hidden = true;
    }
    if (e.pointerId === look.id) look.id = null;
  };
  surface.addEventListener("pointerup", release);
  surface.addEventListener("pointercancel", release);
  surface.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    state,
    update(dt) {
      const stickOn = stick.id !== null;
      state.throttle = stickOn ? shape(-stick.dy / STICK_RADIUS) : fromKeys("throttle");
      state.rudder = stickOn ? shape(stick.dx / STICK_RADIUS) : fromKeys("rudder");
      if (look.id === null) state.lookAge += dt;
    },
  };
}
