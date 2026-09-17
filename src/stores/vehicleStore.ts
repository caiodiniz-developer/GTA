import { create } from 'zustand';
import type { VehicleKind } from '../config/vehicles';

export interface VehicleInstance {
  id: string;
  kind: VehicleKind;
  position: readonly [number, number, number];
  rotation: number;
  /** Owned vehicles respawn at the garage; street cars do not. */
  owned: boolean;
}

interface VehicleStore {
  vehicles: VehicleInstance[];
  /** Id of the vehicle the player is driving, or null when on foot. */
  activeVehicleId: string | null;
  /** Vehicle the player could enter right now. */
  nearbyVehicleId: string | null;
  unlockedKinds: VehicleKind[];

  registerVehicles: (vehicles: VehicleInstance[]) => void;
  setActiveVehicle: (id: string | null) => void;
  setNearbyVehicle: (id: string | null) => void;
  unlockKind: (kind: VehicleKind) => void;
  hydrate: (values: Partial<Pick<VehicleStore, 'unlockedKinds'>>) => void;
}

export const useVehicleStore = create<VehicleStore>((set) => ({
  vehicles: [],
  activeVehicleId: null,
  nearbyVehicleId: null,
  unlockedKinds: ['COMMON'],

  registerVehicles: (vehicles) => set({ vehicles }),
  setActiveVehicle: (activeVehicleId) =>
    set((prev) => (prev.activeVehicleId === activeVehicleId ? prev : { activeVehicleId })),
  setNearbyVehicle: (nearbyVehicleId) =>
    set((prev) => (prev.nearbyVehicleId === nearbyVehicleId ? prev : { nearbyVehicleId })),
  unlockKind: (kind) =>
    set((prev) =>
      prev.unlockedKinds.includes(kind)
        ? prev
        : { unlockedKinds: [...prev.unlockedKinds, kind] },
    ),
  hydrate: (values) => set(values),
}));
