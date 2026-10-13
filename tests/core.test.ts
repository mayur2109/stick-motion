import { describe, expect, it } from 'vitest';
import {
  motionViewBox,
  forwardKinematics,
  solveTwoBone,
  length,
  sub,
  sampleMotion,
  validateMotion,
  createPlayer,
  projectPose,
  renderSvg,
} from '../src/index.js';
import { createExercise, exerciseIds } from '../src/exercises/index.js';

describe('rig and constraints', () => {
  it('solves a reachable contact without changing segment lengths', () => {
    const bend = solveTwoBone([0, 0, 0], [0, 1, 0], 0.8, 0.7, [1, 0, 0]);
    expect(length(bend)).toBeCloseTo(0.8, 8);
    expect(length(sub(bend, [0, 1, 0]))).toBeCloseTo(0.7, 8);
    expect(bend[0]).toBeGreaterThan(0);
  });
  it('rejects unreachable contacts', () => {
    expect(() => solveTwoBone([0, 0, 0], [0, 3, 0], 1, 1, [1, 0, 0])).toThrow(/unreachable/i);
  });
  for (const id of [
    'squat',
    'pushup',
    'lunge',
    'bridge',
    'pullup',
    'row',
    'lateral',
    'plank',
  ] as const) {
    it(`${id} remains connected, grounded, and loop-compatible at interpolated times`, () => {
      const clip = createExercise(id);
      expect(validateMotion(clip).errors).toEqual([]);
      for (let i = 0; i <= 61; i++) {
        const pose = sampleMotion(clip, (clip.durationMs * i) / 61);
        for (const j of clip.rig.joints)
          if (j.parent) {
            expect(length(sub(pose.joints[j.id], pose.joints[j.parent]))).toBeCloseTo(
              length(j.offset),
              5,
            );
          }
        for (const contact of clip.contacts ?? []) {
          const t = i / 61;
          if (t >= contact.start && t <= contact.end)
            expect(length(sub(pose.joints[contact.joint], contact.target))).toBeLessThan(0.001);
        }
        expect(Math.min(...Object.values(pose.joints).map((p) => p[1]))).toBeGreaterThanOrEqual(
          -0.025,
        );
      }
      const first = sampleMotion(clip, 0),
        last = sampleMotion(clip, clip.durationMs);
      for (const joint of clip.rig.joints)
        expect(length(sub(first.joints[joint.id], last.joints[joint.id]))).toBeLessThan(0.001);
    });
  }
  it('contains eight distinct exercises, with a complete squat and static hold', () => {
    expect(exerciseIds).toHaveLength(8);
    const c = createExercise('squat');
    expect(sampleMotion(c, c.durationMs / 2).joints.pelvis[1]).toBeLessThan(
      sampleMotion(c, 0).joints.pelvis[1] - 0.25,
    );
    const hold = createExercise('plank');
    expect(sampleMotion(hold, 0).joints).toEqual(sampleMotion(hold, 2500).joints);
  });
  it('mirrors both joint identity and world position for unilateral movement', () => {
    const l = sampleMotion(createExercise('lunge', { side: 'left' }), 2000);
    const r = sampleMotion(createExercise('lunge', { side: 'right' }), 2000);
    expect(l.joints.leftAnkle[2]).toBeCloseTo(r.joints.rightAnkle[2]);
    expect(l.joints.leftAnkle[0]).toBeCloseTo(-r.joints.rightAnkle[0]);
  });
  it('lifts the stepping foot in a reverse lunge and keeps a bridge head above the floor', () => {
    const lunge = createExercise('lunge');
    expect(sampleMotion(lunge, 400).joints.rightToe[1]).toBeGreaterThan(0.05);
    const bridge = createExercise('bridge');
    expect(sampleMotion(bridge, 2000).joints.head[1]).toBeGreaterThanOrEqual(0.1);
  });
  it('rejects malformed JSON, timestamps, missing tracks, and incompatible loops', () => {
    expect(validateMotion({}).errors.length).toBeGreaterThan(0);
    const c = createExercise('squat');
    c.frames[1].t = -1;
    expect(validateMotion(c).errors.join(' ')).toMatch(/time|sorted/i);
    const d = createExercise('squat');
    delete d.frames[0].rotations.leftKnee;
    expect(validateMotion(d).errors.join(' ')).toMatch(/rotation/i);
    const e = createExercise('squat');
    e.frames.at(-1)!.root[0] += 1;
    expect(validateMotion(e).errors.join(' ')).toMatch(/loop/i);
  });
  it('projects and serializes data without exercise-specific drawing code', () => {
    const clip = createExercise('row');
    const pose = sampleMotion(clip, 2000);
    expect(projectPose(pose, { view: 'side' }).joints.leftWrist).toHaveLength(3);
    expect(renderSvg(pose, { view: 'side' }, { title: 'A < row' })).toContain('A &lt; row');
  });
  it('fits the whole clip once instead of reframing each animation frame', () => {
    const clip = createExercise('pushup');
    const [x, y, width, height] = motionViewBox(clip, { view: 'side' }).split(' ').map(Number);
    expect(height).toBeLessThan(1.6);
    for (let i = 0; i <= 20; i++)
      for (const point of Object.values(
        projectPose(sampleMotion(clip, i * 200), { view: 'side' }).joints,
      )) {
        expect(point[0]).toBeGreaterThan(x);
        expect(point[0]).toBeLessThan(x + width);
        expect(point[1]).toBeGreaterThan(y);
        expect(point[1]).toBeLessThan(y + height);
      }
  });
});

