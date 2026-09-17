import * as THREE from 'three';
import type { useRapier, RapierRigidBody } from '@react-three/rapier';
import type { VehicleDefinition, WheelAnchor } from '../../config/vehicles';

type RapierWorld = ReturnType<typeof useRapier>['world'];
type RapierModule = ReturnType<typeof useRapier>['rapier'];

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export interface VehicleState {
  /** Signed speed along the chassis forward axis, m/s. */
  speed: number;
  /** Absolute speed for the HUD, m/s. */
  groundSpeed: number;
  steerAngle: number;
  braking: boolean;
  /** 0..1 how much the car is sliding sideways, for tyre screech and smoke. */
  slip: number;
  wheelsOnGround: number;
}

interface WheelRuntime {
  anchor: WheelAnchor;
  /** Suspension compression last step, for the damper velocity. */
  compression: number;
  grounded: boolean;
  /** Visual spin angle, radians. */
  spin: number;
  steer: number;
  suspensionLength: number;
  slip: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// Scratch vectors: this runs per wheel, per car, per physics step.
const connectionOffset = new THREE.Vector3();
const connectionWorld = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const contactPoint = new THREE.Vector3();
const chassisUp = new THREE.Vector3();
const chassisForward = new THREE.Vector3();
const chassisRight = new THREE.Vector3();
const wheelForward = new THREE.Vector3();
const wheelRight = new THREE.Vector3();
const pointVelocity = new THREE.Vector3();
const armToPoint = new THREE.Vector3();
const impulse = new THREE.Vector3();
const bodyQuaternion = new THREE.Quaternion();
const bodyPosition = new THREE.Vector3();
const linearVelocity = new THREE.Vector3();
const angularVelocity = new THREE.Vector3();
const centreOfMass = new THREE.Vector3();
const lateralPoint = new THREE.Vector3();

/**
 * Arcade raycast vehicle.
 *
 * Each corner is a spring damper along a ray cast down from the chassis: the
 * spring carries the weight, and the tyre at the contact point applies a
 * forward force from the engine plus a lateral force resisting sideways
 * sliding. Grip at each wheel is capped by the load on it, so lifting a wheel
 * over a kerb, or yanking the handbrake, naturally breaks traction into a
 * slide instead of stopping the car dead.
 *
 * This is written out rather than driven through Rapier's bundled vehicle
 * controller so that every coefficient is in plain SI units against the real
 * chassis mass, and can be reasoned about and tuned directly.
 */
export class VehicleController {
  private readonly wheels: WheelRuntime[];
  private readonly poweredCount: number;
  private readonly sprungMass: number;
  private readonly criticalDamping: number;
  private currentSteer = 0;

  readonly state: VehicleState = {
    speed: 0,
    groundSpeed: 0,
    steerAngle: 0,
    braking: false,
    slip: 0,
    wheelsOnGround: 0,
  };

  constructor(
    private readonly world: RapierWorld,
    private readonly rapier: RapierModule,
    private readonly body: RapierRigidBody,
    private readonly definition: VehicleDefinition,
    anchors: WheelAnchor[],
  ) {
    this.wheels = anchors.map((anchor) => ({
      anchor,
      compression: 0,
      grounded: false,
      spin: 0,
      steer: 0,
      suspensionLength: definition.suspensionRestLength,
      slip: 0,
    }));
    this.poweredCount = Math.max(1, anchors.filter((anchor) => anchor.powered).length);
    this.sprungMass = definition.mass / Math.max(1, anchors.length);
    this.criticalDamping = 2 * Math.sqrt(definition.suspensionStiffness * this.sprungMass);
  }

  dispose(): void {
    // The controller owns no Rapier resources of its own.
  }

  get wheelCount(): number {
    return this.wheels.length;
  }

  wheelSpin(index: number): number {
    return this.wheels[index]?.spin ?? 0;
  }

  wheelSteer(index: number): number {
    return this.wheels[index]?.steer ?? 0;
  }

  /** Current suspension length, so the visual wheel rides up and down. */
  wheelSuspensionLength(index: number): number {
    return this.wheels[index]?.suspensionLength ?? this.definition.suspensionRestLength;
  }

  wheelGrounded(index: number): boolean {
    return this.wheels[index]?.grounded ?? false;
  }

