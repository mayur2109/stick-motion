export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence?: number;
}
export interface RawFrame {
  timeMs: number;
  people: number;
  landmarks: Landmark[];
  world: Landmark[];
}
export interface RawCapture {
  schemaVersion: 1;
  model: string;
  width: number;
  height: number;
  startMs: number;
  endMs: number;
  sampleFps: number;
  frames: RawFrame[];
  settings?: { minConfidence: number; maxGapMs: number; smoothing: boolean };
}
export interface ImportSettings {
  minConfidence?: number;
  maxGapMs?: number;
  smoothing?: boolean;
}
