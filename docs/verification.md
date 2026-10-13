# Verification ledger

## Verified locally on 2026-10-13

- `npm run check`: Prettier, ESLint, strict TypeScript, 30 unit tests, library and playground production builds passed.
- `npm run test:package`: clean vanilla JavaScript, React SSR, all TypeScript entry points, client directive, asset exclusion and dependency isolation passed. Viewer bundle: 16,592 unminified bytes with React external.
- `npm run test:e2e`: 10 Chromium/WebKit scenarios passed. Chromium performed real MediaPipe inference. Linux WebKit cannot create worker WebGL; its extraction tests verify the actionable capability error, not successful inference.
- Real squat fixture: 3–4 second segment extracts at default confidence; full 0–4 second segment rejects unreliable observations and preserves raw capture.
- User-provided UHD burpee MP4: selection stayed intact, worker inference completed locally at 405×720; the default segment rejected confidence at its endpoint. The footage and raw capture are not distributed.
- MP4 test: 720×720, silent H.264, 30 frames / 1 second; decoded midpoint compared with the canonical raster (mean channel difference below 3). Existing outputs cannot be replaced, and missing FFmpeg is reported.
- Eight exercise sheets in [evidence](evidence/index.html) show five checkpoints in front, side and three-quarter views. Visual inspection corrected framing, neck connection and forearm plank. Foreshortened views overlap limbs; prefer the default camera for each exercise. This review does not establish clinical technique accuracy.

## Release/integration gates

- Workout unit/type/build verification passed (35 tests at time of check); the isolated authenticated motion/offline checks passed in Chromium and WebKit. The full workout regression run was disrupted by concurrent builds/tests and changing app files and is not certified green.
- npm publication and registry installation await account authentication; signup/login currently reports an access restriction. No release tag has been pushed. The public source repository is available.
- Subsequent releases require an npm trusted publisher for `mayur2109/stick-motion`, workflow `publish.yml`.

The first GitHub Actions run passed core/package/inference checks but found a cancellation-test race: unsupported WebKit could finish before the Cancel button was clicked. The test now holds the worker request during cancellation, then releases it before real extraction.

## Reproduce

Run `npm ci`, `npm run assets`, `npm run check`, `npm run test:package`, `npm run test:e2e` and `node scripts/visual-review.mjs`. Optional local footage: set `STICK_MOTION_VIDEO_FIXTURE` and run Chromium selection/recovery tests. Inspect generated sheets as well as numerical results.
