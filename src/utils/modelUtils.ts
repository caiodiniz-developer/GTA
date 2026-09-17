import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';

export interface ModelSpec {
  url: string;
  /** Rotation applied before measuring, for models authored in another up-axis. */
  preRotation?: [number, number, number];
  /** Desired real-world size in metres along `measureAxis`. */
  targetSize?: number;
  measureAxis?: 'x' | 'y' | 'z' | 'max';
  /** Explicit scale, used when a model is already metric (the city). */
  uniformScale?: number;
  /** Where the pivot ends up: feet on the floor, or the bounding-box centre. */
  align?: 'bottom' | 'centre';
  /** Also centre the model horizontally on its pivot. */
  recentreXZ?: boolean;
  /** Nodes matching this are deleted (Sketchfab backdrops, fake shadow quads). */
  stripNodes?: RegExp;
}

export interface NormalisedModel {
  /** Root to add to the scene; children are already scaled and aligned. */
  scene: THREE.Group;
  /** Bounding box after normalisation, in the root's local space. */
  size: THREE.Vector3;
  centre: THREE.Vector3;
  animations: THREE.AnimationClip[];
}

const tmpBox = new THREE.Box3();

function stripMatching(root: THREE.Object3D, pattern: RegExp): void {
  const doomed: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (pattern.test(child.name)) doomed.push(child);
  });
  for (const node of doomed) node.parent?.remove(node);
}

/**
 * Some exports include a huge flat quad used as a studio backdrop. It wrecks
 * bounding-box maths and shows up as a grey sheet under the model, so drop any
 * paper-thin mesh that is far larger than the rest of the model.
 */
function stripBackdropPlanes(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  if (meshes.length < 2) return;

  const spans = meshes.map((mesh) => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    const scale = mesh.getWorldScale(new THREE.Vector3());
    return new THREE.Vector3(
      size.x * Math.abs(scale.x),
      size.y * Math.abs(scale.y),
      size.z * Math.abs(scale.z),
    );
  });

  const median = [...spans].map((s) => Math.max(s.x, s.y, s.z)).sort((a, b) => a - b)[
    Math.floor(spans.length / 2)
  ];

  for (let i = 0; i < meshes.length; i++) {
    const span = spans[i];
    const footprint = Math.max(span.x, span.z);
    const isPaperThin = span.y < footprint * 0.01;
    if (isPaperThin && footprint > median * 4) meshes[i].parent?.remove(meshes[i]);
  }
}

export function normaliseModel(gltf: GLTF, spec: ModelSpec): NormalisedModel {
  // Clone through SkeletonUtils so skinned meshes keep working bones.
  const source = SkeletonUtils.clone(gltf.scene) as THREE.Group;

  if (spec.stripNodes) stripMatching(source, spec.stripNodes);
  stripBackdropPlanes(source);

  const inner = new THREE.Group();
  inner.add(source);
  if (spec.preRotation) inner.rotation.set(...spec.preRotation);
  inner.updateWorldMatrix(true, true);

  const root = new THREE.Group();
  root.add(inner);

  // Measure with the pre-rotation applied but before scaling.
  tmpBox.setFromObject(inner);
  const rawSize = tmpBox.getSize(new THREE.Vector3());

  let scale = spec.uniformScale ?? 1;
  if (spec.targetSize !== undefined) {
    const axis = spec.measureAxis ?? 'max';
    const measured =
      axis === 'max' ? Math.max(rawSize.x, rawSize.y, rawSize.z) : rawSize[axis];
    if (measured > 1e-6) scale = spec.targetSize / measured;
  }
  inner.scale.setScalar(scale);
  inner.updateWorldMatrix(true, true);

  // Re-measure at final scale, then move the pivot where gameplay expects it.
  tmpBox.setFromObject(inner);
  const size = tmpBox.getSize(new THREE.Vector3());
  const centre = tmpBox.getCenter(new THREE.Vector3());

  if (spec.align === 'bottom') {
    inner.position.y -= tmpBox.min.y;
    if (spec.recentreXZ !== false) {
      inner.position.x -= centre.x;
      inner.position.z -= centre.z;
    }
  } else if (spec.align === 'centre') {
    inner.position.sub(centre);
  } else if (spec.recentreXZ) {
    inner.position.x -= centre.x;
    inner.position.z -= centre.z;
  }

  inner.updateWorldMatrix(true, true);
  tmpBox.setFromObject(inner);

  return {
    scene: root,
    size,
    centre: tmpBox.getCenter(new THREE.Vector3()),
    animations: gltf.animations ?? [],
  };
}

/** Shadows + colour-space fixes applied once per loaded model. */
export function prepareForRender(root: THREE.Object3D, castShadow = true): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
  });
}

export interface BoxColliderData {
  position: [number, number, number];
  halfExtents: [number, number, number];
}

/**
 * Builds one simplified box collider per mesh instead of a single city-sized
 * box or a 93k-triangle trimesh. Flat geometry (roads, pavements, grass) is
 * skipped because the ground plane already covers it.
 */
export function extractBoxColliders(
  root: THREE.Object3D,
  options: {
    minHeight?: number;
    maxBoxes?: number;
    skipBelowY?: number;
    /** Final say on each candidate box; used to reject boxes over open road. */
    accept?: (box: BoxColliderData) => boolean;
  } = {},
): BoxColliderData[] {
  const { minHeight = 0.6, maxBoxes = 400, skipBelowY = -Infinity, accept } = options;
  const colliders: BoxColliderData[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    box.getSize(size);
    box.getCenter(centre);
    // A road or pavement mesh that merely dips would otherwise become a solid
    // box filling the space *above* the road, which vehicles then rest on.
    // Only genuinely tall geometry that rises clear of the street becomes a
    // collider; the ground slab already carries everything at street level.
    if (size.y < minHeight) return;
    if (box.max.y < skipBelowY) return;
    if (size.x < 0.1 || size.z < 0.1) return;
    const candidate: BoxColliderData = {
      position: [centre.x, centre.y, centre.z],
      halfExtents: [size.x / 2, size.y / 2, size.z / 2],
    };
    if (accept && !accept(candidate)) return;
    colliders.push(candidate);
  });

  // Largest volumes first so a truncated list still blocks the big facades.
  colliders.sort(
    (a, b) =>
      b.halfExtents[0] * b.halfExtents[1] * b.halfExtents[2] -
      a.halfExtents[0] * a.halfExtents[1] * a.halfExtents[2],
  );
  return colliders.slice(0, maxBoxes);
}
