import { expect, it } from 'vitest';
import { validateMotion } from '../src/index.js';
import { createExercise } from '../src/exercises/index.js';
it('returns diagnostics instead of crashing on untrusted JSON shapes', () => {
  const mutations = [
    { rig: { joints: [null] } },
    { frames: [null, null] },
    { phases: {} },
    { contacts: {} },
    { equipment: {} },
    { camera: { view: 'wrong' } },
    { source: null },
  ];
  for (const change of mutations) {
    const c = { ...createExercise('squat'), ...change };
    expect(() => validateMotion(c)).not.toThrow();
    expect(validateMotion(c).valid).toBe(false);
  }
});
