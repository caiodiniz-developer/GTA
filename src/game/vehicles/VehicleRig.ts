import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import type { VehicleDefinition, WheelAnchor } from '../../config/vehicles';
import { normaliseModel, prepareForRender } from '../../utils/modelUtils';

export interface VehicleRig {
  /** Root to add to the scene; the chassis mesh hangs off it. */
  root: THREE.Group;
  /** One pivot per corner, already positioned; spin and steer these. */
  wheelPivots: THREE.Group[];
  wheels: WheelAnchor[];
  headlights: THREE.SpotLight[];
  brakeLights: THREE.Mesh[];
  dispose: () => void;
}

const WHEEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#16181c',
  roughness: 0.85,
  metalness: 0.1,
});
const BRAKE_MATERIAL_OFF = { color: 0x330505, emissive: 0x220000 };

/**
 * Turns a vehicle GLB into something drivable.
 *
 * The wheels have to spin and steer independently of the body, but the models
 * store them as ordinary children of the chassis (and the sports car splits
 * each corner across four nodes: tyre, rim, disc and caliper). So we find the
 * wheel nodes, cluster them into four corners by quadrant, and re-parent each
 * cluster under its own pivot placed at the wheel centre.
 */
export function buildVehicleRig(gltf: GLTF, definition: VehicleDefinition): VehicleRig {
  const normalised = normaliseModel(gltf, {
    url: definition.url,
    align: 'bottom',
    recentreXZ: true,
    stripNodes: /shadow/i,
  });
  const root = normalised.scene;
  prepareForRender(root, true);
  root.updateWorldMatrix(true, true);

  const wheelPivots: THREE.Group[] = [];
  const wheels: WheelAnchor[] = [];

  const matched: THREE.Object3D[] = [];
  if (definition.wheelNodePattern) {
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && definition.wheelNodePattern!.test(child.name)) {
        matched.push(child);
      }
    });
  }

  if (matched.length >= 4) {
    // Cluster by quadrant: front/rear from local Z, left/right from local X.
    const corners = new Map<string, THREE.Object3D[]>();
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    for (const node of matched) {
      box.setFromObject(node);
      box.getCenter(centre);
      const key = `${centre.x >= 0 ? 'R' : 'L'}${centre.z >= 0 ? 'F' : 'B'}`;
      const list = corners.get(key);
      if (list) list.push(node);
      else corners.set(key, [node]);
    }

    for (const [key, nodes] of corners) {
      // Corner centre and radius come from the tyre if present, else the group.
      const group = new THREE.Box3();
      for (const node of nodes) group.union(box.setFromObject(node));
      const cornerCentre = group.getCenter(new THREE.Vector3());
      const size = group.getSize(new THREE.Vector3());
      const radius = Math.max(size.y, size.z) / 2;

      const pivot = new THREE.Group();
      pivot.position.copy(cornerCentre);
      root.add(pivot);

      // Re-parent while preserving world placement, so the wheel keeps its
      // position but now rotates about the pivot instead of the body origin.
      for (const node of nodes) {
        node.updateWorldMatrix(true, false);
        const world = node.matrixWorld.clone();
        pivot.add(node);
        node.matrix.copy(pivot.matrixWorld.clone().invert().multiply(world));
        node.matrix.decompose(node.position, node.quaternion, node.scale);
      }

      wheelPivots.push(pivot);
      wheels.push({
        position: [cornerCentre.x, cornerCentre.y, cornerCentre.z],
        radius,
        steered: key.endsWith('F'),
        powered: true,
      });
    }
  } else {
    // No wheel geometry in the model: build simple low-poly wheels.
    const anchors = definition.fallbackWheels ?? [];
    const geometry = new THREE.CylinderGeometry(1, 1, 0.34, 18);
    geometry.rotateZ(Math.PI / 2);
    for (const anchor of anchors) {
      const pivot = new THREE.Group();
      pivot.position.set(...anchor.position);
      const mesh = new THREE.Mesh(geometry, WHEEL_MATERIAL);
      mesh.scale.setScalar(anchor.radius);
      mesh.scale.x = 1;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      root.add(pivot);
      wheelPivots.push(pivot);
      wheels.push({ ...anchor });
    }
  }

  // Sort front-to-back, left-to-right so wheel indices are predictable.
  const order = wheels
    .map((wheel, index) => ({ wheel, pivot: wheelPivots[index] }))
    .sort((a, b) => b.wheel.position[2] - a.wheel.position[2] || a.wheel.position[0] - b.wheel.position[0]);
  wheels.length = 0;
  wheelPivots.length = 0;
  for (const entry of order) {
    wheels.push(entry.wheel);
    wheelPivots.push(entry.pivot);
  }
  // Only the front pair steers.
  for (let i = 0; i < wheels.length; i++) wheels[i].steered = i < 2;

  // Mirror the track width. The modelled wheels are a centimetre or two off
  // centre, which is invisible but makes the car pull steadily to one side
  // over a long straight.
  if (wheels.length === 4) {
    const halfTrack =
      wheels.reduce((total, wheel) => total + Math.abs(wheel.position[0]), 0) / wheels.length;
    for (const wheel of wheels) {
      const side = wheel.position[0] >= 0 ? 1 : -1;
      wheel.position = [side * halfTrack, wheel.position[1], wheel.position[2]];
    }
  }

  // Headlights: cheap spot lights that are switched on at night.
  const headlights: THREE.SpotLight[] = [];
  for (const position of definition.headlights) {
    const light = new THREE.SpotLight('#fff2d0', 0, 34, Math.PI / 6, 0.55, 1.4);
    light.position.set(...position);
    light.target.position.set(position[0], position[1] - 0.45, position[2] + 12);
    light.castShadow = false;
    root.add(light);
    root.add(light.target);
    headlights.push(light);
  }

  // Brake lights: small emissive quads driven by the brake input.
  const brakeLights: THREE.Mesh[] = [];
  const brakeGeometry = new THREE.BoxGeometry(0.22, 0.1, 0.06);
  for (const position of definition.taillights) {
    const material = new THREE.MeshStandardMaterial({
      ...BRAKE_MATERIAL_OFF,
      emissiveIntensity: 1,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(brakeGeometry, material);
    mesh.position.set(...position);
    root.add(mesh);
    brakeLights.push(mesh);
  }

  return {
    root,
    wheelPivots,
    wheels,
    headlights,
    brakeLights,
    dispose: () => {
      brakeGeometry.dispose();
      for (const light of brakeLights) (light.material as THREE.Material).dispose();
    },
  };
}
