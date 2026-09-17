import * as THREE from 'three';

/**
 * Procedural character animation.
 *
 * None of the character GLBs in this project ship with animation clips, but
 * personagem-principal carries a full Mixamo skeleton and personagem-secundario
 * a standard humanoid one. So instead of faking movement by sliding a T-posed
 * mesh around, we drive the bones directly: an A-pose correction lifts the
 * model out of its T-pose, and a sine-driven gait layers walk/run/idle on top.
 *
 * Rotations are authored in *model space* (X = right, Y = up, Z = forward) and
 * converted into each bone's parent space once at bind time, so the same rig
 * description works for both skeletons regardless of their bone axes.
 */

export type GaitName = 'IDLE' | 'WALK' | 'RUN' | 'JUMP' | 'FALL' | 'AIM' | 'SIT';

/** Canonical bone slots we care about, mapped from whatever the rig calls them. */
export interface BoneSlots {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  chest?: THREE.Bone;
  head?: THREE.Bone;
  leftUpLeg?: THREE.Bone;
  leftLeg?: THREE.Bone;
  leftFoot?: THREE.Bone;
  rightUpLeg?: THREE.Bone;
  rightLeg?: THREE.Bone;
  rightFoot?: THREE.Bone;
  leftShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  rightShoulder?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
}

type SlotName = keyof BoneSlots;

/** Matchers run against the bone name with rig prefixes and suffixes stripped. */
const SLOT_PATTERNS: [SlotName, RegExp][] = [
  ['hips', /^(hips|pelvis|bip01pelvis)$/],
  ['spine', /^(spine|spine1|spine01)$/],
  ['chest', /^(spine2|spine3|chest|upperchest)$/],
  ['head', /^head$/],
  ['leftUpLeg', /^(leftupleg|left_hip|l_thigh|thigh_l|upleg_l)$/],
  ['leftLeg', /^(leftleg|left_knee|l_calf|calf_l|leg_l)$/],
  ['leftFoot', /^(leftfoot|left_ankle|l_foot|foot_l)$/],
  ['rightUpLeg', /^(rightupleg|right_hip|r_thigh|thigh_r|upleg_r)$/],
  ['rightLeg', /^(rightleg|right_knee|r_calf|calf_r|leg_r)$/],
  ['rightFoot', /^(rightfoot|right_ankle|r_foot|foot_r)$/],
  ['leftShoulder', /^(leftshoulder|left_collar|l_clavicle)$/],
  ['leftArm', /^(leftarm|left_shoulder|l_upperarm|upperarm_l)$/],
  ['leftForeArm', /^(leftforearm|left_elbow|l_forearm|lowerarm_l)$/],
  ['rightShoulder', /^(rightshoulder|right_collar|r_clavicle)$/],
  ['rightArm', /^(rightarm|right_shoulder|r_upperarm|upperarm_r)$/],
  ['rightForeArm', /^(rightforearm|right_elbow|r_forearm|lowerarm_r)$/],
];

