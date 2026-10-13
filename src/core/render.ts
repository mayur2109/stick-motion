import type { Camera, MotionClip, Pose, Vec3 } from './types.js';
import { add } from './math.js';
import { sampleMotion } from './motion.js';
/** One framing for an entire clip, including constraints and equipment. */
export function motionViewBox(
  clip: MotionClip,
  camera: Camera = clip.camera ?? { view: 'three-quarter' },
): string {
  const points: Vec3[] = [];
  const times = new Set([
    ...clip.frames.map((f) => f.t),
    ...Array.from({ length: 241 }, (_, i) => i / 240),
    ...(clip.contacts ?? []).flatMap((c) => [c.start, c.end]),
  ]);
  for (const t of times) {
    const pose = sampleMotion(clip, t * clip.durationMs);
    points.push(...Object.values(projectPose(pose, camera).joints));
    for (const e of pose.equipment) {
      const center = add(e.anchor ? pose.joints[e.anchor] : e.position!, e.offset ?? [0, 0, 0]);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1])
            points.push(
              projectPoint(
                add(center, [(x * e.size[0]) / 2, (y * e.size[1]) / 2, (z * e.size[2]) / 2]),
                camera,
              ),
            );
    }
  }
  const margin = 0.17,
    minX = Math.min(...points.map((p) => p[0])) - margin,
    maxX = Math.max(...points.map((p) => p[0])) + margin,
    minY = Math.min(...points.map((p) => p[1])) - margin,
    maxY = Math.max(0.04, ...points.map((p) => p[1])) + margin;
  const width = Math.max(0.7, maxX - minX);
  return `${(minX + maxX - width) / 2} ${minY} ${width} ${maxY - minY}`;
}
export function projectPoint(p: Vec3, camera: Camera): Vec3 {
  const yaw =
    camera.yaw ??
    { front: 0, side: Math.PI / 2, 'three-quarter': Math.PI / 4, captured: 0 }[camera.view];
  const e = camera.elevation ?? 0.08,
    x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw),
    z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
  return [x, -(p[1] * Math.cos(e) - z * Math.sin(e)), p[1] * Math.sin(e) + z * Math.cos(e)];
}
export function projectPose(pose: Pose, camera: Camera = { view: 'three-quarter' }) {
  return {
    rig: pose.rig,
    equipment: pose.equipment,
    joints: Object.fromEntries(
      Object.entries(pose.joints).map(([id, p]) => [id, projectPoint(p, camera)]),
    ),
  };
}
export interface SvgOptions {
  title?: string;
  showJoints?: boolean;
  color?: string;
  background?: string;
  viewBox?: string;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
/** Shared SVG markup used by React and deterministic frame export. Fixed framing avoids rep-to-rep camera pumping. */
export function renderSvg(
  pose: Pose,
  camera: Camera = { view: 'three-quarter' },
  options: SvgOptions = {},
): string {
  const projected = projectPose(pose, camera),
    p = projected.joints;
  const line = (a: Vec3, b: Vec3, attrs = '') =>
    `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${attrs}/>`;
  const draw: { depth: number; svg: string }[] = [];
  for (const j of pose.rig.joints) {
    if (j.parent)
      draw.push({
        depth: (p[j.id][2] + p[j.parent][2]) / 2,
        svg: line(
          p[j.parent],
          p[j.id],
          `data-bone="${escape(j.id)}" opacity="${j.id.startsWith('right') ? 0.68 : 1}"`,
        ),
      });
  }
  for (const e of pose.equipment) {
    const a = add(e.anchor ? pose.joints[e.anchor] : e.position!, e.offset ?? [0, 0, 0]);
    const left = projectPoint(add(a, [-e.size[0] / 2, 0, 0]), camera),
      right = projectPoint(add(a, [e.size[0] / 2, 0, 0]), camera);
    let shape = line(left, right, 'stroke-width=".025"');
    if (e.kind === 'dumbbell')
      for (const s of [-1, 1]) {
        const x = add(a, [(s * e.size[0]) / 2, 0, 0]);
        shape += line(
          projectPoint(add(x, [0, -0.055, 0]), camera),
          projectPoint(add(x, [0, 0.055, 0]), camera),
          'stroke-width=".04"',
        );
      }
    draw.push({
      depth: (left[2] + right[2]) / 2,
      svg: `<g data-equipment="${escape(e.id)}" stroke="var(--motion-equipment, #4965db)">${shape}</g>`,
    });
  }
  draw.sort((a, b) => a.depth - b.depth);
  const head = p.head,
    headSvg = head
      ? `<circle data-joint="head" cx="${head[0]}" cy="${head[1]}" r=".095" fill="var(--motion-head, #faf9f6)"/>`
      : '';
  if (head) draw.push({ depth: head[2], svg: headSvg });
  draw.sort((a, b) => a.depth - b.depth);
  const debug = options.showJoints
    ? Object.entries(p)
        .map(
          ([id, v]) =>
            `<circle data-joint="${escape(id)}" cx="${v[0]}" cy="${v[1]}" r=".018" fill="#d44931" stroke="none"/>`,
        )
        .join('')
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escape(options.viewBox ?? '-1.25 -2.35 2.5 2.55')}" role="img" aria-label="${escape(options.title ?? 'Stick figure motion')}" width="100%" height="100%"><title>${escape(options.title ?? 'Stick figure motion')}</title><desc>A jointed stick figure demonstrating movement. Use playback controls to inspect the motion.</desc>${options.background ? `<rect x="-100" y="-100" width="200" height="200" fill="${escape(options.background)}"/>` : ''}<path d="M-1.12 .02H1.12" stroke="var(--motion-floor, #bcc3ce)" stroke-width=".008"/><g fill="none" stroke="${escape(options.color ?? 'var(--motion-color, currentColor)')}" stroke-width=".032" stroke-linecap="round" stroke-linejoin="round">${draw.map((d) => d.svg).join('')}${debug}</g></svg>`;
}
