/**
 * Global world tuning constants.
 *
 * The city GLB ships at roughly 53 x 14 x 53 model units while every vehicle
 * model is already authored in metres, so CITY_SCALE lifts the city into the
 * same metric space: a 4.6 m car then reads correctly against a building.
 *
 * CITY_OFFSET additionally slides the city so that the *playable* street area
 * (not the backdrop skyline) is centred on the world origin.
 */
export const CITY_SCALE = 5;

export const CITY_OFFSET: readonly [number, number, number] = [
  -11.46 * CITY_SCALE + 61,
  0,
  0.04 * CITY_SCALE + 3.5,
];

/** Approximate playable radius from origin, used for culling and the minimap. */
export const WORLD_RADIUS = 140;

export const GRAVITY: readonly [number, number, number] = [0, -9.81 * 1.7, 0];

/** Anything below this Y has fallen out of the world and gets respawned. */
export const KILL_PLANE_Y = -30;

export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.3;

/** Capsule half-height excluding the two hemispherical caps. */
export const PLAYER_CAPSULE_HALF_HEIGHT = PLAYER_HEIGHT / 2 - PLAYER_RADIUS;

export const MOVE_SPEED = {
  walk: 3.2,
  run: 6.8,
  aim: 1.7,
} as const;

export const JUMP_SPEED = 7.4;

/** Seconds of real time per in-game hour. */
export const SECONDS_PER_GAME_HOUR = 45;

export const CAMERA = {
  minDistance: 2.6,
  maxDistance: 9,
  defaultDistance: 5.4,
  runDistance: 6.4,
  aimDistance: 2.2,
  minPitch: -0.9,
  maxPitch: 1.15,
  height: 1.5,
  /** Radians per pixel of mouse movement. */
  sensitivity: 0.0026,
} as const;
