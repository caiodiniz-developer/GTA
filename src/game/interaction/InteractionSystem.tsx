import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getVehicleDefinition } from '../../config/vehicles';
import { onEdge } from '../../hooks/useInput';
import { useGameStore } from '../../stores/gameStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useUiStore } from '../../stores/uiStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { gameRefs } from '../gameRefs';
import { vehicleRegistry } from '../vehicles/vehicleRegistry';

/** How close the player must stand to a car before they can get in. */
const ENTER_RADIUS = 4.2;

const exitOffset = new THREE.Vector3();
const vehicleQuaternion = new THREE.Quaternion();

/**
 * Proximity-driven interaction.
 *
 * Every frame this finds the nearest interactable to the player and publishes a
 * prompt for the HUD; pressing the matching key runs the action. Distance
 * checks read from refs and the vehicle registry, so no React state is touched
 * unless the prompt itself actually changes.
 */
export function InteractionSystem(): null {
  const nearestRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onEdge((action) => {
      if (action !== 'enterVehicle') return;
      if (useGameStore.getState().state !== 'PLAYING') return;

      const vehicleStore = useVehicleStore.getState();
      const activeId = vehicleStore.activeVehicleId;

      if (activeId) {
        exitVehicle(activeId);
        return;
      }

      const targetId = nearestRef.current;
      if (targetId) enterVehicle(targetId);
    });
    return unsubscribe;
  }, []);

  useFrame(() => {
    if (useGameStore.getState().state !== 'PLAYING') return;

    const { activeVehicleId, setNearbyVehicle } = useVehicleStore.getState();
    const setPrompt = useUiStore.getState().setPrompt;

    if (activeVehicleId) {
      nearestRef.current = null;
      setNearbyVehicle(null);
      setPrompt({ key: 'F', action: 'ENTER_VEHICLE', label: 'EXIT VEHICLE' });
      return;
    }

    // Nearest vehicle within reach.
    let bestId: string | null = null;
    let bestDistance = ENTER_RADIUS;
    for (const [id, entry] of vehicleRegistry) {
      const distance = entry.position.distanceTo(gameRefs.playerPosition);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = id;
      }
    }

    nearestRef.current = bestId;
    setNearbyVehicle(bestId);

    if (bestId) {
      const entry = vehicleRegistry.get(bestId)!;
      const definition = getVehicleDefinition(entry.kind);
      setPrompt({
        key: 'F',
        action: entry.occupied ? 'TAKE_VEHICLE' : 'ENTER_VEHICLE',
        label: entry.occupied ? `TAKE ${definition.name}` : `ENTER ${definition.name}`,
      });
    } else {
      setPrompt(null);
    }
  });

  return null;
}

function enterVehicle(id: string): void {
  const entry = vehicleRegistry.get(id);
  if (!entry) return;

  useVehicleStore.getState().setActiveVehicle(id);
  gameRefs.activeVehicleId = id;
  usePlayerStore.getState().setMotionState('ENTERING_VEHICLE');
  useUiStore.getState().showToast(getVehicleDefinition(entry.kind).name);
  window.setTimeout(() => useUiStore.getState().showToast(null), 2200);
}

function exitVehicle(id: string): void {
  const entry = vehicleRegistry.get(id);
  useVehicleStore.getState().setActiveVehicle(null);
  gameRefs.activeVehicleId = null;
  usePlayerStore.getState().setMotionState('EXITING_VEHICLE');

  if (entry) {
    // Step out of the driver's door rather than materialising inside the car.
    const definition = getVehicleDefinition(entry.kind);
    vehicleQuaternion.setFromEuler(new THREE.Euler(0, entry.heading, 0));
    exitOffset
      .set(definition.doorOffset[0], 0, definition.doorOffset[2])
      .applyQuaternion(vehicleQuaternion);
    gameRefs.pendingTeleport = {
      x: entry.position.x + exitOffset.x,
      y: entry.position.y + 1.1,
      z: entry.position.z + exitOffset.z,
      heading: entry.heading,
    };
  }
}
