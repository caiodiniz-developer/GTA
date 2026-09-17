import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import { getVehicleDefinition, type VehicleKind } from '../../config/vehicles';
import { GRAVITY, PHYSICS_STEP } from '../../config/world';
import { GROUND_Y } from '../../utils/cityGrid';
import { useGameStore } from '../../stores/gameStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { input } from '../../hooks/useInput';
import { gameRefs } from '../gameRefs';
import { buildVehicleRig } from './VehicleRig';
import { VehicleController, type DriveInput } from './VehicleController';
import { registerVehicle, type VehicleRegistryEntry } from './vehicleRegistry';

interface VehicleProps {
  id: string;
  kind: VehicleKind;
  position: readonly [number, number, number];
  rotation: number;
}

const idleInput: DriveInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
};

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();

export function Vehicle({ id, kind, position, rotation }: VehicleProps): React.JSX.Element {
  const definition = getVehicleDefinition(kind);
  const gltf = useGLTF(definition.url);
  const { world, rapier } = useRapier();

  const bodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  const controllerRef = useRef<VehicleController | null>(null);

  const rig = useMemo(() => buildVehicleRig(gltf, definition), [gltf, definition]);

  /**
   * Body height at which the car already sits on its springs.
   *
   * Spawning at an arbitrary height makes every car drop and bounce on load.
   * Solving the static equilibrium instead (spring compression that carries a
   * quarter of the mass) puts the wheels on the road from the first frame.
   */
  const spawnY = useMemo(() => {
    const wheel = rig.wheels[0];
    if (!wheel) return position[1];
    const staticCompression =
      (definition.mass * Math.abs(GRAVITY[1])) /
      (rig.wheels.length * definition.suspensionStiffness);
    return GROUND_Y + wheel.radius - wheel.position[1] - staticCompression;
  }, [rig, definition, position]);

  // Live entry other systems (interaction, minimap, police) read each frame.
  const registryEntry = useMemo<VehicleRegistryEntry>(
    () => ({
      id,
      kind,
      position: new THREE.Vector3(position[0], position[1], position[2]),
      heading: rotation,
      occupied: false,
      speed: 0,
    }),
    [id, kind, position, rotation],
  );

  useEffect(() => registerVehicle(registryEntry), [registryEntry]);

  // The Rapier vehicle controller needs the rigid body, so it is created once
  // the body exists rather than during render.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    // Rapier sizes mass from collider volume times density, which for a car
    // shaped box lands at about 7 kg. Every engine, brake and suspension figure
    // here is quoted in newtons against the real mass, so set it explicitly,
    // and drop the centre of mass down near axle height so the car corners
    // instead of tipping over.
    const collider = body.collider(0);
    if (collider) {
      const mass = definition.mass;
      const [hx, hy, hz] = definition.chassisHalfExtents;
      const width = hx * 2;
      const height = hy * 2;
      const depth = hz * 2;
      const factor = mass / 12;
      collider.setMassProperties(
        mass,
        { x: 0, y: definition.centreOfMassHeight, z: 0 },
        {
          x: factor * (height * height + depth * depth),
          y: factor * (width * width + depth * depth),
          // Extra roll inertia keeps the body from flopping side to side.
          z: factor * (width * width + height * height) * 1.6,
        },
        { x: 0, y: 0, z: 0, w: 1 },
      );
      // The body caches mass from its colliders, so it has to be told to
      // pick the new values up.
      body.recomputeMassPropertiesFromColliders();
    }

    const controller = new VehicleController(world, rapier, body, definition, rig.wheels);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [world, rapier, definition, rig]);

  useEffect(() => () => rig.dispose(), [rig]);

  /**
   * Drive the wheels once per *physics* step, not once per rendered frame.
   *
   * Rapier's vehicle controller applies its suspension and tyre impulses the
   * moment it is called. On a slow frame the world takes many substeps, so
   * updating from useFrame would let gravity act over every substep while the
   * suspension pushed back only once - the car sinks, over-corrects, and
   * bounces. Stepping in lockstep keeps it planted at any framerate.
   */
  useBeforePhysicsStep(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    const driving = useVehicleStore.getState().activeVehicleId === id;
    const playing = useGameStore.getState().state === 'PLAYING';

    const drive: DriveInput =
      driving && playing
        ? {
            throttle: input.forward ? 1 : 0,
            brake: input.backward ? 1 : 0,
            steer: (input.left ? 1 : 0) - (input.right ? 1 : 0),
            handbrake: input.handbrake,
            boost: input.run,
          }
        : idleInput;

    controller.update(PHYSICS_STEP, drive);
  });

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    const controller = controllerRef.current;
    if (!body || !group) return;

    const driving = useVehicleStore.getState().activeVehicleId === id;
    const state = controller?.state ?? null;

    // Mirror the physics body onto the visual rig.
    const translation = body.translation();
    const rotationQuat = body.rotation();
    group.position.set(translation.x, translation.y, translation.z);
    group.quaternion.set(rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w);

    if (controller) {
      for (let i = 0; i < rig.wheelPivots.length && i < controller.wheelCount; i++) {
        const pivot = rig.wheelPivots[i];
        const anchor = rig.wheels[i];
        // Suspension travel: the pivot rides under its connection point.
        const suspension = controller.wheelSuspensionLength(i);
        pivot.position.y =
          anchor.position[1] + definition.suspensionRestLength - suspension;
        pivot.rotation.set(0, controller.wheelSteer(i), -controller.wheelSpin(i), 'YXZ');
      }
    }

    registryEntry.position.set(translation.x, translation.y, translation.z);
    registryEntry.heading = new THREE.Euler().setFromQuaternion(group.quaternion, 'YXZ').y;
    registryEntry.speed = state?.groundSpeed ?? 0;
    if (driving) {
      // The camera and every other system follow the car while it is driven.
      group.getWorldPosition(worldPosition);
      group.getWorldQuaternion(worldQuaternion);
      gameRefs.playerPosition.copy(worldPosition);
      gameRefs.playerHeading = new THREE.Euler().setFromQuaternion(worldQuaternion, 'YXZ').y;
      gameRefs.currentSpeed = state?.groundSpeed ?? 0;
      gameRefs.vehicleSpeed = state?.groundSpeed ?? 0;
      gameRefs.vehicleSlip = state?.slip ?? 0;
    }

    // Brake lights and headlights.
    const braking = Boolean(state?.braking) && driving;
    for (const light of rig.brakeLights) {
      const material = light.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(braking ? 0xff2200 : 0x220000);
      material.emissiveIntensity = braking ? 3.4 : 0.6;
    }

    const night = useGameStore.getState().timeOfDay === 'NIGHT';
    const headlightTarget = night || driving ? (night ? 26 : 0) : 0;
    for (const light of rig.headlights) {
      light.intensity = THREE.MathUtils.damp(light.intensity, headlightTarget, 6, delta);
    }
  });

  const [halfX, halfY, halfZ] = definition.chassisHalfExtents;


  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        colliders={false}
        position={[position[0], spawnY, position[2]]}
        rotation={[0, rotation, 0]}
        linearDamping={0.12}
        angularDamping={0.9}
        canSleep={false}
        ccd
        softCcdPrediction={1.5}
        userData={{ type: 'vehicle', id }}
      >
        <CuboidCollider
          args={[halfX, halfY, halfZ]}
          position={definition.chassisOffset as unknown as [number, number, number]}
          friction={0.7}
          restitution={0.05}
        />
      </RigidBody>

      {/* Drawn outside the RigidBody so wheels can be posed independently. */}
      <group ref={groupRef}>
        <primitive object={rig.root} />
      </group>
    </>
  );
}