  update(dt: number, input: DriveInput): VehicleState {
    const definition = this.definition;
    const body = this.body;

    const translation = body.translation();
    const rotation = body.rotation();
    bodyPosition.set(translation.x, translation.y, translation.z);
    bodyQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const initialLinear = body.linvel();
    linearVelocity.set(initialLinear.x, initialLinear.y, initialLinear.z);

    chassisUp.copy(UP).applyQuaternion(bodyQuaternion);
    chassisForward.set(0, 0, 1).applyQuaternion(bodyQuaternion);
    chassisRight.set(1, 0, 0).applyQuaternion(bodyQuaternion);
    rayDirection.copy(DOWN).applyQuaternion(bodyQuaternion);

    const forwardSpeed = linearVelocity.dot(chassisForward);
    const absSpeed = Math.abs(forwardSpeed);

    // Steering authority falls off with speed so the car stays stable fast.
    const falloff = THREE.MathUtils.lerp(
      1,
      definition.steerSpeedFalloff,
      THREE.MathUtils.clamp(absSpeed / definition.maxSpeed, 0, 1),
    );
    this.currentSteer = THREE.MathUtils.damp(
      this.currentSteer,
      input.steer * definition.maxSteer * falloff,
      definition.steerRate,
      dt,
    );

    const { engineForce, brakeForce } = this.resolveDrive(input, forwardSpeed, absSpeed);

    let grounded = 0;
    let totalSlip = 0;

    for (const wheel of this.wheels) {
      const anchor = wheel.anchor;
      wheel.steer = anchor.steered ? this.currentSteer : 0;

      // Suspension mount, one rest length above the wheel centre.
      connectionOffset
        .set(
          anchor.position[0],
          anchor.position[1] + definition.suspensionRestLength,
          anchor.position[2],
        )
        .applyQuaternion(bodyQuaternion);
      connectionWorld.copy(bodyPosition).add(connectionOffset);

      const rayLength = definition.suspensionRestLength + anchor.radius;
      const ray = new this.rapier.Ray(connectionWorld, rayDirection);
      const hit = this.world.castRay(
        ray,
        rayLength,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );

      if (!hit) {
        wheel.grounded = false;
        wheel.compression = 0;
        wheel.suspensionLength = definition.suspensionRestLength;
        wheel.slip = 0;
        // An airborne wheel keeps rolling rather than stopping dead.
        wheel.spin += (forwardSpeed / Math.max(anchor.radius, 0.05)) * dt;
        continue;
      }

      grounded++;
      wheel.grounded = true;

      const distance = hit.timeOfImpact;
      const suspensionLength = THREE.MathUtils.clamp(
        distance - anchor.radius,
        definition.suspensionRestLength - definition.maxSuspensionTravel,
        definition.suspensionRestLength,
      );
      wheel.suspensionLength = suspensionLength;
      const compression = definition.suspensionRestLength - suspensionLength;

      contactPoint.copy(connectionWorld).addScaledVector(rayDirection, distance);

      // Re-read the body velocity for every wheel.
      //
      // Each wheel applies an impulse that changes the whole body's motion, so
      // solving all four against one pre-step snapshot makes them each correct
      // for sideways slide that the previous wheels already removed. The
      // corrections then stack to roughly four times what was needed, the car
      // oscillates hard enough to saturate its grip budget, and there is
      // nothing left over to actually drive it forward. Reading the velocity
      // back each time makes the wheels solve in sequence instead.
      const linear = body.linvel();
      const angular = body.angvel();
      const com = body.worldCom();
      linearVelocity.set(linear.x, linear.y, linear.z);
      angularVelocity.set(angular.x, angular.y, angular.z);
      centreOfMass.set(com.x, com.y, com.z);

      // Chassis velocity at the contact point: v + omega x r
      armToPoint.copy(contactPoint).sub(centreOfMass);
      pointVelocity.copy(angularVelocity).cross(armToPoint).add(linearVelocity);

      // --- Suspension: the spring carries the load, the damper kills bounce ---
      const compressionRate = (compression - wheel.compression) / dt;
      wheel.compression = compression;
      const dampingRatio =
        compressionRate > 0 ? definition.suspensionCompression : definition.suspensionRelaxation;

      const normalForce = THREE.MathUtils.clamp(
        definition.suspensionStiffness * compression +
          dampingRatio * this.criticalDamping * compressionRate,
        0,
        definition.mass * 60,
      );

      impulse.copy(chassisUp).multiplyScalar(normalForce * dt);
      body.applyImpulseAtPoint(impulse, contactPoint, true);

      // --- Tyre: axes rotated by this wheel's steering angle ---
      wheelForward.copy(chassisForward).applyAxisAngle(chassisUp, wheel.steer);
      wheelRight.copy(chassisRight).applyAxisAngle(chassisUp, wheel.steer);

      const lateralSpeed = pointVelocity.dot(wheelRight);
      const rollingSpeed = pointVelocity.dot(wheelForward);

      // Grip budget for this tyre is proportional to the load on it.
      const gripLimit = normalForce * definition.frictionSlip * dt;
      const sideGrip =
        input.handbrake && !anchor.steered
          ? definition.sideFrictionStiffness * 0.25
          : definition.sideFrictionStiffness;

      // Lateral: cancel sideways sliding, within the grip budget.
      const wantedLateral = -lateralSpeed * this.sprungMass * sideGrip;
      const lateralImpulse = THREE.MathUtils.clamp(wantedLateral, -gripLimit, gripLimit);
      wheel.slip =
        gripLimit > 1e-4 && Math.abs(wantedLateral) > gripLimit
          ? Math.min(1, Math.abs(lateralSpeed) / 8)
          : 0;
      totalSlip += wheel.slip;

      // Cornering force is applied nearer the centre of mass than the contact
      // patch, so hard turns do not lever the car onto its roof.
      lateralPoint.copy(contactPoint);
      lateralPoint.y += (centreOfMass.y - contactPoint.y) * definition.antiRoll;
      impulse.copy(wheelRight).multiplyScalar(lateralImpulse);
      body.applyImpulseAtPoint(impulse, lateralPoint, true);

      // Longitudinal: engine drive and braking, also capped by grip.
      let longitudinal = 0;
      if (anchor.powered && engineForce !== 0) {
        longitudinal += (engineForce / this.poweredCount) * dt;
      }
      const brakeHere =
        input.handbrake && !anchor.steered ? definition.handbrakeForce : brakeForce;
      if (brakeHere > 0) {
        // Braking opposes rolling but never reverses it within a step.
        const stopping = -rollingSpeed * this.sprungMass;
        const brakeBudget = brakeHere * dt * 12;
        longitudinal += THREE.MathUtils.clamp(stopping, -brakeBudget, brakeBudget);
      }
      longitudinal = THREE.MathUtils.clamp(longitudinal, -gripLimit, gripLimit);

      impulse.copy(wheelForward).multiplyScalar(longitudinal);
      body.applyImpulseAtPoint(impulse, contactPoint, true);

      wheel.spin += (rollingSpeed / Math.max(anchor.radius, 0.05)) * dt;
    }

    // A parked car should stay parked. Residual tyre impulses are tiny but
    // one-sided, so without this an unattended car slowly creeps down the road.
    const idle =
      input.throttle === 0 && input.brake === 0 && !input.handbrake && grounded === this.wheels.length;
    if (idle && absSpeed < 0.6) {
      const resting = body.linvel();
      const spin = body.angvel();
      body.setLinvel({ x: resting.x * 0.6, y: resting.y, z: resting.z * 0.6 }, false);
      body.setAngvel({ x: spin.x * 0.6, y: spin.y * 0.6, z: spin.z * 0.6 }, false);
    }

    this.state.speed = forwardSpeed;
    this.state.groundSpeed = absSpeed;
    this.state.steerAngle = this.currentSteer;
    this.state.braking = brakeForce > 0 || input.handbrake;
    this.state.wheelsOnGround = grounded;
    this.state.slip = THREE.MathUtils.clamp(totalSlip / this.wheels.length, 0, 1);
    return this.state;
  }

