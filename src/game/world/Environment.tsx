import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useGameStore } from '../../stores/gameStore';
import { SECONDS_PER_GAME_HOUR } from '../../config/world';

/** Colour grading and light rigs for each part of the day. */
const MOODS = {
  DAY: {
    sun: new THREE.Color('#fff4e2'),
    sunIntensity: 2.6,
    ambient: new THREE.Color('#9fb4d0'),
    ambientIntensity: 0.85,
    fog: new THREE.Color('#aebccc'),
    fogDensity: 0.0042,
  },
  SUNSET: {
    sun: new THREE.Color('#ff9d52'),
    sunIntensity: 1.9,
    ambient: new THREE.Color('#7e7196'),
    ambientIntensity: 0.7,
    fog: new THREE.Color('#c08a6d'),
    fogDensity: 0.0068,
  },
  NIGHT: {
    sun: new THREE.Color('#5c74a8'),
    sunIntensity: 0.32,
    ambient: new THREE.Color('#2a3350'),
    ambientIntensity: 0.42,
    fog: new THREE.Color('#0d1019'),
    fogDensity: 0.011,
  },
  SUNRISE: {
    sun: new THREE.Color('#ffc08a'),
    sunIntensity: 1.6,
    ambient: new THREE.Color('#6f7a9c'),
    ambientIntensity: 0.65,
    fog: new THREE.Color('#9d9ab0'),
    fogDensity: 0.0075,
  },
} as const;

const currentSun = new THREE.Color();
const currentAmbient = new THREE.Color();
const currentFog = new THREE.Color();
let currentSunIntensity = MOODS.DAY.sunIntensity;
let currentAmbientIntensity = MOODS.DAY.ambientIntensity;
let currentFogDensity = MOODS.DAY.fogDensity;

/**
 * Day/night cycle. The sun orbits on the game clock and every light, the fog
 * and the sky dome blend towards the mood for the current time of day.
 */
export function Environment(): React.JSX.Element {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();

  const clock = useGameStore((state) => state.clock);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const setClock = useGameStore((state) => state.setClock);
  const gameState = useGameStore((state) => state.state);

  const sunPosition = useRef(new THREE.Vector3(60, 90, 40));

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);

    if (gameState === 'PLAYING') {
      const next = (clock + dt / SECONDS_PER_GAME_HOUR) % 24;
      // Only push to the store on a meaningful change; this drives UI.
      if (Math.abs(next - clock) > 0.004) setClock(next);
    }

    // Sun elevation: noon overhead, midnight below the horizon.
    const angle = ((clock - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const radius = 120;
    sunPosition.current.set(
      Math.cos(angle) * radius,
      Math.max(elevation * radius, -30),
      radius * 0.45,
    );

    const mood = MOODS[timeOfDay];
    const blend = 1 - Math.pow(0.001, dt);
    currentSun.lerp(mood.sun, blend);
    currentAmbient.lerp(mood.ambient, blend);
    currentFog.lerp(mood.fog, blend);
    currentSunIntensity += (mood.sunIntensity - currentSunIntensity) * blend;
    currentAmbientIntensity += (mood.ambientIntensity - currentAmbientIntensity) * blend;
    currentFogDensity += (mood.fogDensity - currentFogDensity) * blend;

    const sun = sunRef.current;
    if (sun) {
      sun.position.copy(sunPosition.current);
      sun.color.copy(currentSun);
      sun.intensity = currentSunIntensity;
    }
    const ambient = ambientRef.current;
    if (ambient) {
      ambient.color.copy(currentAmbient);
      ambient.intensity = currentAmbientIntensity;
    }

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(currentFog);
      scene.fog.density = currentFogDensity;
    } else {
      scene.fog = new THREE.FogExp2(currentFog.getHex(), currentFogDensity);
    }
    scene.background = currentFog;
  });

  // Sky dome parameters shift with the sun so nights actually read as dark.
  const skyElevation = Math.sin(((clock - 6) / 24) * Math.PI * 2);

  return (
    <>
      <Sky
        distance={4000}
        sunPosition={[
          Math.cos(((clock - 6) / 24) * Math.PI * 2),
          Math.max(skyElevation, -0.2),
          0.45,
        ]}
        turbidity={timeOfDay === 'NIGHT' ? 0.2 : 6}
        rayleigh={timeOfDay === 'NIGHT' ? 0.1 : 1.6}
        mieCoefficient={0.006}
        mieDirectionalG={0.85}
      />

      <hemisphereLight ref={ambientRef} args={['#9fb4d0', '#1b1d22', 0.85]} />

      <directionalLight
        ref={sunRef}
        castShadow
        position={[60, 90, 40]}
        intensity={2.6}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
    </>
  );
}
