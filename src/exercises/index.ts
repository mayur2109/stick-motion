import type { Contact, Equipment, MotionClip, Rig, Vec3 } from '../core/types.js';
import { add, scale, normalize, solveTwoBone } from '../core/math.js';
import { frameFromPoints, mirrorClip } from '../core/motion.js';
export const exerciseIds = [
  'squat',
  'pushup',
  'lunge',
  'bridge',
  'pullup',
  'row',
  'lateral',
  'plank',
] as const;
export type ExerciseId = (typeof exerciseIds)[number];
export interface ExerciseOptions {
  side?: 'left' | 'right';
  durationMs?: number;
  range?: number;
}
const names: Record<ExerciseId, string> = {
  squat: 'Bodyweight squat',
  pushup: 'Push-up',
  lunge: 'Reverse lunge',
  bridge: 'Glute bridge',
  pullup: 'Pull-up',
  row: 'One-arm dumbbell row',
  lateral: 'Dumbbell lateral raise',
  plank: 'Front plank',
};
export function createRig(): Rig {
  const joints: Rig['joints'] = [
    { id: 'pelvis', parent: null, offset: [0, 0, 0] },
    { id: 'spine', parent: 'pelvis', offset: [0, 0.23, 0] },
    { id: 'chest', parent: 'spine', offset: [0, 0.27, 0] },
    { id: 'neck', parent: 'chest', offset: [0, 0.12, 0] },
    { id: 'head', parent: 'neck', offset: [0, 0.15, 0] },
  ];
  for (const side of ['left', 'right']) {
    const x = side === 'left' ? -0.12 : 0.12;
    joints.push(
      { id: side + 'Hip', parent: 'pelvis', offset: [x, 0, 0] },
      { id: side + 'Knee', parent: side + 'Hip', offset: [0, -0.43, 0] },
      { id: side + 'Ankle', parent: side + 'Knee', offset: [0, -0.43, 0] },
      { id: side + 'Heel', parent: side + 'Ankle', offset: [0, -0.065, -0.07] },
      { id: side + 'Toe', parent: side + 'Ankle', offset: [0, -0.065, 0.16] },
      { id: side + 'Shoulder', parent: 'chest', offset: [x < 0 ? -0.2 : 0.2, 0, 0] },
      { id: side + 'Elbow', parent: side + 'Shoulder', offset: [0, -0.32, 0] },
      { id: side + 'Wrist', parent: side + 'Elbow', offset: [0, -0.3, 0] },
    );
  }
  return { id: 'adult-neutral-v1', version: 1, joints };
}
const smooth = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
function cycle(t: number) {
  return t < 0.45 ? smooth(t / 0.45) : t < 0.55 ? 1 : 1 - smooth((t - 0.55) / 0.45);
}
type Points = Record<string, Vec3>;
function torso(p: Points, root: Vec3, up: Vec3) {
  up = normalize(up);
  p.pelvis = root;
  p.spine = add(root, scale(up, 0.23));
  p.chest = add(root, scale(up, 0.5));
  p.neck = add(root, scale(up, 0.62));
  p.head = add(root, scale(up, 0.77));
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    p[side + 'Hip'] = add(root, [sign * 0.12, 0, 0]);
    p[side + 'Shoulder'] = add(p.chest, [sign * 0.2, 0, 0]);
  }
}
function leg(p: Points, side: string, ankle: Vec3, pole: Vec3 = [0, 0, 1], backward = false) {
  p[side + 'Ankle'] = ankle;
  p[side + 'Knee'] = solveTwoBone(p[side + 'Hip'], ankle, 0.43, 0.43, pole);
  p[side + 'Heel'] = add(ankle, [0, -0.065, backward ? 0.07 : -0.07]);
  p[side + 'Toe'] = add(ankle, [0, -0.065, backward ? -0.16 : 0.16]);
}
function arm(p: Points, side: string, wrist: Vec3, pole: Vec3 = [0, 0, -1]) {
  p[side + 'Wrist'] = wrist;
  p[side + 'Elbow'] = solveTwoBone(p[side + 'Shoulder'], wrist, 0.32, 0.3, pole);
}
function poseFor(id: ExerciseId, t: number, range: number): Points {
  const a = cycle(t) * range,
    p: Points = {};
  if (id === 'pushup' || id === 'plank') {
    const theta = id === 'plank' ? Math.asin((0.355 - 0.09) / 1.36) : 0.41 - 0.32 * a,
      up: Vec3 = [0, Math.sin(theta), Math.cos(theta)];
    torso(p, add([0, 0.09, -0.9], scale(up, 0.86)), up);
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      leg(p, side, [s * 0.12, 0.09, -0.9], [0, 1, 0], true);
      if (id === 'plank') {
        p[side + 'Elbow'] = add(p[side + 'Shoulder'], [0, -0.32, 0]);
        p[side + 'Wrist'] = add(p[side + 'Elbow'], [0, 0, 0.3]);
      } else arm(p, side, [s * 0.25, 0.035, 0.46], [s, 0, -0.6]);
    }
    return p;
  }
  if (id === 'bridge') {
    // Upper torso stays against the floor; hips extend while feet remain planted.
    const hipY = 0.18 + 0.26 * a,
      neckY = 0.15,
      theta = Math.asin((hipY - neckY) / 0.62),
      up: Vec3 = [0, -Math.sin(theta), -Math.cos(theta)];
    const root: Vec3 = [0, hipY, -0.5 + 0.62 * Math.cos(theta)];
    torso(p, root, up);
    p.head = add(p.neck, [0, -0.025, -Math.sqrt(0.15 ** 2 - 0.025 ** 2)]);
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      leg(p, side, [s * 0.12, 0.09, 0.58], [0, 1, 0]);
      arm(p, side, add(p[side + 'Shoulder'], [s * 0.12, 0.03, 0.57]), [0, 0.2, 1]);
    }
    return p;
  }
  if (id === 'pullup') {
    torso(p, [0, 0.96 + 0.4 * a, 0], [0, 1, 0]);
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      leg(p, side, [s * 0.12, 0.1 + 0.4 * a, 0]);
      arm(p, side, [s * 0.29, 2.03, 0.02], [s, 0, 0.2]);
    }
    return p;
  }
  if (id === 'row') {
    torso(p, [0, 0.85, -0.08], [0, 0.5, 0.866]);
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      leg(p, side, [s * 0.12, 0.09, side === 'left' ? -0.2 : 0.1]);
    }
    arm(p, 'left', add(p.leftShoulder, [0, -0.58 + 0.32 * a, -0.22 * a]), [0, 0, -1]);
    arm(p, 'right', add(p.rightShoulder, [0.05, -0.5, -0.15]), [1, 0, 0]);
    return p;
  }
  if (id === 'lunge') {
    const step = t < 0.2 ? smooth(t / 0.2) : t > 0.8 ? 1 - smooth((t - 0.8) / 0.2) : 1;
    const lower =
      t < 0.45 ? smooth((t - 0.2) / 0.25) : t <= 0.55 ? 1 : 1 - smooth((t - 0.55) / 0.25);
    const lift =
      t < 0.2
        ? Math.sin((Math.PI * t) / 0.2) * 0.12
        : t > 0.8
          ? Math.sin((Math.PI * (t - 0.8)) / 0.2) * 0.12
          : 0;
    torso(p, [0, 0.95 - 0.2 * step - 0.21 * lower * range, -0.1 * step], [0, 1, 0]);
    leg(p, 'left', [-0.12, 0.09, 0]);
    leg(p, 'right', [0.12, 0.09 + lift, -0.55 * step]);
    for (const side of ['left', 'right'])
      arm(p, side, add(p[side + 'Shoulder'], [0, -0.6, 0]), [0, 0, 1]);
    return p;
  }
  torso(
    p,
    id === 'squat' ? [0, 0.95 - 0.39 * a, -0.23 * a] : [0, 0.95, 0],
    id === 'squat' ? [0, 1, 0.45 * a] : [0, 1, 0],
  );
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? -1 : 1;
    leg(p, side, [s * 0.12, 0.09, 0]);
    if (id === 'lateral') {
      const angle = a * 1.48;
      const shoulder = p[side + 'Shoulder'];
      arm(
        p,
        side,
        add(shoulder, [s * 0.61 * Math.sin(angle), -0.61 * Math.cos(angle), 0]),
        [0, 0, 1],
      );
    } else if (id === 'squat')
      arm(p, side, add(p[side + 'Shoulder'], [0, -0.48 + 0.3 * a, 0.12 + 0.38 * a]), [0, 0, -1]);
    else arm(p, side, add(p[side + 'Shoulder'], [0, -0.6, 0]), [0, 0, 1]);
  }
  return p;
}
export function createExercise(id: ExerciseId, options: ExerciseOptions = {}): MotionClip {
  if (!exerciseIds.includes(id)) throw new Error(`Unknown exercise: ${id}`);
  const range = options.range ?? 1;
  if (!Number.isFinite(range) || range < 0.25 || range > 1)
    throw new Error('Range must be between 0.25 and 1');
  const durationMs = options.durationMs ?? (id === 'plank' ? 5000 : 4000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Duration must be positive');
  const rig = createRig(),
    frames = Array.from({ length: 121 }, (_, i) =>
      frameFromPoints(rig, poseFor(id, i / 120, range), i / 120),
    );
  const contacts: Contact[] = [],
    equipment: Equipment[] = [];
  const first = poseFor(id, 0, range);
  const contact = (joint: string, pole: Vec3) =>
    contacts.push({ joint, target: first[joint], pole, start: 0, end: 1 });
  if (['squat', 'row', 'lateral', 'bridge', 'lunge'].includes(id))
    for (const side of ['left', 'right']) {
      if (id !== 'lunge' || side === 'left')
        contact(side + 'Ankle', id === 'bridge' ? [0, 1, 0] : [0, 0, 1]);
    }
  if (id === 'pushup' || id === 'plank')
    for (const side of ['left', 'right']) {
      contact(side + 'Ankle', [0, 1, 0]);
      contact(side + 'Wrist', id === 'plank' ? [0, -1, 0] : [side === 'left' ? -1 : 1, 0, -0.6]);
    }
  if (id === 'pullup') {
    for (const side of ['left', 'right'])
      contact(side + 'Wrist', [side === 'left' ? -1 : 1, 0, 0.2]);
    equipment.push({
      id: 'pull-up-bar',
      kind: 'bar',
      position: [0, 2.03, 0.02],
      size: [1.05, 0.02, 0.02],
    });
  }
  if (id === 'row' || id === 'lateral')
    for (const side of id === 'row' ? ['left'] : ['left', 'right'])
      equipment.push({
        id: side + '-dumbbell',
        kind: 'dumbbell',
        anchor: side + 'Wrist',
        size: [0.15, 0.11, 0.05],
      });
  let clip: MotionClip = {
    schemaVersion: 1,
    id,
    name: names[id],
    rig,
    durationMs,
    loop: true,
    frames,
    contacts,
    equipment,
    camera: { view: ['lateral', 'pullup'].includes(id) ? 'front' : 'side' },
    source: {
      type: 'procedural',
      recipe: { id, version: 1, parameters: { side: options.side ?? 'left', range, durationMs } },
    },
    phases:
      id === 'lunge'
        ? [
            { id: 'step-back', label: 'Step back', start: 0, end: 0.2 },
            { id: 'descent', label: 'Lower with control', start: 0.2, end: 0.45 },
            { id: 'bottom', label: 'Bottom position', start: 0.45, end: 0.55 },
            { id: 'ascent', label: 'Rise with control', start: 0.55, end: 0.8 },
            { id: 'return', label: 'Step forward', start: 0.8, end: 1 },
          ]
        : id === 'plank'
          ? [{ id: 'hold', label: 'Hold and breathe', start: 0, end: 1 }]
          : [
              {
                id: 'outbound',
                label: ['squat', 'pushup', 'lunge'].includes(id)
                  ? 'Lower with control'
                  : 'Lift with control',
                start: 0,
                end: 0.45,
              },
              {
                id: 'bottom',
                label: ['squat', 'pushup', 'lunge'].includes(id)
                  ? 'Bottom position'
                  : 'Peak position',
                start: 0.45,
                end: 0.55,
              },
              { id: 'return', label: 'Return with control', start: 0.55, end: 1 },
            ],
  };
  if (options.side === 'right') clip = mirrorClip(clip);
  return clip;
}
export const exercises: Record<ExerciseId, MotionClip> = Object.fromEntries(
  exerciseIds.map((id) => [id, createExercise(id)]),
) as Record<ExerciseId, MotionClip>;
