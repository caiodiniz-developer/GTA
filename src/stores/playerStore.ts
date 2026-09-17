import { create } from 'zustand';

export type PlayerMotionState =
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'JUMP'
  | 'FALL'
  | 'AIM'
  | 'SHOOT'
  | 'ENTERING_VEHICLE'
  | 'DRIVING'
  | 'EXITING_VEHICLE'
  | 'DEAD';

interface PlayerStore {
  motionState: PlayerMotionState;
  health: number;
  maxHealth: number;
  money: number;
  grounded: boolean;

  setMotionState: (state: PlayerMotionState) => void;
  setGrounded: (grounded: boolean) => void;
  damage: (amount: number) => void;
  heal: (amount: number) => void;
  addMoney: (amount: number) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  motionState: 'IDLE',
  health: 100,
  maxHealth: 100,
  money: 500,
  grounded: true,

  setMotionState: (motionState) =>
    set((prev) => (prev.motionState === motionState ? prev : { motionState })),
  setGrounded: (grounded) =>
    set((prev) => (prev.grounded === grounded ? prev : { grounded })),
  damage: (amount) => set((prev) => ({ health: Math.max(0, prev.health - amount) })),
  heal: (amount) =>
    set((prev) => ({ health: Math.min(prev.maxHealth, prev.health + amount) })),
  addMoney: (amount) => set((prev) => ({ money: Math.max(0, prev.money + amount) })),
  reset: () => set({ motionState: 'IDLE', health: 100, grounded: true }),
}));
