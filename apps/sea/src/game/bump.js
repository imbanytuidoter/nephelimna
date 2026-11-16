export const BUMP = { minSpeed: 1.2, fullSpeed: 8, gap: 0.45, quiet: 0.25 };

/** Pushes keep acting while the hull rests against a pier or another boat, so a new knock sounds only after the contact has been quiet for a moment, not on every physics step. */
export function createBump(play) {
  let since = Infinity;
  return (dt, speed) => {
    since += dt;
    if (speed < BUMP.minSpeed) return null;
    const fresh = since >= BUMP.gap;
    since = 0;
    if (!fresh) return null;
    const volume = Math.min(1, Math.max(BUMP.quiet, speed / BUMP.fullSpeed));
    play(volume, 1.05 - 0.3 * volume);
    return volume;
  };
}
