import { MODEL_URLS } from './models';

export type VehicleKind = 'COMMON' | 'SPORT' | 'VAN';

export interface WheelAnchor {
  /** Wheel centre in chassis local space, metres. */
  position: readonly [number, number, number];
  radius: number;
  steered: boolean;
  powered: boolean;
}

export interface VehicleDefinition {
  kind: VehicleKind;
  name: string;
  url: string;
  price: number;

  /** Chassis rigid body. */
  mass: number;
  /** Half extents of the box collider that stands in for the body shell. */
  chassisHalfExtents: readonly [number, number, number];
  /** Centre of that box in local space; sits above the wheels. */
  chassisOffset: readonly [number, number, number];
  /**
   * Height of the centre of mass above the chassis origin. Deliberately far
   * below the middle of the body box: a raycast vehicle with a high centre of
   * mass rolls over in any hard corner.
   */
  centreOfMassHeight: number;

  /** Total engine force in newtons, split across the powered wheels. */
  enginePower: number;
  /** Braking torque per wheel. */
  brakeForce: number;
  handbrakeForce: number;
  /** Top speed in m/s. */
  maxSpeed: number;
  reverseMaxSpeed: number;
  /** Maximum steering angle in radians at low speed. */
  maxSteer: number;
  /** Steering is scaled down as speed rises, to this fraction at top speed. */
  steerSpeedFalloff: number;
  steerRate: number;

  suspensionRestLength: number;
  /** Spring rate in N/m; must carry roughly a quarter of the vehicle mass. */
  suspensionStiffness: number;
  /** Damping as a fraction of critical, compressing. */
  suspensionCompression: number;
  /** Damping as a fraction of critical, rebounding. */
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  frictionSlip: number;
  sideFrictionStiffness: number;

  /**
   * How much of the cornering force is applied at centre-of-mass height
   * rather than at the contact patch, 0..1. Real tyres push at the road, which
   * levers a top-heavy arcade car straight onto its roof; raising the
   * application point keeps the same grip without the rollover.
   */
  antiRoll: number;

  /** Optional nitrous-style boost multiplier bound to SHIFT. */
  boostMultiplier: number;

  /** Where the driver sits and where they step out, in local space. */
  seatOffset: readonly [number, number, number];
  doorOffset: readonly [number, number, number];

  /** Regex matching wheel nodes inside the GLB, if it has any. */
  wheelNodePattern?: RegExp;
  /** Used when the model has no wheel geometry of its own. */
  fallbackWheels?: readonly WheelAnchor[];
  /** Emissive light placement, local space. */
  headlights: readonly (readonly [number, number, number])[];
  taillights: readonly (readonly [number, number, number])[];
}

/**
 * Every number below that describes geometry was measured from the GLB itself
 * (footprint via a minimum-area rectangle, wheel centres from the wheel nodes),
 * so the colliders and the raycast wheels line up with what is drawn.
 */