describe('monotonic playback', () => {
  it('seeks, pauses, changes speed continuously, loops, and exposes phases', () => {
    let now = 0;
    const p = createPlayer(createExercise('squat'), () => now);
    p.play();
    now = 1000;
    expect(p.getState().timeMs).toBe(1000);
    p.setSpeed(2);
    now = 1500;
    expect(p.getState().timeMs).toBe(2000);
    expect(p.getState().phase?.id).toBe('bottom');
    p.pause();
    now = 2000;
    expect(p.getState().timeMs).toBe(2000);
    p.seek(0.25);
    expect(p.getState().progress).toBe(0.25);
    p.play();
    now = 4000;
    expect(p.getState().timeMs).toBe(1000);
    p.restart();
    expect(p.getState().timeMs).toBe(0);
  });
  it('stops at the end of a non-looping clip', () => {
    let now = 0;
    const c = createExercise('squat');
    c.loop = false;
    const p = createPlayer(c, () => now);
    p.play();
    now = 5000;
    expect(p.getState()).toMatchObject({ playing: false, timeMs: 4000, progress: 1 });
  });
});

it('exposes contact-resolved transforms, provenance, and structured diagnostics', () => {
  const clip = createExercise('pushup');
  const pose = sampleMotion(clip, 1900);
  expect(clip.rig.version).toBe(1);
  expect(clip.source.recipe?.version).toBe(1);
  expect(pose.root).toEqual(pose.joints.pelvis);
  const points = forwardKinematics(clip.rig, { t: 0, root: pose.root, rotations: pose.rotations });
  for (const id of Object.keys(points))
    expect(length(sub(points[id], pose.joints[id]))).toBeLessThan(1e-6);
  expect(validateMotion({ schemaVersion: 99 }).findings[0]).toMatchObject({
    category: 'structural',
    severity: 'error',
    code: 'unsupported-schema',
  });
  expect(renderSvg(pose)).toContain('data-bone="head"');
  expect(createExercise('lunge').phases?.map((p) => p.id)).toEqual([
    'step-back',
    'descent',
    'bottom',
    'ascent',
    'return',
  ]);
});

it('holds a forearm plank with elbows and wrists grounded', () => {
  const p = sampleMotion(createExercise('plank'), 2500);
  for (const side of ['left', 'right']) {
    expect(p.joints[side + 'Elbow'][1]).toBeCloseTo(0.035, 3);
    expect(p.joints[side + 'Wrist'][1]).toBeCloseTo(0.035, 3);
  }
});

it('preserves authored axial rotation when sampling resolved transforms', () => {
  const c = createExercise('squat');
  c.contacts = [];
  const q: [number, number, number, number] = [0, Math.sin(0.3), 0, Math.cos(0.3)];
  for (const f of c.frames) f.rotations.pelvis = q;
  for (const [i, v] of sampleMotion(c, 1234).rotations.pelvis.entries())
    expect(v).toBeCloseTo(q[i], 12);
});
