import { create } from 'zustand';

export type GameState =
  | 'MAIN_MENU'
  | 'LOADING'
  | 'PLAYING'
  | 'PAUSED'
  | 'CUTSCENE'
  | 'GAME_OVER'
  | 'MISSION_COMPLETE';

export type TimeOfDay = 'DAY' | 'SUNSET' | 'NIGHT' | 'SUNRISE';

interface GameStore {
  state: GameState;
  loadProgress: number;
  assetsReady: boolean;
  /** 0..24 in-game hours. */
  clock: number;
  timeOfDay: TimeOfDay;

  setState: (state: GameState) => void;
  setLoadProgress: (progress: number) => void;
  setAssetsReady: (ready: boolean) => void;
  setClock: (clock: number) => void;
}

function resolveTimeOfDay(clock: number): TimeOfDay {
  if (clock >= 6 && clock < 8) return 'SUNRISE';
  if (clock >= 8 && clock < 18) return 'DAY';
  if (clock >= 18 && clock < 20.5) return 'SUNSET';
  return 'NIGHT';
}

export const useGameStore = create<GameStore>((set) => ({
  state: 'MAIN_MENU',
  loadProgress: 0,
  assetsReady: false,
  clock: 10,
  timeOfDay: 'DAY',

  setState: (state) => set({ state }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setAssetsReady: (assetsReady) => set({ assetsReady }),
  setClock: (clock) => set({ clock, timeOfDay: resolveTimeOfDay(clock) }),
}));

export const isGameplayActive = (state: GameState): boolean =>
  state === 'PLAYING' || state === 'CUTSCENE';
