import type { MotionClip, MotionDiagnostics } from './types.js';
import { sampleMotion, forwardKinematics } from './motion.js';
import { length, sub } from './math.js';
const finite = (v: unknown, n: number) =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));
export function validateMotion(value: unknown): MotionDiagnostics {
  const errors: string[] = [],
    warnings: string[] = [];
  const done = (): MotionDiagnostics => ({
    valid: !errors.length,
    errors,
    warnings,
    visualReview: 'not-assessed',
    findings: [
      ...errors.map((message) => ({
        category: (/contact|unreachable|jump|Loop/.test(message) ? 'kinematic' : 'structural') as
          'kinematic' | 'structural',
        severity: 'error' as const,
        code: message === 'Unsupported schema version' ? 'unsupported-schema' : 'invalid-motion',
        message,
        ...(/rotation (\w+)/.test(message) ? { joint: message.match(/rotation (\w+)/)![1] } : {}),
        ...(/jump at (\w+)/.test(message) ? { joint: message.match(/jump at (\w+)/)![1] } : {}),
        ...(/near ([\d.]+)ms/.test(message)
          ? { timeMs: Number(message.match(/near ([\d.]+)ms/)![1]) }
          : {}),
        field: message === 'Unsupported schema version' ? 'schemaVersion' : undefined,
      })),
      ...warnings.map((message) => ({
        category: 'observation' as const,
        severity: 'warning' as const,
        code: 'estimated-depth',
        message,
      })),
    ],
  });
  if (!value || typeof value !== 'object') {
    errors.push('Expected a motion object');
    return done();
  }
  const c = value as MotionClip;
  if (c.rig?.version !== undefined && (!Number.isInteger(c.rig.version) || c.rig.version < 1))
    errors.push('Invalid rig version');
  if (c.schemaVersion !== 1) errors.push('Unsupported schema version');
  if (typeof c.name !== 'string' || typeof c.id !== 'string')
    errors.push('Name and id are required');
  if (!Number.isFinite(c.durationMs) || c.durationMs <= 0) errors.push('Duration must be positive');
  if (typeof c.loop !== 'boolean') errors.push('Loop must be boolean');
  if (!c.rig || !Array.isArray(c.rig.joints) || !c.rig.joints.length)
    errors.push('Rig joints are required');
  if (!Array.isArray(c.frames) || c.frames.length < 2)
    errors.push('At least two frames are required');
  for (const key of ['phases', 'contacts', 'equipment'] as const)
    if (
      c[key] !== undefined &&
      (!Array.isArray(c[key]) || c[key].some((x) => !x || typeof x !== 'object'))
    )
      errors.push(`Invalid ${key} collection`);
  if (!c.source || !['video', 'procedural'].includes(c.source.type)) errors.push('Invalid source');
  if (
    c.camera &&
    (!['front', 'side', 'three-quarter', 'captured'].includes(c.camera.view) ||
      [c.camera.yaw, c.camera.elevation].some((x) => x !== undefined && !Number.isFinite(x)))
  )
    errors.push('Invalid camera');
  if (errors.length) return done();
  const seen = new Set<string>();
  c.rig.joints.forEach((j, i) => {
    if (!j || typeof j !== 'object') {
      errors.push(`Invalid joint at ${i}`);
      return;
    }
    if (
      !j ||
      typeof j.id !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(j.id) ||
      ['constructor', 'prototype', '__proto__'].includes(j.id) ||
      seen.has(j.id) ||
      !finite(j.offset, 3) ||
      (i === 0 ? j.parent !== null : !seen.has(j.parent!))
    )
      errors.push(`Invalid joint hierarchy at ${i}`);
    if (i > 0 && finite(j.offset, 3) && length(j.offset) < 1e-6)
      errors.push(`Zero length bone ${j.id}`);
    seen.add(j.id);
  });
  let previous = -1;
  c.frames.forEach((f, i) => {
    if (!f || !Number.isFinite(f.t) || f.t < 0 || f.t > 1 || f.t <= previous)
      errors.push(`Frame times must be sorted in 0..1 (${i})`);
    previous = f?.t;
    if (!finite(f?.root, 3)) errors.push(`Invalid root at frame ${i}`);
    for (const id of seen) {
      const q = f?.rotations?.[id];
      if (!finite(q, 4) || Math.abs(Math.hypot(...q) - 1) > 0.001)
        errors.push(`Missing or invalid rotation ${id} at frame ${i}`);
    }
  });
  if (c.frames[0]?.t !== 0 || c.frames.at(-1)?.t !== 1)
    errors.push('Frames must cover time 0 to 1');
  let end = 0;
  for (const p of c.phases ?? []) {
    if (
      typeof p.id !== 'string' ||
      typeof p.label !== 'string' ||
      !Number.isFinite(p.start) ||
      !Number.isFinite(p.end) ||
      p.start < end ||
      p.start < 0 ||
      p.end > 1 ||
      p.end <= p.start
    )
      errors.push('Invalid or overlapping phases');
    end = p.end;
  }
  for (const contact of c.contacts ?? []) {
    if (
      !seen.has(contact.joint) ||
      !finite(contact.target, 3) ||
      !finite(contact.pole, 3) ||
      !Number.isFinite(contact.start) ||
      !Number.isFinite(contact.end) ||
      contact.start < 0 ||
      contact.end > 1 ||
      contact.start > contact.end
    )
      errors.push('Invalid contact');
  }
  for (const e of c.equipment ?? [])
    if (
      typeof e.id !== 'string' ||
      !['bar', 'dumbbell', 'support'].includes(e.kind) ||
      !finite(e.size, 3) ||
      (e.anchor ? !seen.has(e.anchor) : !finite(e.position, 3)) ||
      (e.offset && !finite(e.offset, 3))
    )
      errors.push('Invalid equipment');
  if (errors.length) return done();
  try {
    if (c.loop) {
      const a = forwardKinematics(c.rig, c.frames[0]),
        b = forwardKinematics(c.rig, c.frames.at(-1)!);
      for (const id of seen)
        if (length(sub(a[id], b[id])) > 0.01) {
          errors.push('Loop endpoints are incompatible');
          break;
        }
    }
    let prior = sampleMotion(c, 0);
    for (let i = 1; i <= 120; i++) {
      const pose = sampleMotion(c, (c.durationMs * i) / 120);
      for (const id of seen)
        if (
          length(sub(pose.joints[id], prior.joints[id])) >
          Math.max(0.15, (c.durationMs / 120000) * 8)
        ) {
          errors.push(`Implausible jump at ${id} near ${((c.durationMs * i) / 120).toFixed(2)}ms`);
          break;
        }
      prior = pose;
    }
    if (c.loop) {
      const a = sampleMotion(c, 0),
        b = sampleMotion(c, c.durationMs);
      for (const id of seen)
        if (length(sub(a.joints[id], b.joints[id])) > 0.01) {
          errors.push('Loop endpoints are incompatible');
          break;
        }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (c.source?.type === 'video')
    warnings.push(
      'Depth and root travel are estimates from a single camera; this is not a form assessment.',
    );
  return done();
}
