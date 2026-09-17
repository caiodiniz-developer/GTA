import { Suspense } from 'react';
import { Physics } from '@react-three/rapier';
import { AdaptiveDpr, AdaptiveEvents, Preload } from '@react-three/drei';
import { GRAVITY, PHYSICS_STEP } from '../../config/world';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { City } from './City';
import { Environment } from './Environment';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { VehicleManager } from '../vehicles/VehicleManager';
import { InteractionSystem } from '../interaction/InteractionSystem';

/**
 * Scene root. Everything physical lives under a single <Physics> world; the
 * simulation is paused whenever the game is not being played so a paused menu
 * does not keep integrating.
 */
export function World(): React.JSX.Element {
  const gameState = useGameStore((state) => state.state);
  const graphics = useSettingsStore((state) => state.graphics);

  const simulating = gameState === 'PLAYING' || gameState === 'CUTSCENE';

  return (
    <>
      <Environment />

      <Physics
        gravity={GRAVITY as unknown as [number, number, number]}
        paused={!simulating}
        timeStep={PHYSICS_STEP}
        debug={false}
      >
        <Suspense fallback={null}>
          <City />
          <Player />
          <VehicleManager />
        </Suspense>
        <InteractionSystem />
        <ThirdPersonCamera />
      </Physics>

      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />
      {graphics !== 'LOW' && <Preload all />}
    </>
  );
}
