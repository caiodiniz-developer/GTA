/**
 * Named locations in the city.
 *
 * Every coordinate here was picked from the offline raycast probe of
 * cidade-completa.glb (see src/config/cityGrid.ts), so each one sits on open
 * street with the listed clearance rather than inside a wall.
 */

export type Vec3 = readonly [number, number, number];

export interface SpawnPoint {
  id: string;
  position: Vec3;
  /** Heading in radians, 0 = facing +Z. */
  rotation?: number;
}

export const PLAYER_SPAWN: SpawnPoint = {
  id: 'player_start',
  position: [-11.3, 1.2, -6.8],
  rotation: 0,
};

/** Roomy spots (>= 8 m clearance) suitable for parked cars. */
export const VEHICLE_SPAWNS: SpawnPoint[] = [
  { id: 'veh_01', position: [-11.3, 0.3, -26.8], rotation: 0 },
  { id: 'veh_02', position: [18.7, 0.3, -38.8], rotation: Math.PI / 2 },
  { id: 'veh_03', position: [32.7, 0.3, 11.2], rotation: Math.PI },
  { id: 'veh_04', position: [-11.3, 0.3, 13.2], rotation: 0 },
  { id: 'veh_05', position: [-11.3, 0.3, 33.2], rotation: 0 },
  { id: 'veh_06', position: [36.7, 0.3, -8.8], rotation: -Math.PI / 2 },
  { id: 'veh_07', position: [-37.3, 0.3, 11.2], rotation: Math.PI / 2 },
  { id: 'veh_08', position: [26.7, 0.3, 29.2], rotation: Math.PI },
  { id: 'veh_09', position: [26.7, 0.3, 49.2], rotation: 0 },
  { id: 'veh_10', position: [-41.3, 0.3, 53.2], rotation: Math.PI / 2 },
  { id: 'veh_11', position: [-29.3, 0.3, -32.8], rotation: 0 },
  { id: 'veh_12', position: [6.7, 0.3, -24.8], rotation: Math.PI },
];

/** Points of interest the phone map and minimap advertise. */
export interface PointOfInterest {
  id: string;
  name: string;
  kind: 'GARAGE' | 'SHOP' | 'DEALERSHIP' | 'POLICE' | 'MISSION' | 'HIDEOUT';
  position: Vec3;
}

export const POINTS_OF_INTEREST: PointOfInterest[] = [
  { id: 'garage', name: 'Garage', kind: 'GARAGE', position: [-11.3, 0.1, 33.2] },
  { id: 'shop', name: 'Corner Store', kind: 'SHOP', position: [32.7, 0.1, 11.2] },
  { id: 'dealership', name: 'Rush Motors', kind: 'DEALERSHIP', position: [26.7, 0.1, 29.2] },
  { id: 'police', name: 'Police Station', kind: 'POLICE', position: [18.7, 0.1, -38.8] },
  { id: 'hideout', name: 'Hideout', kind: 'HIDEOUT', position: [-41.3, 0.1, 53.2] },
  { id: 'meet_alex', name: 'Meet Alex', kind: 'MISSION', position: [-11.3, 0.1, 13.2] },
];

export const POI_BY_ID = new Map(POINTS_OF_INTEREST.map((poi) => [poi.id, poi]));
