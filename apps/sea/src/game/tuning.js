export const HULL = {
  length: 7.4,
  halfBeam: 1.28,
  cellHeight: 0.5,
  density: 400,
  inertiaScale: { x: 3.2, y: 1, z: 2.6 },
  queryLead: 0.04,
  waterSmoothing: 0.1,
  heaveLimit: 6,
};

export const DRIVE = {
  thrust: 6.2,
  reverse: 0.4,
  quadDrag: 0.034,
  hullDrag: { x: 0.1, y: 3.5, z: 3.2 },
  rideHeight: 0.02,
  rideSpring: 6,
  rideDamping: 0.9,
  rideLead: 0.12,
  pitchSpring: 7,
  rollSpring: 5,
  trimDamping: 0.8,
  pitchFollow: 1,
  rollFollow: 0.8,
  planeAngle: 0.05,
  bankAngle: 0.13,
  steerRate: 1.7,
  steerSpeed: 6,
  propWash: 0.3,
  yawDamp: 1.25,
  bankSpeed: 10,
  planeSpeed: 11,
  throttleRate: 1.4,
  rudderRate: 3.2,
  propOffset: { x: -0.42, y: -0.32 },
  anchorPull: 1.4,
  anchorDamp: 2.4,
  brakeDamp: 0.85,
};

export const CAMERA = {
  distance: 10.5,
  portraitDistance: 13.5,
  height: 3.5,
  lookHeight: 1.7,
  follow: 2.6,
  lift: 1.5,
  speedPull: 0.22,
  minAboveWater: 0.9,
};

export const WAKE = { spacing: 1.1, minSpeed: 1.2, life: 9 };

export const MS_TO_KNOTS = 1.943844;

export const FREEBOARD = { margin: 0.24, aheadMargin: 0.05, ahead: 1.3, spring: 10, tiltSpring: 4.5, share: 0.3 };

export const SEA = { near: 0.03, far: 0.07, nearDistance: 450, farDistance: 1500, steps: 8, swellScale: 0 };
