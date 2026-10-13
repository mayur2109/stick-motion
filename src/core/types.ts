export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export interface Joint {
  id: string;
  parent: string | null;
  offset: Vec3;
}
export interface Rig {
  version?: number;
  id: string;
  joints: Joint[];
}
export interface MotionFrame {
  t: number;
  root: Vec3;
  rotations: Record<string, Quat>;
}
export interface Phase {
  id: string;
  label: string;
  start: number;
  end: number;
}
export interface Contact {
  joint: string;
  target: Vec3;
  pole: Vec3;
  start: number;
  end: number;
}
export interface Equipment {
  id: string;
  kind: 'dumbbell' | 'bar' | 'support';
  anchor?: string;
  position?: Vec3;
  offset?: Vec3;
  size: Vec3;
}
export interface Camera {
  view: 'front' | 'side' | 'three-quarter' | 'captured';
  yaw?: number;
  elevation?: number;
}
export interface MotionClip {
  schemaVersion: 1;
  id: string;
  name: string;
  rig: Rig;
  durationMs: number;
  loop: boolean;
  frames: MotionFrame[];
  phases?: Phase[];
  contacts?: Contact[];
  equipment?: Equipment[];
  camera?: Camera;
  source: {
    type: 'procedural' | 'video';
    reference?: string;
    model?: string;
    estimatedDepth?: boolean;
    recipe?: {
      id: string;
      version: number;
      parameters: { side: string; range: number; durationMs: number };
    };
    processing?: {
      version: number;
      minConfidence: number;
      maxGapMs: number;
      smoothing: boolean;
      startMs: number;
      endMs: number;
      sampleFps: number;
    };
  };
}
export interface Pose {
  root: Vec3;
  rotations: Record<string, Quat>;
  worldRotations: Record<string, Quat>;
  rig: Rig;
  joints: Record<string, Vec3>;
  equipment: Equipment[];
  phase?: Phase;
}
export interface MotionFinding {
  category: 'structural' | 'kinematic' | 'observation';
  severity: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
  joint?: string;
  timeMs?: number;
}
export interface MotionDiagnostics {
  findings: MotionFinding[];
  visualReview: 'not-assessed';
  valid: boolean;
  errors: string[];
  warnings: string[];
}
export interface ProjectedPose {
  joints: Record<string, Vec3>;
  equipment: Equipment[];
  rig: Rig;
}
