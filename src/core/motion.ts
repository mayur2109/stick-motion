import type { Contact, MotionClip, MotionFrame, Pose, Quat, Rig, Vec3 } from './types.js';
import {
  add,
  sub,
  length,
  multiply,
  conjugate,
  fromTo,
  identity,
  rotate,
  lerp,
  slerp,
  solveTwoBone,
} from './math.js';

/** Incoming-bone frames: parent transform × local rotation × rest offset. */
export function forwardKinematics(rig: Rig, frame: MotionFrame): Record<string, Vec3> {
  const points: Record<string, Vec3> = {},
    world: Record<string, Quat> = {};
  for (const joint of rig.joints) {
    world[joint.id] = multiply(
      joint.parent ? world[joint.parent] : identity,
      frame.rotations[joint.id],
    );
    points[joint.id] = joint.parent
      ? add(points[joint.parent], rotate(world[joint.id], joint.offset))
      : frame.root;
  }
  return points;
}
export function frameFromPoints(rig: Rig, points: Record<string, Vec3>, t: number): MotionFrame {
  const rotations: Record<string, Quat> = {},
    world: Record<string, Quat> = {};
  for (const joint of rig.joints) {
    world[joint.id] = joint.parent
      ? fromTo(joint.offset, sub(points[joint.id], points[joint.parent]))
      : identity;
    rotations[joint.id] = multiply(
      joint.parent ? conjugate(world[joint.parent]) : identity,
      world[joint.id],
    );
  }
  return { t, root: [...points[rig.joints[0].id]], rotations };
}
function constrain(rig: Rig, points: Record<string, Vec3>, contact: Contact) {
  const end = rig.joints.find((j) => j.id === contact.joint)!;
  const mid = rig.joints.find((j) => j.id === end.parent)!;
  if (!mid?.parent) throw new Error(`Contact ${contact.joint} requires a two-bone chain`);
  const bend = solveTwoBone(
    points[mid.parent],
    contact.target,
    length(mid.offset),
    length(end.offset),
    contact.pole,
  );
  const delta = sub(contact.target, points[end.id]);
  points[mid.id] = bend;
  points[end.id] = [...contact.target];
  const descendants = new Set([end.id]);
  for (const joint of rig.joints)
    if (joint.parent && descendants.has(joint.parent)) {
      points[joint.id] = add(points[joint.id], delta);
      descendants.add(joint.id);
    }
}
export function sampleMotion(clip: MotionClip, timeMs: number): Pose {
  if (!Number.isFinite(timeMs)) throw new Error('Time must be finite');
  const t = Math.max(0, Math.min(1, timeMs / clip.durationMs));
  let high = clip.frames.findIndex((f) => f.t >= t);
  if (high < 0) high = clip.frames.length - 1;
  const a = clip.frames[Math.max(0, high - 1)],
    b = clip.frames[high],
    u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const rotations: Record<string, Quat> = {};
  for (const j of clip.rig.joints) rotations[j.id] = slerp(a.rotations[j.id], b.rotations[j.id], u);
  const joints = forwardKinematics(clip.rig, { t, root: lerp(a.root, b.root, u), rotations });
  for (const c of clip.contacts ?? [])
    if (t >= c.start && t <= c.end) constrain(clip.rig, joints, c);
  const worldRotations: Record<string, Quat> = {},
    authoredWorld: Record<string, Quat> = {},
    resolvedRotations: Record<string, Quat> = {};
  for (const j of clip.rig.joints) {
    authoredWorld[j.id] = multiply(j.parent ? authoredWorld[j.parent] : identity, rotations[j.id]);
    worldRotations[j.id] = j.parent
      ? multiply(
          fromTo(rotate(authoredWorld[j.id], j.offset), sub(joints[j.id], joints[j.parent])),
          authoredWorld[j.id],
        )
      : authoredWorld[j.id];
    resolvedRotations[j.id] = multiply(
      j.parent ? conjugate(worldRotations[j.parent]) : identity,
      worldRotations[j.id],
    );
  }
  return {
    root: joints[clip.rig.joints[0].id],
    rotations: resolvedRotations,
    worldRotations,
    rig: clip.rig,
    joints,
    equipment: clip.equipment ?? [],
    phase: clip.phases?.find((p) => t >= p.start && (t < p.end || (t === 1 && p.end === 1))),
  };
}
export function mirrorClip(clip: MotionClip): MotionClip {
  const swap = (id: string) =>
    id.startsWith('left')
      ? 'right' + id.slice(4)
      : id.startsWith('right')
        ? 'left' + id.slice(5)
        : id;
  const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  return {
    ...clip,
    frames: clip.frames.map((frame) => {
      const pts = forwardKinematics(clip.rig, frame),
        mapped: Record<string, Vec3> = {};
      for (const [id, p] of Object.entries(pts)) mapped[swap(id)] = mirror(p);
      return frameFromPoints(clip.rig, mapped, frame.t);
    }),
    contacts: clip.contacts?.map((c) => ({
      ...c,
      joint: swap(c.joint),
      target: mirror(c.target),
      pole: mirror(c.pole),
    })),
    equipment: clip.equipment?.map((e) => ({
      ...e,
      anchor: e.anchor ? swap(e.anchor) : undefined,
      position: e.position ? mirror(e.position) : undefined,
      offset: e.offset ? mirror(e.offset) : undefined,
    })),
  };
}
