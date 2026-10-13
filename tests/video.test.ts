import { expect, it } from 'vitest';
import { processLandmarks, validateSegment } from '../src/video/process.js';
import type { RawCapture } from '../src/video/types.js';
import { createExercise } from '../src/exercises/index.js';
import { sampleMotion, validateMotion } from '../src/index.js';
function capture(): RawCapture {
  const clip = createExercise('squat');
  return {
    schemaVersion: 1,
    model: 'test',
    width: 720,
    height: 720,
    startMs: 0,
    endMs: 4000,
    sampleFps: 30,
    frames: Array.from({ length: 121 }, (_, i) => {
      const p = sampleMotion(clip, (i * 4000) / 120).joints;
      const ids: Record<number, string> = {
        7: 'head',
        8: 'head',
        11: 'leftShoulder',
        12: 'rightShoulder',
        13: 'leftElbow',
        14: 'rightElbow',
        15: 'leftWrist',
        16: 'rightWrist',
        23: 'leftHip',
        24: 'rightHip',
        25: 'leftKnee',
        26: 'rightKnee',
        27: 'leftAnkle',
        28: 'rightAnkle',
        29: 'leftHeel',
        30: 'rightHeel',
        31: 'leftToe',
        32: 'rightToe',
      };
      const world = Array.from({ length: 33 }, (_, j) => {
        const a = p[ids[j] ?? 'head'];
        return { x: a[0], y: -a[1], z: -a[2], visibility: 1, presence: 1 };
      });
      return {
        timeMs: (i * 4000) / 120,
        people: 1,
        world,
        landmarks: world.map((p) => ({ ...p, x: 0.5 + p.x / 2, y: 1 + p.y / 2 })),
      };
    }),
  };
}
it('fits a fixed rig, preserves root travel, and defaults to non-looping', () => {
  const raw = capture();
  const { clip, diagnostics } = processLandmarks(raw);
  expect(clip.loop).toBe(false);
  expect(clip.source.estimatedDepth).toBe(true);
  expect(diagnostics.errors).toEqual([]);
  expect(validateMotion(clip).valid).toBe(true);
  expect(sampleMotion(clip, 2000).joints.pelvis[1]).toBeLessThan(
    sampleMotion(clip, 0).joints.pelvis[1] - 0.25,
  );
  expect(raw.frames[0].world[11].visibility).toBe(1);
});
it('bridges only short confidence gaps, retaining raw data', () => {
  const raw = capture();
  raw.frames[30].world[15].visibility = 0;
  expect(processLandmarks(raw).diagnostics.errors).toEqual([]);
  expect(raw.frames[30].world[15].visibility).toBe(0);
  for (let i = 30; i < 50; i++) raw.frames[i].world[15].visibility = 0;
  expect(() => processLandmarks(raw)).toThrow(/tracking|confidence/i);
});
it('rejects absent or multiple people and bad segments', () => {
  const raw = capture();
  raw.frames[5].people = 2;
  expect(() => processLandmarks(raw)).toThrow(/one person/i);
  raw.frames.forEach((f) => (f.people = 0));
  expect(() => processLandmarks(raw)).toThrow(/person|tracking/i);
  expect(() => validateSegment(0, 31, 60)).toThrow(/30/);
  expect(() => validateSegment(4, 2, 5)).toThrow(/segment/i);
});
it('does not silently turn arbitrary footage into a loop', () => {
  const raw = capture();
  raw.frames = raw.frames.slice(0, 61);
  raw.endMs = 2000;
  const { clip } = processLandmarks(raw);
  expect(clip.loop).toBe(false);
  clip.loop = true;
  expect(validateMotion(clip).errors.join(' ')).toMatch(/loop/i);
});

it('preserves optional confidence and reports interpolated gaps and provenance', () => {
  const raw = capture();
  for (const f of raw.frames) for (const p of [...f.landmarks, ...f.world]) delete p.presence;
  raw.frames[30].world[15].visibility = 0;
  const result = processLandmarks(raw);
  expect(result.diagnostics.findings.some((f) => f.code === 'interpolated-gap')).toBe(true);
  expect(result.diagnostics.findings.some((f) => f.code === 'missing-presence')).toBe(true);
  expect(result.clip.source.processing?.minConfidence).toBe(0.5);
  expect(raw.frames[0].world[15].presence).toBeUndefined();
  expect(() => processLandmarks({ ...raw, schemaVersion: 99 } as unknown as RawCapture)).toThrow(
    /schema/i,
  );
});
