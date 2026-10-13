# Stick Motion

A code-first library for 3D stick-figure movement: procedural exercises, SVG playback, local video extraction, and deterministic MP4 export. **No API keys, credits, paid inference, or server upload are required.**

## Install

```sh
npm install stick-motion
# For React playback:
npm install react react-dom
# For MP4 export; also install FFmpeg through your OS:
npm install sharp
```

The core has no runtime dependencies. React and Sharp are optional peers. Pose processing is an explicit, separate browser entry point with a bundled worker and separately downloaded model/WASM assets.

## React

```tsx
'use client';
import { MotionPlayer } from 'stick-motion/react';
import { exercises } from 'stick-motion/exercises';

export function Demo() {
  return <MotionPlayer clip={exercises.squat} camera={{ view: 'side' }} />;
}
```

Controls provide play/pause, restart, seeking, phase labels, and 0.25×–2× speed. Playback starts paused by default, respects reduced motion for autoplay, and suspends offscreen or in background tabs. Use `controls={false}` for a generated still. CSS variables: `--motion-color`, `--motion-head`, `--motion-floor`, `--motion-equipment`.

## Framework-independent playback

```js
import { createPlayer, sampleMotion, renderSvg } from 'stick-motion';
import { createExercise } from 'stick-motion/exercises';

const clip = createExercise('lunge', { side: 'right', durationMs: 5000 });
const player = createPlayer(clip);
player.play();
function draw() {
  const { timeMs } = player.getState();
  document.querySelector('#motion').innerHTML = renderSvg(sampleMotion(clip, timeMs), clip.camera, {
    title: clip.name,
  });
  requestAnimationFrame(draw);
}
draw();
```

The host owns visibility handling for framework-independent playback. `sampleMotion` clamps times to the clip; looping belongs to the player. `seek` takes progress from 0 to 1. `setSpeed` accepts a multiplier from 0.25 to 2.

## Procedural exercises

