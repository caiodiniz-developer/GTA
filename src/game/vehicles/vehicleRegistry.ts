import * as THREE from 'three';
import type { VehicleKind } from '../../config/vehicles';

export interface VehicleRegistryEntry {
  id: string;
  kind: VehicleKind;
  /** Live world position, written every frame by the Vehicle component. */
  position: THREE.Vector3;
  /** Heading in radians. */
  heading: number;
  /** True when an NPC is behind the wheel, so the prompt reads TAKE VEHICLE. */
  occupied: boolean;
  speed: number;
}

/**
 * Live lookup of every spawned vehicle.
 *
 * Interaction, the minimap, police and traffic all need to know where the cars
 * are each frame. Keeping that in a module-level Map rather than in Zustand
 * means a car moving does not re-render any React component.
 */
export const vehicleRegistry = new Map<string, VehicleRegistryEntry>();

export function registerVehicle(entry: VehicleRegistryEntry): () => void {
  vehicleRegistry.set(entry.id, entry);
  return () => {
    vehicleRegistry.delete(entry.id);
  };
}

export function nearestVehicle(
  point: THREE.Vector3,
  maxDistance: number,
): VehicleRegistryEntry | null {
  let best: VehicleRegistryEntry | null = null;
  let bestDistance = maxDistance;
  for (const entry of vehicleRegistry.values()) {
    const distance = entry.position.distanceTo(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best;
}

/** Dev-only handle for inspecting spawned vehicles from the console. */
if (import.meta.env.DEV) {
  (window as unknown as { vehicleRegistry: typeof vehicleRegistry }).vehicleRegistry =
    vehicleRegistry;
}
