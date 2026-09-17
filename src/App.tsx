import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { World } from './game/world/World';
import { HUD } from './ui/HUD/HUD';
import { LoadingScreen } from './ui/LoadingScreen';
import { useInput } from './hooks/useInput';
import { ModelGallery } from './game/debug/ModelGallery';
import { useGameStore } from './stores/gameStore';
import { QUALITY_PRESETS, useSettingsStore } from './stores/settingsStore';

export default function App(): React.JSX.Element {
  useInput();

  // Dev asset inspector: ?debug=models lays every GLB out on a metre grid.
  const debugMode =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug");

  const gameState = useGameStore((state) => state.state);
  const setState = useGameStore((state) => state.setState);
  const graphics = useSettingsStore((state) => state.graphics);
  const preset = QUALITY_PRESETS[graphics];

  // Phase 1 boots straight into loading; the main menu arrives in a later pass.
  useEffect(() => {
    if (gameState === 'MAIN_MENU') setState('LOADING');
  }, [gameState, setState]);

  if (debugMode === "models") return <ModelGallery />;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      <Canvas
        shadows={preset.shadows}
        dpr={preset.dpr}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 62, near: 0.25, far: 900, position: [0, 6, 12] }}
      >
        <Suspense fallback={null}>
          <World />
        </Suspense>
      </Canvas>

      <HUD />
      {gameState === 'LOADING' && <LoadingScreen />}
    </div>
  );
}
