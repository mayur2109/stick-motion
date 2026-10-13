# Verification ledger

## Verified locally on 2026-10-13

- `npm run check`: Prettier, ESLint, strict TypeScript, 30 unit tests, library and playground production builds passed.
- `npm run test:package`: clean vanilla JavaScript, React SSR, all TypeScript entry points, client directive, asset exclusion and dependency isolation passed. Viewer bundle: 16,592 unminified bytes with React external.
- `npm run test:e2e`: 10 Chromium/WebKit scenarios passed. Chromium performed real MediaPipe inference. Linux WebKit cannot create worker WebGL; its extraction tests verify the actionable capability error, not successful inference.
- Real squat fixture: 3–4 second segment extracts at default confidence; full 0–4 second segment rejects unreliable observations and preserves raw capture.
- User-provided UHD burpee MP4: selection stayed intact, worker inference completed locally at 405×720; the default 0–4 second segment rejected confidence at its endpoint; a fresh 0–3.9 second extraction completed successfully at the unchanged default confidence. The footage and raw capture are not distributed.
- MP4 test: 720×720, silent H.264, 30 frames / 1 second; decoded midpoint compared with the canonical raster (mean channel difference below 3). Existing outputs cannot be replaced, and missing FFmpeg is reported.
- Eight exercise sheets in [evidence](evidence/index.html) show five checkpoints in front, side and three-quarter views. Visual inspection corrected framing, neck connection and forearm plank. Foreshortened views overlap limbs; prefer the default camera for each exercise. This review does not establish clinical technique accuracy.

## Release/integration gates

- Workout unit/type/build verification passed (35 tests at time of check); the isolated authenticated motion/offline checks passed in Chromium and WebKit. After the concurrent app changes finished, a fresh full workout suite passed all 14 tests in both browsers.
- `stick-motion@0.1.0` is published publicly. A fresh anonymous registry install matches the verified tarball and passes vanilla JavaScript, React SSR, TypeScript, installed CLI, and dependency-isolation checks.
- npm trusted publishing is configured for `mayur2109/stick-motion`, workflow `publish.yml`; the CLI verified the saved relationship. Subsequent `v*` release tags use OIDC, without stored npm publishing tokens. The initial release was published interactively after account/passkey verification.

The first GitHub Actions run passed core/package/inference checks but found a cancellation-test race: unsupported WebKit could finish before the Cancel button was clicked. The test now holds the worker request during cancellation, then releases it before real extraction.

## Reproduce

Run `npm ci`, `npm run assets`, `npm run check`, `npm run test:package`, `npm run test:e2e` and `node scripts/visual-review.mjs`. Optional local footage: set `STICK_MOTION_VIDEO_FIXTURE` and run Chromium selection/recovery tests. Inspect generated sheets as well as numerical results.