/** `mixamorig:LeftUpLeg_191` -> `leftupleg`, `left_knee_03` -> `left_knee`. */
function canonicalBoneName(raw: string): string {
  return raw
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/^bip\d*[_ ]?/i, '')
    .replace(/[._]\d+$/, '')
    .replace(/_end$/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function findBones(root: THREE.Object3D): BoneSlots {
  const slots: BoneSlots = {};
  root.traverse((child) => {
    const bone = child as THREE.Bone;
    if (!bone.isBone) return;
    const name = canonicalBoneName(bone.name);
    for (const [slot, pattern] of SLOT_PATTERNS) {
      if (slots[slot] === undefined && pattern.test(name)) {
        slots[slot] = bone;
        return;
      }
    }
  });
  return slots;
}

interface BoundBone {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** Converts a model-space axis into this bone's parent space. */
  toParent: THREE.Quaternion;
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const tmpAxis = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpParentQuat = new THREE.Quaternion();
const tmpModelQuat = new THREE.Quaternion();

/**
 * Drives one character's skeleton. Create once per character instance; call
 * `update` every frame with the gait and ground speed.
 */
export class CharacterAnimator {
  private bound = new Map<SlotName, BoundBone>();
  private phase = 0;
  private blend: Record<'idle' | 'walk' | 'run', number> = { idle: 1, walk: 0, run: 0 };
  private lean = 0;
  private readonly hipsRestY: number;
  private readonly hips?: THREE.Bone;
  /** Randomised so a crowd does not breathe and step in unison. */
  private readonly offset = Math.random() * Math.PI * 2;

  readonly hasSkeleton: boolean;
  /** Slots that resolved to a real bone, for diagnostics. */
  readonly boundSlots: string[] = [];

  constructor(root: THREE.Object3D, slots: BoneSlots = findBones(root)) {
    root.updateWorldMatrix(true, true);
    root.getWorldQuaternion(tmpModelQuat);
    const modelQuat = tmpModelQuat.clone();

    for (const [slot, bone] of Object.entries(slots) as [SlotName, THREE.Bone][]) {
      if (!bone) continue;
      const parent = bone.parent;
      if (!parent) continue;
      parent.getWorldQuaternion(tmpParentQuat);
      // parent^-1 * model : maps a model-space axis into the bone's parent space
      const toParent = tmpParentQuat.clone().invert().multiply(modelQuat);
      this.bound.set(slot, {
        bone,
        rest: bone.quaternion.clone(),
        toParent,
      });
    }

    this.hips = slots.hips;
    this.hipsRestY = slots.hips?.position.y ?? 0;
    this.boundSlots = [...this.bound.keys()];
    this.hasSkeleton = this.bound.size >= 6;
  }

  /** Rotates a bone by `angle` about a model-space axis, on top of its rest pose. */
  private rotate(slot: SlotName, axis: THREE.Vector3, angle: number, additive = false): void {
    const entry = this.bound.get(slot);
    if (!entry || angle === 0) {
      if (entry && !additive) entry.bone.quaternion.copy(entry.rest);
      return;
    }
    tmpAxis.copy(axis).applyQuaternion(entry.toParent).normalize();
    tmpQuat.setFromAxisAngle(tmpAxis, angle);
    if (additive) {
      entry.bone.quaternion.premultiply(tmpQuat);
    } else {
      entry.bone.quaternion.copy(tmpQuat).multiply(entry.rest);
    }
  }

  private reset(slot: SlotName): void {
    const entry = this.bound.get(slot);
    if (entry) entry.bone.quaternion.copy(entry.rest);
  }

  /**
   * @param speed   Horizontal ground speed in m/s.
   * @param gait    Current motion state.
   * @param turn    Signed turn rate, used for a bit of body lean.
   */
  update(delta: number, speed: number, gait: GaitName, turn = 0): void {
    if (!this.hasSkeleton) return;

    const dt = Math.min(delta, 0.05);
    const running = gait === 'RUN';
    const moving = gait === 'WALK' || gait === 'RUN';

    // Stride frequency scales with speed so footfalls track the ground.
    const strideFrequency = moving ? THREE.MathUtils.clamp(speed * 0.95, 1.4, 9) : 2.2;
    this.phase += dt * strideFrequency;

    const targets = {
      idle: moving ? 0 : 1,
      walk: moving && !running ? 1 : 0,
      run: running ? 1 : 0,
    };
    const rate = 1 - Math.pow(0.0001, dt);
    this.blend.idle += (targets.idle - this.blend.idle) * rate;
    this.blend.walk += (targets.walk - this.blend.walk) * rate;
    this.blend.run += (targets.run - this.blend.run) * rate;
    this.lean += (THREE.MathUtils.clamp(turn, -1, 1) - this.lean) * rate;

    const airborne = gait === 'JUMP' || gait === 'FALL';
    if (gait === 'SIT') {
      this.applySeatedPose();
      return;
    }
    if (airborne) {
      this.applyAirbornePose(gait === 'JUMP');
      return;
    }

    const gaitAmount = this.blend.walk + this.blend.run;
    const swing = Math.sin(this.phase);
    const swingOpposite = Math.sin(this.phase + Math.PI);
    const bounce = Math.cos(this.phase * 2);

    // Amplitudes, radians.
    const legSwing = (0.42 * this.blend.walk + 0.82 * this.blend.run) * swing;
    const legSwingOpposite =
      (0.42 * this.blend.walk + 0.82 * this.blend.run) * swingOpposite;
    const kneeBend = 0.3 * this.blend.walk + 0.85 * this.blend.run;
    const armSwing = (0.38 * this.blend.walk + 0.72 * this.blend.run) * swingOpposite;
    const armSwingOpposite = (0.38 * this.blend.walk + 0.72 * this.blend.run) * swing;

    const idleBreath = Math.sin(this.phase * 0.5 + this.offset) * 0.035 * this.blend.idle;

    // Legs swing about model X (forward/back).
    this.rotate('leftUpLeg', AXIS_X, legSwing);
    this.rotate('rightUpLeg', AXIS_X, legSwingOpposite);
    // Knees only bend backwards, driven off the rear half of the stride.
    this.rotate('leftLeg', AXIS_X, -kneeBend * Math.max(0, -swing) - 0.05 * gaitAmount);
    this.rotate('rightLeg', AXIS_X, -kneeBend * Math.max(0, -swingOpposite) - 0.05 * gaitAmount);
    this.rotate('leftFoot', AXIS_X, 0.18 * gaitAmount * Math.max(0, swing));
    this.rotate('rightFoot', AXIS_X, 0.18 * gaitAmount * Math.max(0, swingOpposite));

    // Arms: drop out of the T-pose first, then swing.
    this.applyArmRest();
    this.rotate('leftArm', AXIS_X, armSwing, true);
    this.rotate('rightArm', AXIS_X, armSwingOpposite, true);
    this.rotate('leftForeArm', AXIS_X, -0.25 - 0.45 * this.blend.run, true);
    this.rotate('rightForeArm', AXIS_X, -0.25 - 0.45 * this.blend.run, true);

    // Torso: lean into the run, counter-rotate with the stride, bank on turns.
    const forwardLean = 0.06 * this.blend.walk + 0.22 * this.blend.run;
    this.rotate('spine', AXIS_X, forwardLean + idleBreath);
    this.rotate('spine', AXIS_Y, -0.09 * gaitAmount * swing, true);
    this.rotate('spine', AXIS_Z, -this.lean * 0.12, true);
    this.rotate('chest', AXIS_Y, 0.06 * gaitAmount * swing);
    this.rotate('head', AXIS_X, -forwardLean * 0.7);

    // Hips bob twice per stride and drop slightly while running.
    if (this.hips) {
      const bob = gaitAmount * (0.035 + 0.03 * this.blend.run) * bounce;
      this.hips.position.y = this.hipsRestY + bob - 0.02 * this.blend.run;
      this.rotate('hips', AXIS_Z, -this.lean * 0.1);
      this.rotate('hips', AXIS_Y, 0.05 * gaitAmount * swingOpposite, true);
    }
  }

  /** Lowers T-posed arms into a natural A-pose. */
  private applyArmRest(): void {
    // Left arm points +X, right arm -X; rotating about Z brings them down.
    this.rotate('leftArm', AXIS_Z, -1.24);
    this.rotate('rightArm', AXIS_Z, 1.24);
    this.rotate('leftShoulder', AXIS_Z, -0.08);
    this.rotate('rightShoulder', AXIS_Z, 0.08);
  }

  private applyAirbornePose(rising: boolean): void {
    this.applyArmRest();
    this.rotate('leftArm', AXIS_X, rising ? -0.9 : -1.5, true);
    this.rotate('rightArm', AXIS_X, rising ? -0.9 : -1.5, true);
    this.rotate('leftForeArm', AXIS_X, -0.5, true);
    this.rotate('rightForeArm', AXIS_X, -0.5, true);
    this.rotate('leftUpLeg', AXIS_X, rising ? 0.55 : 0.2);
    this.rotate('rightUpLeg', AXIS_X, rising ? 0.15 : -0.1);
    this.rotate('leftLeg', AXIS_X, rising ? -1.0 : -0.4);
    this.rotate('rightLeg', AXIS_X, rising ? -0.35 : -0.2);
    this.rotate('spine', AXIS_X, rising ? 0.12 : -0.08);
    this.reset('head');
    if (this.hips) this.hips.position.y = this.hipsRestY;
  }

  /** Seated pose for driving: thighs forward, knees bent, hands up on a wheel. */
  private applySeatedPose(): void {
    this.rotate('leftUpLeg', AXIS_X, 1.45);
    this.rotate('rightUpLeg', AXIS_X, 1.45);
    this.rotate('leftLeg', AXIS_X, -1.5);
    this.rotate('rightLeg', AXIS_X, -1.5);
    this.applyArmRest();
    this.rotate('leftArm', AXIS_X, -0.75, true);
    this.rotate('rightArm', AXIS_X, -0.75, true);
    this.rotate('leftForeArm', AXIS_X, -0.95, true);
    this.rotate('rightForeArm', AXIS_X, -0.95, true);
    this.rotate('spine', AXIS_X, 0.12);
    this.reset('head');
    if (this.hips) this.hips.position.y = this.hipsRestY;
  }

  /** Aiming layer: torso turns to camera, weapon arm comes up. */
  applyAimPose(pitch: number): void {
    if (!this.hasSkeleton) return;
    this.applyArmRest();
    this.rotate('rightArm', AXIS_X, -1.5 - pitch * 0.5, true);
    this.rotate('rightArm', AXIS_Y, -0.25, true);
    this.rotate('leftArm', AXIS_X, -1.3 - pitch * 0.5, true);
    this.rotate('leftArm', AXIS_Y, 0.55, true);
    this.rotate('leftForeArm', AXIS_X, -0.5, true);
    this.rotate('rightForeArm', AXIS_X, -0.15, true);
    this.rotate('spine', AXIS_Y, -0.2);
    this.rotate('chest', AXIS_Y, -0.15);
  }
}
