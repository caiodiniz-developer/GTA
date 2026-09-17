import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MODEL_SPECS, MODEL_URLS } from '../../config/models';
import { CITY_OFFSET } from '../../config/world';
import {
  extractBoxColliders,
  normaliseModel,
  prepareForRender,
  type BoxColliderData,
} from '../../utils/modelUtils';
import { CITY_BOUNDS, GROUND_Y } from '../../utils/cityGrid';

/**
 * The city is a single static GLB. Rather than wrapping it in one enormous box
 * (which would make the streets unusable) or a 93k-triangle trimesh (slow to
 * build and heavy to query), we derive one simplified cuboid collider per
 * building-sized mesh and let a single ground plane carry the roads.
 */
export function City(): React.JSX.Element {
  const gltf = useGLTF(MODEL_URLS.city);

  const { scene, colliders } = useMemo(() => {
    const normalised = normaliseModel(gltf, MODEL_SPECS.city);
    prepareForRender(normalised.scene, false);

    // Buildings receive but do not cast into themselves; casting from 111
    // meshes at this scale costs more than it adds.
    normalised.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
    });

    normalised.scene.position.set(...(CITY_OFFSET as unknown as [number, number, number]));
    normalised.scene.updateWorldMatrix(true, true);

    const boxes = extractBoxColliders(normalised.scene, { minHeight: 1.2, maxBoxes: 260 });
    return { scene: normalised.scene, colliders: boxes as BoxColliderData[] };
  }, [gltf]);

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
        {/* Streets and pavements: one flat slab under the whole map. */}
        <CuboidCollider
          args={[groundWidth / 2, 0.5, groundDepth / 2]}
          position={[groundCentreX, GROUND_Y - 0.5, groundCentreZ]}
        />
        {colliders.map((box, index) => (
          <CuboidCollider
            key={index}
            args={box.halfExtents}
            position={box.position}
          />
        ))}
      </RigidBody>
    </>
  );
}

useGLTF.preload(MODEL_URLS.city);