  /**
   * Maps throttle and brake onto drive and braking force. Holding S brakes
   * while rolling forward and only becomes reverse once the car has stopped.
   */
  private resolveDrive(
    input: DriveInput,
    forwardSpeed: number,
    absSpeed: number,
  ): { engineForce: number; brakeForce: number } {
    const definition = this.definition;

    if (input.throttle > 0) {
      if (forwardSpeed < -0.6) {
        return { engineForce: 0, brakeForce: definition.brakeForce * input.throttle };
      }
      const boost = input.boost ? definition.boostMultiplier : 1;
      const headroom = THREE.MathUtils.clamp(
        1 - absSpeed / (definition.maxSpeed * boost),
        0,
        1,
      );
      return {
        engineForce: definition.enginePower * input.throttle * headroom * boost,
        brakeForce: 0,
      };
    }

    if (input.brake > 0) {
      if (forwardSpeed > 0.6) {
        return { engineForce: 0, brakeForce: definition.brakeForce * input.brake };
      }
      const headroom = THREE.MathUtils.clamp(
        1 - absSpeed / definition.reverseMaxSpeed,
        0,
        1,
      );
      return {
        engineForce: -definition.enginePower * 0.55 * input.brake * headroom,
        brakeForce: 0,
      };
    }

    // Coasting: light engine braking so lifting off actually slows the car.
    return { engineForce: 0, brakeForce: definition.brakeForce * 0.05 };
  }
}