Available IDs: `squat`, `pushup`, `lunge`, `bridge`, `pullup`, `row`, `lateral`, `plank`. Dynamic clips last four seconds and show the outward and return movement. Plank is a five-second stable hold. Options: `side`, `durationMs`, and `range` (0.25–1 of the recipe's movement range).

Recipes compose torso curves, analytic two-bone limb solvers, equipment anchors, and contact windows. They compile into serializable clips. To add a variation, reuse a recipe with different parameters. A new movement family adds a recipe and tests, **never a renderer branch**. Compare generated motion against an appropriate reference through the whole repetition. Automated checks establish structural consistency, not coaching certification.

## Motion format

`MotionClip` schema version 1 contains a rig, sorted normalized frame times, a world root position, local quaternion rotations, duration, loop flag, and optional phases, contacts, equipment and camera. See [the public types](https://github.com/mayur2109/stick-motion/blob/main/src/core/types.ts).

Coordinates are right-handed: X horizontal, Y up, Z toward the front. Quaternions use `[x,y,z,w]`. Each incoming bone applies `parentWorld × localRotation × restOffset`; bone offsets have fixed lengths. This convention is deliberately explicit for future adapters to conventional animation rigs. Distances and root translation use meters; camera angles use radians. `rig.version` identifies the rig revision (omitted versions are treated as legacy v1). Frame `t` is normalized clip-relative time, strictly increasing from 0 to 1; duplicate timestamps are invalid. Unsupported schema versions are rejected without automatic migration. The sampler clamps finite times to the clip endpoints; the player implements looping.

`sampleMotion` interpolates root translation and quaternion rotations, performs forward kinematics, then resolves declared two-bone endpoint contacts. A contact pole is a world-space **direction** controlling the bend. Impossible contacts throw instead of stretching bones. Equipment is a separate layer; dumbbells attach to wrists and bars use world positions.

Complete minimal JSON (a simple two-joint motion, rather than an exercise):

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example bone rotation",
  "rig": {
    "id": "two-bones",
    "joints": [
      { "id": "root", "parent": null, "offset": [0, 0, 0] },
      { "id": "tip", "parent": "root", "offset": [0, 1, 0] }
    ]
  },
  "durationMs": 1000,
  "loop": false,
  "frames": [
    { "t": 0, "root": [0, 0, 0], "rotations": { "root": [0, 0, 0, 1], "tip": [0, 0, 0, 1] } },
    {
      "t": 1,
      "root": [0, 0, 0],
      "rotations": { "root": [0, 0, 0, 1], "tip": [0, 0, 0.7071067812, 0.7071067812] }
    }
  ],
  "source": { "type": "procedural" }
}
```

Always call `validateMotion(unknownJson)` before rendering imported JSON. It returns `{ valid, errors, warnings }` and never edits its input. Diagnostics retain `errors` and `warnings` and add structured `findings` with category, severity, code and available joint/field/time context. `visualReview` is always `not-assessed`; numerical validation never grants a visual certification. Sampled poses expose root translation, resolved local rotations, world rotations and joint positions after contacts. Generated clips retain recipe version and parameters; imported clips retain processing provenance.

## Local video import

```js
import { importVideo } from 'stick-motion/video';

const { clip, raw, diagnostics } = await importVideo(file, {
  start: 0,
  end: 4,
  workerUrl: '/assets/worker.js',
  assetsUrl: '/assets',
  signal: controller.signal,
  onCapture: (raw) => saveRawLocally(raw), // called before fitting, even if fitting fails
  onProgress: (fraction) => console.log(fraction),
});
```

Copy `stick-motion/video/worker.js` into your static assets directory. Serve the pinned model plus matching WASM files locally; the playground's `scripts/download-assets.mjs` demonstrates provisioning and checksum verification. CSP must allow your own worker, WASM compilation, and local `blob:` video URLs. No camera/microphone access is requested.

Use a browser-decodable MP4/WebM, a steady camera, one full visible person, and a 0.1–30 second segment. Sampling is 30 fps at a maximum 1280×720 resolution. The worker uses the CPU delegate, but MediaPipe image preprocessing still requires worker WebGL. Capability detection reports an actionable error when it is unavailable; this Linux WebKit test runtime cannot perform extraction. Playback remains supported in WebKit. `minConfidence` defaults to 0.5; `maxGapMs` defaults to 100 (maximum 250); smoothing can be disabled for reprocessing. `processLandmarks(raw, settings)` reruns cleanup without another inference pass.

Raw capture preserves absent presence scores; fitting uses visibility when presence is unavailable and reports that limitation. Short-gap interpolation is reported separately and never edits raw data. Save `raw` separately: it retains model identity, resolution, sample timing and original confidence. The fitted clip has fixed bone lengths, smoothed tracks and estimated image-space root travel. Long gaps and multiple people fail with diagnostics. Imported clips default to non-looping and contain no invented exercise phases or equipment. A single camera cannot recover true world travel, occluded anatomy, or accurate depth; alternative views are illustrative. Review the source and stick figure together. Correct settings or footage, not individual hand-drawn frames.

## MP4 export

```sh
npx stick-motion generate squat --output squat.json
npx stick-motion validate squat.json
npx stick-motion export squat.json --output squat.mp4
```

Defaults: silent 720×720 H.264/yuv420p, 30 fps, opaque background. SVG frames are sampled at exact times and rasterized by Sharp before FFmpeg encodes them. Frame count is `ceil(durationSeconds × fps)`, timestamp `frameIndex / fps`; encoded duration is `frameCount / fps`. Square outputs contain the complete SVG framing. Encoding uses a temporary output and exclusive final copy; existing output files are not overwritten. Exports accept up to 30 seconds and even dimensions up to 4096. The API `exportMp4` also accepts camera, background, and `ffmpegPath` options. Rendering is independent of browser wall-clock timing.

## Development and playground

Use Node 24, npm, and FFmpeg:

```sh
npm ci
npm run build
npm run assets
npm run dev
# Stable preview on port 4174, isolated from development rebuilds:
npm run preview
```

`npm run assets` downloads a pinned model and an attributed test video once, verifies checksums, and copies the worker/WASM runtime. The downloaded binaries are ignored by Git and excluded from npm. The playground works from local assets after setup.

```sh
npm run format
npm run check
npm run test:package
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

CI checks formatting, lint, TypeScript, motion and importer behavior, a real MP4 encode, production builds, a clean package install, browser behavior and real-video extraction. Changes to motion rules require full-repetition visual review in addition to tests. See [third-party notices](NOTICE.md).

## Boundaries

V1 supports one stick figure, a small equipment vocabulary, orthographic SVG views, and local capture. Physics, collisions, multi-person tracking, automatic exercise recognition, automatic equipment capture, and browser video encoding are future modules. The core exposes rig geometry and sampled 3D transforms for those adapters without depending on them.
