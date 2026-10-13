# Third-party notices

Stick Motion's original code is MIT licensed. This does not relicense third-party software, model weights, or video footage.

- The optional pose worker bundles `@mediapipe/tasks-vision` 1.1.0, copyright Google LLC, Apache-2.0. Its license comments are preserved in the worker. Upstream: https://github.com/google-ai-edge/mediapipe and https://www.apache.org/licenses/LICENSE-2.0.
- The full float16 Pose Landmarker model and accompanying WASM runtime are fetched separately from Google/package assets by `npm run assets`. They are excluded from the npm package and Git history. See the upstream model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker.
- `squat.webm` is a test fixture by **FitnessScape**, originally from _Half Rack Workout_, extracted to Wikimedia Commons. It is **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/. Source: https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm . Original: https://www.youtube.com/watch?v=0I6q9NqK9tM . The downloaded fixture is unmodified; tests extract and normalize landmarks. It is not included in the npm package or presented as an endorsement. The file's recorded SHA-256 is in `scripts/assets.json`.
- MP4 generation uses a user-installed FFmpeg binary and the optional Sharp dependency, each under its own license. Stick Motion does not bundle an FFmpeg binary.

All eight procedural demonstrations originate in code. No manually illustrated or AI-generated artwork is required.