export const VEHICLE_DEFINITIONS: Record<VehicleKind, VehicleDefinition> = {
  COMMON: {
    kind: 'COMMON',
    name: 'Hatch',
    url: MODEL_URLS.carCommon,
    price: 0,
    mass: 1150,
    // Body measures 1.86 x 1.50 x 3.80; the collider starts above the wheels.
    chassisHalfExtents: [0.88, 0.56, 1.82],
    chassisOffset: [0, 0.94, 0],
    centreOfMassHeight: 0.42,
    enginePower: 5200,
    brakeForce: 34,
    handbrakeForce: 90,
    maxSpeed: 33,
    reverseMaxSpeed: 11,
    maxSteer: 0.58,
    steerSpeedFalloff: 0.34,
    steerRate: 3.4,
    suspensionRestLength: 0.26,
    suspensionStiffness: 52000,
    suspensionCompression: 0.42,
    suspensionRelaxation: 0.78,
    maxSuspensionTravel: 0.22,
    frictionSlip: 2.1,
    sideFrictionStiffness: 0.85,
    antiRoll: 0.88,
    boostMultiplier: 1.18,
    seatOffset: [-0.35, 1.0, 0.2],
    doorOffset: [-1.45, 0, 0.2],
    wheelNodePattern: /^wheel/i,
    headlights: [
      [-0.62, 0.78, 1.9],
      [0.62, 0.78, 1.9],
    ],
    taillights: [
      [-0.68, 0.92, -1.86],
      [0.68, 0.92, -1.86],
    ],
  },

  SPORT: {
    kind: 'SPORT',
    name: 'Rush GT',
    url: MODEL_URLS.carSport,
    price: 15000,
    mass: 1350,
    // Body measures 2.57 x 1.80 x 4.63.
    chassisHalfExtents: [1.14, 0.58, 2.2],
    chassisOffset: [0, 1.08, 0],
    centreOfMassHeight: 0.4,
    enginePower: 11500,
    brakeForce: 46,
    handbrakeForce: 110,
    maxSpeed: 61,
    reverseMaxSpeed: 13,
    maxSteer: 0.5,
    steerSpeedFalloff: 0.22,
    steerRate: 4.2,
    suspensionRestLength: 0.24,
    suspensionStiffness: 68000,
    suspensionCompression: 0.48,
    suspensionRelaxation: 0.85,
    maxSuspensionTravel: 0.16,
    frictionSlip: 2.6,
    sideFrictionStiffness: 0.94,
    antiRoll: 0.85,
    boostMultiplier: 1.3,
    seatOffset: [-0.42, 1.05, 0.1],
    doorOffset: [-1.7, 0, 0.1],
    wheelNodePattern: /^(tyre|rim|bdisk|caliper)_/i,
    headlights: [
      [-0.78, 0.95, 2.18],
      [0.78, 0.95, 2.18],
    ],
    taillights: [
      [-0.86, 1.05, -2.2],
      [0.86, 1.05, -2.2],
    ],
  },

  VAN: {
    kind: 'VAN',
    name: 'Hauler',
    url: MODEL_URLS.van,
    price: 9000,
    mass: 2350,
    // Body measures 2.18 x 2.61 x 6.01.
    chassisHalfExtents: [1.04, 0.95, 2.9],
    chassisOffset: [0, 1.5, 0],
    centreOfMassHeight: 0.62,
    enginePower: 7200,
    brakeForce: 40,
    handbrakeForce: 95,
    maxSpeed: 26,
    reverseMaxSpeed: 9,
    maxSteer: 0.46,
    steerSpeedFalloff: 0.4,
    steerRate: 2.6,
    suspensionRestLength: 0.32,
    suspensionStiffness: 88000,
    suspensionCompression: 0.4,
    suspensionRelaxation: 0.75,
    maxSuspensionTravel: 0.3,
    frictionSlip: 1.8,
    sideFrictionStiffness: 0.7,
    antiRoll: 0.94,
    boostMultiplier: 1.1,
    seatOffset: [-0.42, 1.55, 1.3],
    doorOffset: [-1.6, 0, 1.3],
    // This model has no wheel geometry, so the rig builds cylinders instead.
    fallbackWheels: [
      { position: [-0.92, 0.44, 1.96], radius: 0.44, steered: true, powered: true },
      { position: [0.92, 0.44, 1.96], radius: 0.44, steered: true, powered: true },
      { position: [-0.92, 0.44, -1.86], radius: 0.44, steered: false, powered: true },
      { position: [0.92, 0.44, -1.86], radius: 0.44, steered: false, powered: true },
    ],
    headlights: [
      [-0.78, 1.15, 2.95],
      [0.78, 1.15, 2.95],
    ],
    taillights: [
      [-0.86, 1.5, -2.95],
      [0.86, 1.5, -2.95],
    ],
  },
};

export const VEHICLE_KINDS = Object.keys(VEHICLE_DEFINITIONS) as VehicleKind[];

export const getVehicleDefinition = (kind: VehicleKind): VehicleDefinition =>
  VEHICLE_DEFINITIONS[kind];
