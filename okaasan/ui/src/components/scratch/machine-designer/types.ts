// ─── Guide Types ──────────────────────────────────────────

export type LinearRailType = 'MGN9' | 'MGN12' | 'MGN12H' | 'MGN15' | 'HGR15' | 'HGR20';
export type RoundRodType = 'SBR10' | 'SBR16' | 'SBR20';
export type GuideType = LinearRailType | RoundRodType | 'V-slot';

export interface GuideSpec {
  label: string;
  category: 'linear_rail' | 'round_rod' | 'v_slot';
  staticLoad: number;       // N — static load capacity per block/carriage
  momentStiffness: number;  // N·m/rad — moment rigidity per block
  linearStiffness: number;  // N/um — linear stiffness
  width: number;            // mm — rail width for 3D rendering
  height: number;           // mm — rail height
}

export const GUIDE_SPECS: Record<GuideType, GuideSpec> = {
  MGN9:   { label: 'MGN9',   category: 'linear_rail', staticLoad: 7200,  momentStiffness: 18,  linearStiffness: 46,  width: 9,  height: 6 },
  MGN12:  { label: 'MGN12',  category: 'linear_rail', staticLoad: 12700, momentStiffness: 36,  linearStiffness: 72,  width: 12, height: 8 },
  MGN12H: { label: 'MGN12H', category: 'linear_rail', staticLoad: 17200, momentStiffness: 52,  linearStiffness: 98,  width: 12, height: 8 },
  MGN15:  { label: 'MGN15',  category: 'linear_rail', staticLoad: 22000, momentStiffness: 75,  linearStiffness: 130, width: 15, height: 10 },
  HGR15:  { label: 'HGR15',  category: 'linear_rail', staticLoad: 28600, momentStiffness: 120, linearStiffness: 180, width: 15, height: 14 },
  HGR20:  { label: 'HGR20',  category: 'linear_rail', staticLoad: 42300, momentStiffness: 200, linearStiffness: 250, width: 20, height: 18 },
  SBR10:  { label: 'SBR10',  category: 'round_rod',   staticLoad: 3000,  momentStiffness: 8,   linearStiffness: 25,  width: 10, height: 10 },
  SBR16:  { label: 'SBR16',  category: 'round_rod',   staticLoad: 6000,  momentStiffness: 15,  linearStiffness: 40,  width: 16, height: 16 },
  SBR20:  { label: 'SBR20',  category: 'round_rod',   staticLoad: 9500,  momentStiffness: 25,  linearStiffness: 55,  width: 20, height: 20 },
  'V-slot': { label: 'V-Slot Wheels', category: 'v_slot', staticLoad: 1500, momentStiffness: 5, linearStiffness: 15, width: 20, height: 20 },
};

// ─── Drive Types ──────────────────────────────────────────

export type DriveType = 'GT2_6mm' | 'GT2_9mm' | 'SFU1204' | 'SFU1605' | 'SFU2005' | 'T8' | 'T12' | 'rack_pinion';

export interface DriveSpec {
  label: string;
  category: 'belt' | 'ball_screw' | 'lead_screw' | 'rack_pinion';
  pitchMm: number;          // mm per revolution (or tooth pitch for belts)
  maxSpeed: number;         // mm/s typical max
  backlash: number;         // um typical backlash
  efficiency: number;       // 0-1
}

export const DRIVE_SPECS: Record<DriveType, DriveSpec> = {
  GT2_6mm:    { label: 'GT2 Belt 6mm',   category: 'belt',        pitchMm: 2,    maxSpeed: 500, backlash: 0,   efficiency: 0.95 },
  GT2_9mm:    { label: 'GT2 Belt 9mm',   category: 'belt',        pitchMm: 2,    maxSpeed: 500, backlash: 0,   efficiency: 0.95 },
  SFU1204:    { label: 'Ball Screw 1204', category: 'ball_screw',  pitchMm: 4,    maxSpeed: 100, backlash: 5,   efficiency: 0.90 },
  SFU1605:    { label: 'Ball Screw 1605', category: 'ball_screw',  pitchMm: 5,    maxSpeed: 80,  backlash: 5,   efficiency: 0.90 },
  SFU2005:    { label: 'Ball Screw 2005', category: 'ball_screw',  pitchMm: 5,    maxSpeed: 60,  backlash: 3,   efficiency: 0.92 },
  T8:         { label: 'Lead Screw T8',   category: 'lead_screw',  pitchMm: 8,    maxSpeed: 30,  backlash: 50,  efficiency: 0.40 },
  T12:        { label: 'Lead Screw T12',  category: 'lead_screw',  pitchMm: 12,   maxSpeed: 25,  backlash: 80,  efficiency: 0.35 },
  rack_pinion: { label: 'Rack & Pinion', category: 'rack_pinion', pitchMm: 3.14, maxSpeed: 200, backlash: 30,  efficiency: 0.85 },
};

