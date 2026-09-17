import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { MODEL_SPECS, MODEL_URLS } from '../../config/models';
import {
  KILL_PLANE_Y,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from '../../config/world';
import { PLAYER_SPAWN } from '../../config/spawnPoints';
import { normaliseModel, prepareForRender } from '../../utils/modelUtils';
import { usePlayerStore } from '../../stores/playerStore';
import { useGameStore } from '../../stores/gameStore';
import { gameRefs } from '../gameRefs';
import { PlayerController } from './PlayerController';
import { CharacterAnimator, type GaitName } from './PlayerAnimations';

const MOTION_TO_GAIT: Record<string, GaitName> = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  RUN: 'RUN',
  JUMP: 'JUMP',
  FALL: 'FALL',
  AIM: 'AIM',
  SHOOT: 'AIM',
  ENTERING_VEHICLE: 'IDLE',
  EXITING_VEHICLE: 'IDLE',
  DEAD: 'IDLE',
};

export function Player(): React.JSX.Element {
  const gltf = useGLTF(MODEL_URLS.player);
  const { world } = useRapier();

  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const visualRef = useRef<THREE.Group>(null);

  const setMotionState = usePlayerStore((state) => state.setMotionState);
  const setGrounded = usePlayerStore((state) => state.setGrounded);

  const { model, animator } = useMemo(() => {
    const normalised = normaliseModel(gltf, MODEL_SPECS.player);
    prepareForRender(normalised.scene, true);
    normalised.scene.updateWorldMatrix(true, true);
    return { model: normalised, animator: new CharacterAnimator(normalised.scene) };
  }, [gltf]);

  const controller = useMemo(() => new PlayerController(world), [world]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      // Handy for inspecting the rig from the console, e.g. checking that the
      // procedural gait is actually driving the bones.
      (window as unknown as { player: unknown }).player = {
        animator,
        root: model.scene,
        bones: animator.boundSlots,
      };
      if (!animator.hasSkeleton) {
        console.warn('[Player] no usable skeleton found; mesh will not animate');
      }
    }
    return () => controller.dispose();
  }, [controller, animator, model]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const visual = visualRef.current;
    if (!body || !collider || !visual) return;

    const gameState = useGameStore.getState().state;
    const locked = gameState !== 'PLAYING' || gameRefs.activeVehicleId !== null;

    const result = controller.update(
      delta,
      body,
      collider,
      gameRefs.cameraYaw,
      locked,
      false,
    );

    const position = body.translation();

    // Fell through the world: put them back on the street.
    if (position.y < KILL_PLANE_Y) {
      controller.teleport(body, ...PLAYER_SPAWN.position);
      return;
    }

    // Publish to refs for the camera, sun rig and AI - never to React state.
    gameRefs.playerPosition.set(position.x, position.y, position.z);
    gameRefs.playerHeading = result.heading;
    gameRefs.playerGrounded = result.grounded;
    gameRefs.currentSpeed = result.speed;

    // The capsule origin is its centre; the mesh pivot is at the feet.
    visual.position.set(
      position.x,
      position.y - PLAYER_HEIGHT / 2,
      position.z,
    );
    visual.rotation.y = result.heading;

    animator.update(delta, result.speed, MOTION_TO_GAIT[result.motionState] ?? 'IDLE', result.turn);

    // Store writes are deduplicated inside the store, so this is cheap.
    setMotionState(result.motionState);
    setGrounded(result.grounded);
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={PLAYER_SPAWN.position as unknown as [number, number, number]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          ref={colliderRef}
          args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_RADIUS]}
        />
      </RigidBody>

      {/* Rendered outside the body so it never inherits physics jitter. */}
      <group ref={visualRef}>
        <primitive object={model.scene} />
      </group>
    </>
  );
}

useGLTF.preload(MODEL_URLS.player);
