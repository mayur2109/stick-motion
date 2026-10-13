import type { Vec3, Quat } from './types.js';
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (v: Vec3) => Math.hypot(...v);
export const normalize = (v: Vec3): Vec3 =>
  length(v) > 1e-10 ? scale(v, 1 / length(v)) : [0, 1, 0];
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export const identity: Quat = [0, 0, 0, 1];
export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export function multiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function rotate(q: Quat, v: Vec3): Vec3 {
  const r = multiply(multiply(q, [...v, 0]), conjugate(q));
  return [r[0], r[1], r[2]];
}
export function fromTo(a: Vec3, b: Vec3): Quat {
  const u = normalize(a),
    v = normalize(b),
    d = dot(u, v);
  if (d < -0.999999) {
    const axis = normalize(cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    return [...axis, 0];
  }
  const c = cross(u, v),
    q: Quat = [...c, 1 + d],
    n = Math.hypot(...q);
  return q.map((x) => x / n) as Quat;
}
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a.reduce((s, v, i) => s + v * b[i], 0);
  if (d < 0) {
    b = b.map((x) => -x) as Quat;
    d = -d;
  }
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (b[i] - v) * t) as Quat,
      n = Math.hypot(...q);
    return q.map((x) => x / n) as Quat;
  }
  const theta = Math.acos(Math.min(1, d)),
    s = Math.sin(theta);
  return a.map((v, i) => (v * Math.sin((1 - t) * theta) + b[i] * Math.sin(t * theta)) / s) as Quat;
}
/** Pole is a world-space bend direction, not an absolute joint position. */
export function solveTwoBone(root: Vec3, target: Vec3, a: number, b: number, pole: Vec3): Vec3 {
  const delta = sub(target, root),
    d = length(delta);
  if (d > a + b + 1e-6 || d < Math.abs(a - b) - 1e-6 || d < 1e-8)
    throw new Error('Unreachable two-bone contact');
  const axis = normalize(delta),
    along = (a * a - b * b + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  let bend = sub(pole, scale(axis, dot(pole, axis)));
  if (length(bend) < 1e-6) bend = cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return add(root, add(scale(axis, along), scale(normalize(bend), height)));
}
