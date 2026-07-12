/**
 * Central, tunable configuration. Designers and developers change gameplay feel
 * here without touching logic. Values are grouped by domain.
 *
 * All distances are in metres, times in seconds, angles in radians unless noted.
 */
export const GameConfig = {
  /** Deterministic seed for procedural generation. */
  seed: 20260712,

  simulation: {
    /** Fixed simulation rate (Hz). */
    hz: 60,
    /** Gravity acceleration (m/s²). */
    gravity: 24,
  },

  renderer: {
    /** Cap the device pixel ratio to protect performance on retina displays. */
    maxPixelRatio: 2,
    /** Fog colour + distances give the city its hazy horizon. */
    fogColor: 0xbfd4e6,
    fogNear: 80,
    fogFar: 520,
    clearColor: 0x9fc0e0,
  },

  camera: {
    fov: 68,
    near: 0.1,
    far: 1200,
    /** Third-person follow offset behind/above the player (metres). */
    followDistance: 6.5,
    followHeight: 3.2,
    /** How quickly the camera catches up (higher = snappier). */
    followLambda: 9,
    /** Vertical look limits (radians). */
    pitchMin: -0.9,
    pitchMax: 0.6,
    lookSensitivity: 0.0022,
  },

  player: {
    radius: 0.4,
    height: 1.8,
    walkSpeed: 4.5,
    sprintSpeed: 8.5,
    /** Ground acceleration / deceleration (m/s²). */
    acceleration: 45,
    deceleration: 30,
    jumpSpeed: 8.5,
    /** Air control factor (0..1). */
    airControl: 0.35,
    spawn: [0, 1.2, 8] as [number, number, number],
  },

  vehicle: {
    /** Max forward speed (m/s ≈ 108 km/h at 30). */
    maxSpeed: 30,
    /** Max reverse speed (m/s). */
    maxReverse: 9,
    /** Engine acceleration (m/s²). */
    acceleration: 14,
    /** Braking deceleration (m/s²). */
    brakeForce: 26,
    /** Passive rolling deceleration when coasting (m/s²). */
    drag: 4,
    /** Max steering angle at low speed (radians). */
    maxSteer: 0.6,
    /** Steering is reduced at speed for stability (0..1 of maxSteer at maxSpeed). */
    highSpeedSteerFactor: 0.35,
    /** Wheelbase (m) used for the bicycle steering model. */
    wheelbase: 2.4,
    /** How fast the player can enter/exit (metres of reach). */
    enterRange: 3.5,
    driveCamera: {
      distance: 9,
      height: 4,
      lambda: 6,
    },
  },

  traffic: {
    /** Number of autonomous cars. */
    count: 16,
    /** Cruise speed of AI cars (m/s). */
    speed: 10,
    /** Distance at which an AI car brakes for an obstacle ahead (m). */
    lookahead: 9,
  },

  crowd: {
    /** Number of wandering pedestrians. */
    count: 40,
    /** Walking speed (m/s). */
    speed: 1.4,
    /** Distance at which a pedestrian flees an approaching car (m). */
    fleeRadius: 6,
    /** Flee speed multiplier. */
    fleeMultiplier: 2.6,
  },

  /** Time-of-day cycle. */
  dayNight: {
    /** Real seconds for a full 24 h cycle. */
    dayLengthSeconds: 240,
    /** Hour the game starts at (0..24). */
    startHour: 9,
  },

  city: {
    /** Number of blocks per side of the grid. */
    blocks: 10,
    /** Size of one block (building footprint area), metres. */
    blockSize: 42,
    /** Width of the roads between blocks, metres. */
    roadWidth: 12,
    /** Sidewalk width along each block edge, metres. */
    sidewalkWidth: 3,
    building: {
      minFloors: 2,
      maxFloors: 14,
      floorHeight: 3.4,
      /** Inset of a building from its block edge (leaves room for sidewalk). */
      margin: 2,
    },
    streetlights: {
      /** Spacing between lights along a road, metres. */
      spacing: 24,
      height: 6,
    },
  },
} as const;

export type GameConfigType = typeof GameConfig;
