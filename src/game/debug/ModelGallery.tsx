import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, Text, useGLTF } from '@react-three/drei';
import { MODEL_SPECS, MODEL_URLS, type ModelKey } from '../../config/models';
import { normaliseModel, prepareForRender } from '../../utils/modelUtils';

/**
 * Dev-only asset gallery, reachable at ?debug=models.
 *
 * Every GLB in this project arrives at a different scale, orientation and
 * pivot, so this lays them all out on a metre grid next to a 1.8 m reference
 * figure. It is the fastest way to catch a model that has been mis-scaled,
 * rotated onto its side, or had a mesh wrongly stripped.
 */

const LAYOUT: { key: ModelKey; label: string }[] = [
  { key: 'player', label: 'player' },
  { key: 'npcRigged', label: 'npc rigged' },
  { key: 'npcStatic', label: 'npc static' },
  { key: 'carCommon', label: 'car common' },
  { key: 'carSport', label: 'car sport' },
  { key: 'van', label: 'van' },
  { key: 'pistol', label: 'pistol' },
  { key: 'rifle', label: 'rifle' },
  { key: 'phone', label: 'phone' },
  { key: 'money', label: 'money' },
];

function GalleryItem({
  modelKey,
  label,
  position,
}: {
  modelKey: ModelKey;
  label: string;
  position: [number, number, number];
}): React.JSX.Element {
  const gltf = useGLTF(MODEL_URLS[modelKey]);

  const { scene, size, meshes, materials } = useMemo(() => {
    if (import.meta.env.DEV) {
      const raw = new THREE.Box3().setFromObject(gltf.scene.clone());
      const rawSize = raw.getSize(new THREE.Vector3());
      const rawCentre = raw.getCenter(new THREE.Vector3());
      console.info(`[SPEC] ${modelKey}: ${JSON.stringify(MODEL_SPECS[modelKey])}`);
      console.info(`[RAW] ${modelKey}: size ${rawSize.x.toFixed(2)} x ${rawSize.y.toFixed(2)} x ${rawSize.z.toFixed(2)} centre ${rawCentre.x.toFixed(2)},${rawCentre.y.toFixed(2)},${rawCentre.z.toFixed(2)}`);
    }
    const normalised = normaliseModel(gltf, MODEL_SPECS[modelKey]);
    prepareForRender(normalised.scene, true);
    let meshCount = 0;
    const materialNames = new Set<string>();
    normalised.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshCount++;
      const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      for (const entry of Array.isArray(material) ? material : [material]) {
        materialNames.add(entry?.map ? 'textured' : 'flat');
      }
    });
    return {
      scene: normalised.scene,
      size: normalised.size,
      meshes: meshCount,
      materials: [...materialNames].join('+'),
    };
  }, [gltf, modelKey]);

  const tall = Math.max(size.x, size.y, size.z) > 0.8;
  const pedestal = tall ? 0 : 1;
  const dimensions = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;

  return (
    <group position={position}>
      <group position={[0, pedestal, 0]} scale={tall ? 1 : 3}>
        <primitive object={scene} />
      </group>
      {!tall && (
        <mesh position={[0, pedestal / 2, 0]}>
          <cylinderGeometry args={[0.35, 0.35, pedestal, 16]} />
          <meshStandardMaterial color="#2b3039" />
        </mesh>
      )}
      {/* A 1 m post next to each item makes wrong scales obvious. */}
      <mesh position={[-1.2, 0.5, 0]}>
        <boxGeometry args={[0.05, 1, 0.05]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <Text position={[0, -0.35, 0]} fontSize={0.22} color="#ffffff" anchorX="center">
        {label}
      </Text>
      <Text position={[0, -0.65, 0]} fontSize={0.15} color="#9ca3af" anchorX="center">
        {dimensions}
      </Text>
      <Text position={[0, -0.9, 0]} fontSize={0.13} color="#6b7280" anchorX="center">
        {`${meshes} meshes / ${materials}`}
      </Text>
    </group>
  );
}

export function ModelGallery(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-neutral-900">
      <Canvas shadows camera={{ position: [0, 4, 14], fov: 50 }}>
        <color attach="background" args={['#1c1f26']} />
        <hemisphereLight args={['#cfd8e8', '#20242c', 1.1]} />
        <directionalLight position={[8, 14, 6]} intensity={2.2} castShadow />
        <Grid
          args={[60, 60]}
          cellSize={1}
          cellColor="#2f3540"
          sectionSize={5}
          sectionColor="#3f4756"
          infiniteGrid
          fadeDistance={60}
        />
        <Suspense fallback={null}>
          {LAYOUT.map((item, index) => (
            <GalleryItem
              key={item.key}
              modelKey={item.key}
              label={item.label}
              position={[(index % 5) * 5 - 10, 0, Math.floor(index / 5) * 6 - 3]}
            />
          ))}
        </Suspense>
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  );
}
