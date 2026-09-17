import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { CAMERA } from '../../config/world';
import { input } from '../../hooks/useInput';
import { useGameStore } from '../../stores/gameStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { gameRefs } from '../gameRefs';

const desiredPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const offset = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();

/**
 * Orbiting follow camera.
 *
 * Yaw/pitch come from the mouse and live in gameRefs so movement can be
 * camera-relative. The boom is shortened by a physics raycast so the camera
 * never ends up inside a building, and the rest length reacts to what the
 * player is doing: wider while sprinting, tight over the shoulder while aiming.
 */
export function ThirdPersonCamera(): null {
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();

  const distance = useRef<number>(CAMERA.defaultDistance);
  const smoothedDistance = useRef<number>(CAMERA.defaultDistance);
  const currentPosition = useRef(new THREE.Vector3(0, 5, 10));
  const currentLook = useRef(new THREE.Vector3());
  const initialised = useRef(false);

  const sensitivity = useSettingsStore((state) => state.mouseSensitivity);
  const cameraDistanceScale = useSettingsStore((state) => state.cameraDistance);

  // Pointer lock is what makes the mouse drive the camera rather than a cursor.
  useEffect(() => {
    const canvas = gl.domElement;
    const requestLock = () => {
      if (useGameStore.getState().state !== 'PLAYING') return;
      if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock?.();
      }
    };
    canvas.addEventListener('click', requestLock);

    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.state !== 'PLAYING' && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    });

    return () => {
      canvas.removeEventListener('click', requestLock);
      unsubscribe();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const gameState = useGameStore.getState().state;
    if (gameState === 'CUTSCENE') return; // cutscenes drive the camera themselves

    if (gameState === 'PLAYING') {
      gameRefs.cameraYaw -= input.mouseDeltaX * CAMERA.sensitivity * sensitivity;
      gameRefs.cameraPitch += input.mouseDeltaY * CAMERA.sensitivity * sensitivity;
      gameRefs.cameraPitch = THREE.MathUtils.clamp(
        gameRefs.cameraPitch,
        CAMERA.minPitch,
        CAMERA.maxPitch,
      );

      if (input.wheelDelta !== 0) {
        distance.current = THREE.MathUtils.clamp(
          distance.current + input.wheelDelta * 0.004,
          CAMERA.minDistance,
          CAMERA.maxDistance,
        );
      }
    }
    input.mouseDeltaX = 0;
    input.mouseDeltaY = 0;
    input.wheelDelta = 0;

    const aiming = usePlayerStore.getState().motionState === 'AIM';
    const inVehicle = gameRefs.activeVehicleId !== null;

    let restLength = distance.current * cameraDistanceScale;
    if (aiming) restLength = CAMERA.aimDistance;
    else if (input.run && gameRefs.currentSpeed > 4) restLength = Math.max(restLength, CAMERA.runDistance);
    if (inVehicle) restLength = Math.max(restLength, 7.4);

    const pivotHeight = inVehicle ? 2.1 : CAMERA.height;
    lookTarget.copy(gameRefs.playerPosition);
    lookTarget.y += pivotHeight - (inVehicle ? 0 : 0.1);

    const cosPitch = Math.cos(gameRefs.cameraPitch);
    offset.set(
      Math.sin(gameRefs.cameraYaw) * cosPitch,
      Math.sin(gameRefs.cameraPitch) + 0.18,
      Math.cos(gameRefs.cameraYaw) * cosPitch,
    ).normalize();

    // Shorten the boom if the city is in the way. The ray starts clear of the
    // player's own capsule so it cannot immediately hit the character.
    const skip = 0.6;
    let allowed = restLength;
    rayOrigin.copy(lookTarget).addScaledVector(offset, skip);
    rayDirection.copy(offset);
    const ray = new rapier.Ray(rayOrigin, rayDirection);
    const hit = world.castRay(ray, Math.max(0.1, restLength - skip), true);
    if (hit) {
      allowed = Math.max(CAMERA.minDistance * 0.5, skip + hit.timeOfImpact - 0.3);
    }

    // Snap in when blocked, ease out when clear, so corners do not swing wildly.
    const easeIn = allowed < smoothedDistance.current;
    smoothedDistance.current = THREE.MathUtils.damp(
      smoothedDistance.current,
      allowed,
      easeIn ? 30 : 6,
      dt,
    );

    desiredPosition.copy(lookTarget).addScaledVector(offset, smoothedDistance.current);

    if (!initialised.current) {
      currentPosition.current.copy(desiredPosition);
      currentLook.current.copy(lookTarget);
      initialised.current = true;
    }

    const follow = aiming ? 26 : 14;
    currentPosition.current.x = THREE.MathUtils.damp(currentPosition.current.x, desiredPosition.x, follow, dt);
    currentPosition.current.y = THREE.MathUtils.damp(currentPosition.current.y, desiredPosition.y, follow, dt);
    currentPosition.current.z = THREE.MathUtils.damp(currentPosition.current.z, desiredPosition.z, follow, dt);
    currentLook.current.x = THREE.MathUtils.damp(currentLook.current.x, lookTarget.x, 20, dt);
    currentLook.current.y = THREE.MathUtils.damp(currentLook.current.y, lookTarget.y, 20, dt);
    currentLook.current.z = THREE.MathUtils.damp(currentLook.current.z, lookTarget.z, 20, dt);

    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLook.current);

    // A touch of extra FOV at speed sells the sense of momentum.
    const perspective = camera as THREE.PerspectiveCamera;
    const targetFov = 62 + THREE.MathUtils.clamp(gameRefs.currentSpeed - 6, 0, 22) * 0.75 - (aiming ? 12 : 0);
    perspective.fov = THREE.MathUtils.damp(perspective.fov, targetFov, 6, dt);
    perspective.updateProjectionMatrix();
  });

  return null;
}
