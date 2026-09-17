import { create } from 'zustand';

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SettingsState {
  graphics: GraphicsQuality;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  /** Multiplier applied to the camera boom length. */
  cameraDistance: number;
  showTutorial: boolean;

  setGraphics: (quality: GraphicsQuality) => void;
  setMasterVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  setMouseSensitivity: (value: number) => void;
  setCameraDistance: (value: number) => void;
  setShowTutorial: (value: boolean) => void;
  hydrate: (values: Partial<SettingsState>) => void;
}

/** Render settings derived from the quality preset. */
export const QUALITY_PRESETS = {
  LOW: { shadows: false, dpr: [0.7, 1] as [number, number], npcBudget: 6, trafficBudget: 5 },
  MEDIUM: { shadows: true, dpr: [0.85, 1.4] as [number, number], npcBudget: 12, trafficBudget: 9 },
  HIGH: { shadows: true, dpr: [1, 2] as [number, number], npcBudget: 18, trafficBudget: 14 },
} as const;

/**
 * Allows ?graphics=LOW in the URL to force a preset before the canvas is
 * created. Handy on weak machines, and it is the only way to pick a preset
 * that affects Canvas-level options like shadows, which are read once.
 */
function initialGraphics(): GraphicsQuality {
  if (typeof window === 'undefined') return 'MEDIUM';
  const requested = new URLSearchParams(window.location.search).get('graphics');
  const upper = requested?.toUpperCase();
  return upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH' ? upper : 'MEDIUM';
}

export const useSettingsStore = create<SettingsState>((set) => ({
  graphics: initialGraphics(),
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  mouseSensitivity: 1,
  cameraDistance: 1,
  showTutorial: true,

  setGraphics: (graphics) => set({ graphics }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setMusicVolume: (musicVolume) => set({ musicVolume }),
  setSfxVolume: (sfxVolume) => set({ sfxVolume }),
  setMouseSensitivity: (mouseSensitivity) => set({ mouseSensitivity }),
  setCameraDistance: (cameraDistance) => set({ cameraDistance }),
  setShowTutorial: (showTutorial) => set({ showTutorial }),
  hydrate: (values) => set(values),
}));