// ─── Motor Types ──────────────────────────────────────────

export type MotorType = 'NEMA17' | 'NEMA23';

export interface MotorSpec {
  label: string;
  flangeSizeMm: number;
  holdingTorque: number; // N·m
  weight: number;        // grams
}

export const MOTOR_SPECS: Record<MotorType, MotorSpec> = {
  NEMA17: { label: 'NEMA 17', flangeSizeMm: 42, holdingTorque: 0.45, weight: 350 },
  NEMA23: { label: 'NEMA 23', flangeSizeMm: 57, holdingTorque: 1.26, weight: 700 },
};

// ─── Frame Profiles ───────────────────────────────────────

export type FrameProfile = '2020' | '2040' | '3030' | '3060' | '4040' | '4080';

export interface FrameProfileSpec {
  label: string;
  widthMm: number;
  heightMm: number;
  momentOfInertia: number; // mm^4 — second moment of area (Ixx)
}

export const FRAME_PROFILE_SPECS: Record<FrameProfile, FrameProfileSpec> = {
  '2020': { label: '2020', widthMm: 20, heightMm: 20, momentOfInertia: 6947 },
  '2040': { label: '2040', widthMm: 20, heightMm: 40, momentOfInertia: 55000 },
  '3030': { label: '3030', widthMm: 30, heightMm: 30, momentOfInertia: 24000 },
  '3060': { label: '3060', widthMm: 30, heightMm: 60, momentOfInertia: 192000 },
  '4040': { label: '4040', widthMm: 40, heightMm: 40, momentOfInertia: 75000 },
  '4080': { label: '4080', widthMm: 40, heightMm: 80, momentOfInertia: 600000 },
};

// ─── Axis Configuration ───────────────────────────────────

export type KinematicsType = 'corexy' | 'cartesian';

export type GuideOrientation = 'same_face' | 'opposed' | 'perpendicular';

export interface AxisConfig {
  guideType: GuideType;
  guideCount: 1 | 2;
  guideSpacingMm: number;       // distance between dual rails (center-to-center)
  guideOrientation: GuideOrientation; // how dual rails are mounted relative to each other
  driveType: DriveType;
  motorType: MotorType;
  motorCount: 1 | 2 | 3;
  carriageOffsetMm: number;     // tool offset from guide center (moment arm)
}

// ─── Full Machine Config ──────────────────────────────────

export interface MachineConfig {
  name: string;
  kinematics: KinematicsType;
  frame: {
    profile: FrameProfile;
    xLengthMm: number;
    yLengthMm: number;
    zLengthMm: number;
  };
  axes: {
    x: AxisConfig;
    y: AxisConfig;
    z: AxisConfig;
  };
}

// ─── Defaults ─────────────────────────────────────────────

export const DEFAULT_AXIS_CONFIG: AxisConfig = {
  guideType: 'MGN12',
  guideCount: 1,
  guideSpacingMm: 40,
  guideOrientation: 'same_face',
  driveType: 'GT2_6mm',
  motorType: 'NEMA17',
  motorCount: 1,
  carriageOffsetMm: 20,
};

export const DEFAULT_MACHINE_CONFIG: MachineConfig = {
  name: 'My Machine',
  kinematics: 'corexy',
  frame: {
    profile: '2020',
    xLengthMm: 350,
    yLengthMm: 350,
    zLengthMm: 400,
  },
  axes: {
    x: { ...DEFAULT_AXIS_CONFIG, guideType: 'MGN12H', guideCount: 2, guideSpacingMm: 40, driveType: 'GT2_6mm' },
    y: { ...DEFAULT_AXIS_CONFIG, guideType: 'MGN12', guideCount: 1, driveType: 'GT2_6mm' },
    z: { ...DEFAULT_AXIS_CONFIG, guideType: 'MGN12', guideCount: 1, driveType: 'T8', motorCount: 3 },
  },
};

// ─── Helper: Derive build volume from frame ───────────────

export function deriveBuildVolume(config: MachineConfig): { x: number; y: number; z: number } {
  const offset = FRAME_PROFILE_SPECS[config.frame.profile].widthMm * 2 + 40;
  return {
    x: Math.max(0, config.frame.xLengthMm - offset),
    y: Math.max(0, config.frame.yLengthMm - offset),
    z: Math.max(0, config.frame.zLengthMm - 80),
  };
}
