import type { Vec3, MotionClip, Rig } from '../core/types.js';
import type { RawCapture, Landmark, ImportSettings } from './types.js';
import { add, sub, scale, length, normalize, lerp } from '../core/math.js';
import { frameFromPoints } from '../core/motion.js';
import { validateMotion } from '../core/validate.js';
const mapping: Record<string, number> = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
};
const required = [7, 8, ...Object.values(mapping)];
const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
export function validateSegment(start: number, end: number, duration: number) {
  if (
    ![start, end, duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > duration + 0.001
  )
    throw new Error('Select a valid start and end segment');
  if (end - start > 30) throw new Error('Select a segment of at most 30 seconds');
  if (end - start < 0.1) throw new Error('Select a segment of at least 0.1 seconds');
}
export function processLandmarks(raw: RawCapture, settings: ImportSettings = {}) {
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.frames) ||
    typeof raw.model !== 'string' ||
    !Number.isFinite(raw.sampleFps) ||
    raw.sampleFps <= 0
  )
    throw new Error('Invalid capture schema or sampling settings');
  const observations: import('../core/types.js').MotionFinding[] = [];
  validateSegment(raw.startMs / 1000, raw.endMs / 1000, raw.endMs / 1000);
  if (
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0 ||
    raw.frames.length < 2 ||
    raw.frames.length > 901
  )
    throw new Error('Invalid capture dimensions or frame count');
  const threshold = settings.minConfidence ?? raw.settings?.minConfidence ?? 0.5,
    maxGap = settings.maxGapMs ?? raw.settings?.maxGapMs ?? 100;
  if (
    threshold < 0 ||
    threshold > 1 ||
    !Number.isFinite(threshold) ||
    maxGap < 0 ||
    maxGap > 250 ||
    !Number.isFinite(maxGap)
  )
    throw new Error('Invalid confidence or gap settings');
  if (raw.frames.some((f) => f.people > 1)) throw new Error('Use footage with exactly one person');
  if (raw.frames.every((f) => f.people === 0)) throw new Error('No person detected');
  if (
    raw.frames.some(
      (f) =>
        !f ||
        !Number.isInteger(f.people) ||
        f.people < 0 ||
        f.people > 2 ||
        !Array.isArray(f.world) ||
        !Array.isArray(f.landmarks),
    )
  )
    throw new Error('Invalid capture frame');
  if (raw.frames[0].timeMs < raw.startMs || raw.frames.at(-1)!.timeMs > raw.endMs + 0.001)
    throw new Error('Capture timestamps lie outside the selected segment');
  let prev = -Infinity;
  for (const f of raw.frames) {
    if (!Number.isFinite(f.timeMs) || f.timeMs <= prev)
      throw new Error('Capture timestamps must increase');
    prev = f.timeMs;
  }
  const clean = (key: 'world' | 'landmarks') => {
    const frames = raw.frames.map((f) => (f[key] ?? []).map((p) => ({ ...p })));
    for (const index of required) {
      const valid = (i: number) => {
        const p = frames[i][index];
        return (
          raw.frames[i].people === 1 &&
          p &&
          [p.x, p.y, p.z, p.visibility].every(Number.isFinite) &&
          (p.presence === undefined || Number.isFinite(p.presence)) &&
          p.visibility >= threshold &&
          (p.presence === undefined || p.presence >= threshold)
        );
      };
      for (let i = 0; i < frames.length; i++)
        if (!valid(i)) {
          const first = i;
          while (i < frames.length && !valid(i)) i++;
          const left = first - 1,
            right = i;
          if (
            left < 0 ||
            right >= frames.length ||
            raw.frames[right - 1].timeMs - raw.frames[first].timeMs + 1000 / raw.sampleFps >
              maxGap + 0.001
          )
            throw new Error(
              `Tracking confidence lost near ${(raw.frames[first].timeMs / 1000).toFixed(2)}s; trim or use a clearer video`,
            );
          observations.push({
            category: 'observation',
            severity: 'warning',
            code: 'interpolated-gap',
            message: `Interpolated ${key} landmark ${index} across a short gap`,
            field: `${key}.${index}`,
            timeMs: raw.frames[first].timeMs,
          });
          for (let k = first; k < right; k++) {
            const t =
                (raw.frames[k].timeMs - raw.frames[left].timeMs) /
                (raw.frames[right].timeMs - raw.frames[left].timeMs),
              a = frames[left][index],
              b = frames[right][index];
            frames[k][index] = {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t,
              visibility: threshold,
              presence: threshold,
            };
          }
        }
    }
    if (settings.smoothing === false) return frames;
    return frames.map((frame, i) =>
      frame.map((p, j) => {
        if (!required.includes(j) || i === 0 || i === frames.length - 1) return p;
        const a = frames[i - 1][j],
          b = frames[i + 1][j];
        return {
          ...p,
          x: (a.x + 2 * p.x + b.x) / 4,
          y: (a.y + 2 * p.y + b.y) / 4,
          z: (a.z + 2 * p.z + b.z) / 4,
        };
      }),
    );
  };
  const world = clean('world'),
    image = clean('landmarks');
  const v = (p: Landmark): Vec3 => [p.x, -p.y, -p.z],
    mid = (a: Landmark, b: Landmark) => lerp(v(a), v(b), 0.5);
  const scaleFactor =
    0.5 / median(world.map((f) => length(sub(mid(f[11], f[12]), mid(f[23], f[24])))));
  if (!Number.isFinite(scaleFactor) || scaleFactor < 0.1 || scaleFactor > 10)
    throw new Error('Cannot estimate body scale from this capture');
  const aspect = raw.width / raw.height;
  const imageTorso = median(
    image.map((f) => {
      const shoulders = mid(f[11], f[12]),
        hips = mid(f[23], f[24]);
      return Math.hypot((shoulders[0] - hips[0]) * aspect, shoulders[1] - hips[1]);
    }),
  );
  if (imageTorso < 0.015)
    throw new Error('Person is too small or foreshortened; use a closer, clearer view');
  const imageScale = 0.5 / imageTorso,
    firstHip = mid(image[0][23], image[0][24]);
  const firstRootY =
    median([23, 24].map((j) => v(world[0][j])[1])) -
    Math.min(...[27, 28, 29, 30, 31, 32].map((j) => v(world[0][j])[1]));
  const points = world.map((f, i) => {
    const hip = mid(f[23], f[24]),
      ip = mid(image[i][23], image[i][24]);
    const root: Vec3 = [
      (ip[0] - firstHip[0]) * aspect * imageScale,
      firstRootY * scaleFactor + (ip[1] - firstHip[1]) * imageScale,
      0,
    ];
    const p: Record<string, Vec3> = { pelvis: root };
    for (const [id, j] of Object.entries(mapping))
      p[id] = add(root, scale(sub(v(f[j]), hip), scaleFactor));
    p.chest = lerp(p.leftShoulder, p.rightShoulder, 0.5);
    p.spine = lerp(root, p.chest, 0.46);
    p.neck = add(p.chest, scale(normalize(sub(p.chest, root)), 0.12));
    p.head = add(root, scale(sub(mid(f[7], f[8]), hip), scaleFactor));
    return p;
  });
  const hierarchy: [string, string | null][] = [
    ['pelvis', null],
    ['spine', 'pelvis'],
    ['chest', 'spine'],
    ['neck', 'chest'],
    ['head', 'neck'],
  ];
  for (const side of ['left', 'right'])
    hierarchy.push(
      [side + 'Hip', 'pelvis'],
      [side + 'Knee', side + 'Hip'],
      [side + 'Ankle', side + 'Knee'],
      [side + 'Heel', side + 'Ankle'],
      [side + 'Toe', side + 'Ankle'],
      [side + 'Shoulder', 'chest'],
      [side + 'Elbow', side + 'Shoulder'],
      [side + 'Wrist', side + 'Elbow'],
    );
  const rig: Rig = {
    id: 'captured-rig-v1',
    version: 1,
    joints: hierarchy.map(([id, parent]) => ({
      id,
      parent,
      offset: parent
        ? scale(
            normalize(sub(points[0][id], points[0][parent])),
            Math.max(0.01, median(points.map((p) => length(sub(p[id], p[parent]))))),
          )
        : [0, 0, 0],
    })),
  };
  const first = raw.frames[0].timeMs,
    last = raw.frames.at(-1)!.timeMs;
  const clip: MotionClip = {
    schemaVersion: 1,
    id: 'imported-motion',
    name: 'Imported motion',
    rig,
    durationMs: last - first,
    loop: false,
    frames: points.map((p, i) =>
      frameFromPoints(rig, p, (raw.frames[i].timeMs - first) / (last - first)),
    ),
    camera: { view: 'captured' },
    source: {
      type: 'video',
      model: raw.model,
      estimatedDepth: true,
      processing: {
        version: 1,
        minConfidence: threshold,
        maxGapMs: maxGap,
        smoothing: settings.smoothing !== false,
        startMs: raw.startMs,
        endMs: raw.endMs,
        sampleFps: raw.sampleFps,
      },
    },
  };
  const diagnostics = validateMotion(clip);
  if (raw.frames.some((f) => [...f.landmarks, ...f.world].some((p) => p.presence === undefined)))
    observations.push({
      category: 'observation',
      severity: 'warning',
      code: 'missing-presence',
      message:
        'Presence scores are unavailable for some observations; visibility scores were used.',
    });
  diagnostics.findings.push(...observations);
  diagnostics.warnings.push(...observations.map((f) => f.message));
  return { clip, diagnostics };
}
