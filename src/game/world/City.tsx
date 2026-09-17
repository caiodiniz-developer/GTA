import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MODEL_SPECS, MODEL_URLS } from '../../config/models';
import { CITY_OFFSET } from '../../config/world';
import { normaliseModel, prepareForRender } from '../../utils/modelUtils';
import { CITY_BOUNDS, GROUND_Y, buildCollisionBoxes } from '../../utils/cityGrid';

/** Depth of the road slab; generous so nothing can tunnel through it. */
const GROUND_THICKNESS = 16;

/** How tall the wall boxes are. Comfortably above anything that can jump. */
const WALL_HEIGHT = 40;

/**
 * The city: one static GLB for the visuals, with collision derived from the
 * baked street grid rather than from the mesh hierarchy.
 *
 * Per-mesh bounding boxes are not usable on this model - several meshes are
 * entire blocks tens of metres across, so their boxes swallow the roads beside
 * them and vehicles climb invisible kerbs. The grid records which 2 m cells are
 * actually drivable, so the blocked cells become the walls and the streets stay
 * clear.
 */
export function City(): React.JSX.Element {
  const gltf = useGLTF(MODEL_URLS.city);

  const scene = useMemo(() => {
    const normalised = normaliseModel(gltf, MODEL_SPECS.city);
    prepareForRender(normalised.scene, false);

    // Buildings receive shadows but do not cast them; casting from 111 meshes
    // at this scale costs more than it adds.
    normalised.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
    });

    normalised.scene.position.set(...(CITY_OFFSET as unknown as [number, number, number]));
    normalised.scene.updateWorldMatrix(true, true);
    return normalised.scene;
  }, [gltf]);

  const walls = useMemo(() => {
    const boxes = buildCollisionBoxes(WALL_HEIGHT);
    if (import.meta.env.DEV) {
      console.info(`[City] ${boxes.length} wall colliders from the street grid`);
    }
    return boxes;
  }, []);

  useEffect(() => {
    return () => {
      // The GLTF itself is cached by drei; only our clone is disposed.
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose?.();
      });
    };
  }, [scene]);

  const groundWidth = CITY_BOUNDS.maxX - CITY_BOUNDS.minX + 80;
  const groundDepth = CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ + 80;
  const groundCentreX = (CITY_BOUNDS.minX + CITY_BOUNDS.maxX) / 2;
  const groundCentreZ = (CITY_BOUNDS.minZ + CITY_BOUNDS.maxZ) / 2;

  return (
    <>
      <primitive object={scene} />

      <RigidBody type="fixed" colliders={false} friction={1}>
        {/*
          Streets and pavements: one deep slab under the whole map. It is far
          thicker than it needs to be so a fast car can never tunnel through it
          on a long physics step.
        */}
        <CuboidCollider
          args={[groundWidth / 2, GROUND_THICKNESS / 2, groundDepth / 2]}
          position={[groundCentreX, GROUND_Y - GROUND_THICKNESS / 2, groundCentreZ]}
        />
        {walls.map((box, index) => (
          <CuboidCollider key={index} args={box.halfExtents} position={box.position} />
        ))}
      </RigidBody>
    </>
  );
}

useGLTF.preload(MODEL_URLS.city);
