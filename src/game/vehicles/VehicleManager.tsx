import { useEffect, useMemo } from 'react';
import { VEHICLE_SPAWNS } from '../../config/spawnPoints';
import type { VehicleKind } from '../../config/vehicles';
import { useVehicleStore, type VehicleInstance } from '../../stores/vehicleStore';
import { isClear } from '../../utils/cityGrid';
import { Vehicle } from './Vehicle';

/** Which car sits at which parking spot; deliberately fixed, not random. */
const PARKED_LAYOUT: VehicleKind[] = [
  'COMMON',
  'COMMON',
  'SPORT',
  'COMMON',
  'VAN',
  'COMMON',
  'SPORT',
  'COMMON',
  'VAN',
  'COMMON',
  'SPORT',
  'VAN',
];

/**
 * Places the parked cars that make the city drivable.
 *
 * Spots come from spawnPoints.ts and are re-checked against the baked street
 * grid, so a car never materialises inside a building if a spot is edited.
 */
export function VehicleManager(): React.JSX.Element {
  const registerVehicles = useVehicleStore((state) => state.registerVehicles);

  const instances = useMemo<VehicleInstance[]>(() => {
    // ?vehicles=N caps how many cars spawn, for profiling and debugging.
    const requested = Number(
      new URLSearchParams(window.location.search).get('vehicles') ?? NaN,
    );
    const limit = Number.isFinite(requested) ? Math.max(0, requested) : Infinity;

    return VEHICLE_SPAWNS.filter((spawn) =>
      isClear(spawn.position[0], spawn.position[2], 2.6),
    )
      .slice(0, limit)
      .map((spawn, index) => ({
      id: spawn.id,
      kind: PARKED_LAYOUT[index % PARKED_LAYOUT.length],
      position: spawn.position,
      rotation: spawn.rotation ?? 0,
      owned: false,
      }));
  }, []);

  useEffect(() => {
    registerVehicles(instances);
    if (import.meta.env.DEV) {
      const skipped = VEHICLE_SPAWNS.length - instances.length;
      if (skipped > 0) {
        console.warn(`[VehicleManager] ${skipped} parking spot(s) blocked, skipped`);
      }
    }
  }, [instances, registerVehicles]);

  return (
    <>
      {instances.map((instance) => (
        <Vehicle
          key={instance.id}
          id={instance.id}
          kind={instance.kind}
          position={instance.position}
          rotation={instance.rotation}
        />
      ))}
    </>
  );
}
