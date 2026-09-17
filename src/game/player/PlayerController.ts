import * as THREE from 'three';
import type { useRapier, RapierCollider, RapierRigidBody } from '@react-three/rapier';
import { input } from '../../hooks/useInput';
import { JUMP_SPEED, MOVE_SPEED } from '../../config/world';
import type { PlayerMotionState } from '../../stores/playerStore';

export interface ControllerOutput {
  motionState: PlayerMotionState;
  speed: number;
  heading: number;
  grounded: boolean;
  /** Signed turn rate this frame, for body lean. */
  turn: number;
}

/**
 * Taken from the hook rather than @dimforge/rapier3d-compat directly, so the
 * types always match the exact Rapier build @react-three/rapier resolved.
 */
type RapierWorld = ReturnType<typeof useRapier>['world'];
type CharacterController = ReturnType<RapierWorld['createCharacterController']>;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * On-foot movement.
 *
 * Uses Rapier's kinematic character controller rather than a dynamic body: it
 * gives us proper step-up over kerbs, slope limits and ground snapping without
 * the capsule tipping over or jittering against the city's box colliders.
 */
export class PlayerController {
  private controller: CharacterController;
  private verticalVelocity = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private wasGrounded = true;

  private readonly desired = new THREE.Vector3();
  private readonly translation = new THREE.Vector3();
  private readonly currentPosition = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();

  /** Smoothed horizontal speed, m/s. */
  speed = 0;
  heading = 0;
  grounded = true;

  constructor(private readonly world: RapierWorld) {
    this.controller = world.createCharacterController(0.02);
    this.controller.enableAutostep(0.45, 0.2, true);
    this.controller.enableSnapToGround(0.5);
    this.controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((48 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(80);
    this.controller.setSlideEnabled(true);
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
  }

  /**
   * @param cameraYaw Orbit yaw so input is camera-relative.
   * @param locked    True while a menu, cutscene or vehicle owns the player.
   */
  update(
    delta: number,
    body: RapierRigidBody,
    collider: RapierCollider,
    cameraYaw: number,
    locked: boolean,
    aiming: boolean,
  ): ControllerOutput {
    const dt = Math.min(delta, 1 / 30);

    let inputX = 0;
    let inputZ = 0;
    if (!locked) {
      if (input.forward) inputZ += 1;
      if (input.backward) inputZ -= 1;
      if (input.left) inputX -= 1;
      if (input.right) inputX += 1;
    }

    const hasInput = inputX !== 0 || inputZ !== 0;

    // Camera-relative basis: yaw 0 looks down -Z like the default camera.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    this.moveDirection.set(
      inputX * cos - inputZ * sin,
      0,
      -inputX * sin - inputZ * cos,
    );
    if (hasInput) this.moveDirection.normalize();

    const running = input.run && !aiming;
    const targetSpeed = !hasInput
      ? 0
      : aiming
        ? MOVE_SPEED.aim
        : running
          ? MOVE_SPEED.run
          : MOVE_SPEED.walk;

    // Accelerate quickly, decelerate a touch slower so stops feel weighty.
    const accel = targetSpeed > this.speed ? 14 : 11;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, accel, dt);
    if (this.speed < 0.02) this.speed = 0;

    // Turn the body towards the movement direction (or the camera while aiming).
    const previousHeading = this.heading;
    if (aiming) {
      this.heading = this.dampAngle(this.heading, cameraYaw, 18, dt);
    } else if (hasInput) {
      const target = Math.atan2(this.moveDirection.x, this.moveDirection.z);
      this.heading = this.dampAngle(this.heading, target, 12, dt);
    }
    const turn = dt > 0 ? this.shortestAngle(previousHeading, this.heading) / dt : 0;

    // Gravity and jumping.
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (!locked && input.jump) this.jumpBuffer = 0.16;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.verticalVelocity = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
    } else if (this.grounded && this.verticalVelocity <= 0) {
      // Small downward bias keeps the capsule glued to slopes.
      this.verticalVelocity = -2;
    } else {
      this.verticalVelocity -= 22 * dt;
      this.verticalVelocity = Math.max(this.verticalVelocity, -55);
    }

    const horizontal = hasInput ? this.speed : 0;
    this.desired.set(
      this.moveDirection.x * horizontal * dt,
      this.verticalVelocity * dt,
      this.moveDirection.z * horizontal * dt,
    );

    this.controller.computeColliderMovement(collider, this.desired);
    const computed = this.controller.computedMovement();

    this.wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;

    const position = body.translation();
    this.currentPosition.set(position.x, position.y, position.z);
    this.translation.set(
      this.currentPosition.x + computed.x,
      this.currentPosition.y + computed.y,
      this.currentPosition.z + computed.z,
    );
    body.setNextKinematicTranslation(this.translation);

    // Actual travelled distance, so walking into a wall reads as idle.
    const travelled = Math.hypot(computed.x, computed.z) / Math.max(dt, 1e-4);

    return {
      motionState: this.resolveState(hasInput, running, aiming, travelled),
      speed: travelled,
      heading: this.heading,
      grounded: this.grounded,
      turn,
    };
  }

  private resolveState(
    hasInput: boolean,
    running: boolean,
    aiming: boolean,
    travelled: number,
  ): PlayerMotionState {
    if (!this.grounded) return this.verticalVelocity > 0.5 ? 'JUMP' : 'FALL';
    if (aiming) return 'AIM';
    if (!hasInput || travelled < 0.25) return 'IDLE';
    return running ? 'RUN' : 'WALK';
  }

  /** True on the frame the player lands, for footstep/impact audio. */
  justLanded(): boolean {
    return this.grounded && !this.wasGrounded;
  }

  teleport(body: RapierRigidBody, x: number, y: number, z: number): void {
    body.setTranslation({ x, y, z }, true);
    this.verticalVelocity = 0;
    this.speed = 0;
  }

  setHeading(heading: number): void {
    this.heading = heading;
  }

  private shortestAngle(from: number, to: number): number {
    let diff = (to - from) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  private dampAngle(current: number, target: number, lambda: number, dt: number): number {
    return current + this.shortestAngle(current, target) * (1 - Math.exp(-lambda * dt));
  }
}

export { UP };
