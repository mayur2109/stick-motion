import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let detector: PoseLandmarker | undefined;
self.onmessage = async (event: MessageEvent) => {
  const { id, type, bitmap, timeMs, assetsUrl } = event.data;
  try {
    if (type === 'init') {
      const canvas = new OffscreenCanvas(1, 1);
      if (!canvas.getContext('webgl2') && !canvas.getContext('webgl'))
        throw new Error(
          'This browser cannot create a WebGL context in a worker. Enable hardware acceleration or use a supported browser such as Chrome. Video processing remains local.',
        );
      const vision = await FilesetResolver.forVisionTasks(`${assetsUrl}/wasm`);
      detector = await PoseLandmarker.createFromOptions(vision, {
        canvas: new OffscreenCanvas(1, 1),
        baseOptions: { modelAssetPath: `${assetsUrl}/pose_landmarker_full.task`, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ id, result: true });
    } else if (type === 'frame') {
      if (!detector) throw new Error('Pose model is not initialized');
      const result = detector.detectForVideo(bitmap, timeMs);
      self.postMessage({
        id,
        result: {
          timeMs,
          people: result.landmarks.length,
          landmarks: result.landmarks[0] ?? [],
          world: result.worldLandmarks[0] ?? [],
        },
      });
    }
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  } finally {
    bitmap?.close();
  }
};
