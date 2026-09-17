import * as THREE from 'three';

/**
 * Per-frame gameplay values that must never live in React state.
 *
 * Position, heading and camera yaw change every frame; pushing them through
 * Zustand would re-render the whole UI 60 times a second. Systems that need
 * them (camera rig, sun rig, NPC/police AI, minimap) read these refs directly
 * inside useFrame, while Zustand keeps only what the UI actually displays.
 */
export const gameRefs = {
  /** Player capsule centre in world space. */
  playerPosition: new THREE.Vector3(0, 1, 0),
  /** Player facing, radians, 0 = +Z. */
  playerHeading: 0,
  playerVelocity: new THREE.Vector3(),
  playerGrounded: true,
  /** Camera orbit yaw, shared so movement can be camera-relative. */
  cameraYaw: 0,
  cameraPitch: 0.18,
  /** Set while the player is inside a vehicle. */
  activeVehicleId: null as string | null,
  /** Speed of whatever the player is controlling, m/s. */
  currentSpeed: 0,
};

export function resetGameRefs(): void {
  gameRefs.playerPosition.set(0, 1, 0);
  gameRefs.playerHeading = 0;
  gameRefs.playerVelocity.set(0, 0, 0);
  gameRefs.playerGrounded = true;
  gameRefs.cameraYaw = 0;
  gameRefs.cameraPitch = 0.18;
  gameRefs.activeVehicleId = null;
  gameRefs.currentSpeed = 0;
}

/** Dev-only handle so the refs can be inspected or driven from the console. */
if (import.meta.env.DEV) {
  (window as unknown as { gameRefs: typeof gameRefs }).gameRefs = gameRefs;
}
