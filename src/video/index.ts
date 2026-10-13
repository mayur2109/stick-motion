export * from './types.js';
export * from './process.js';
import { processLandmarks, validateSegment } from './process.js';
import type { ImportSettings, RawCapture, RawFrame } from './types.js';
export interface VideoImportOptions extends ImportSettings {
  start: number;
  end: number;
  assetsUrl: string;
  workerUrl: string;
  signal?: AbortSignal;
  onCapture?: (raw: RawCapture) => void;
  onProgress?: (progress: number) => void;
}
const abortError = () => new DOMException('Import cancelled', 'AbortError');
export async function importVideo(file: File, options: VideoImportOptions) {
  if (options.signal?.aborted) throw abortError();
  const url = URL.createObjectURL(file),
    video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  let worker: Worker | undefined;
  const wait = (event: string, action: () => void) =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener(event, done);
        video.removeEventListener('error', fail);
        options.signal?.removeEventListener('abort', abort);
        clearTimeout(timeout);
      };
      const done = () => {
          cleanup();
          resolve();
        },
        fail = () => {
          cleanup();
          reject(new Error('This browser cannot decode the video. Try an H.264 MP4 or VP9 WebM.'));
        },
        abort = () => {
          cleanup();
          reject(abortError());
        };
      const timeout = setTimeout(fail, 30000);
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', fail, { once: true });
      options.signal?.addEventListener('abort', abort, { once: true });
      action();
    });
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let seq = 0;
  const cancel = () => {
    worker?.terminate();
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(abortError());
    }
    pending.clear();
  };
  try {
    await wait('loadeddata', () => {
      video.src = url;
    });
    if (options.signal?.aborted) throw abortError();
    validateSegment(options.start, options.end, video.duration);
    worker = new Worker(options.workerUrl);
    options.signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (e) => {
      const task = pending.get(e.data.id);
      if (task) {
        clearTimeout(task.timer);
        pending.delete(e.data.id);
        if (e.data.error) task.reject(new Error(e.data.error));
        else task.resolve(e.data.result);
      }
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(`Pose worker failed: ${e.message}`));
      }
      pending.clear();
    };
    const request = (message: Record<string, unknown>, transfer: Transferable[] = []) =>
      new Promise<unknown>((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(abortError());
          return;
        }
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Pose processing timed out. Retry a shorter segment.'));
        }, 120000);
        pending.set(id, { resolve, reject, timer });
        worker!.postMessage({ ...message, id }, transfer);
      });
    await request({
      type: 'init',
      assetsUrl: new URL(options.assetsUrl, location.href).href.replace(/\/$/, ''),
    });
    const ratio = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight),
      width = Math.max(1, Math.round(video.videoWidth * ratio)),
      height = Math.max(1, Math.round(video.videoHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const count = Math.ceil((options.end - options.start) * 30),
      frames: RawFrame[] = [];
    for (let i = 0; i <= count; i++) {
      if (options.signal?.aborted) throw abortError();
      const time = Math.min(options.end, options.start + i / 30);
      const seekTo = Math.min(time, Math.max(0, video.duration - 0.001));
      if (Math.abs(video.currentTime - seekTo) > 0.00001)
        await wait('seeked', () => {
          video.currentTime = seekTo;
        });
      ctx.drawImage(video, 0, 0, width, height);
      const bitmap = await createImageBitmap(canvas);
      frames.push(
        (await request({ type: 'frame', bitmap, timeMs: time * 1000 }, [bitmap])) as RawFrame,
      );
      options.onProgress?.((i + 1) / (count + 1));
    }
    const raw: RawCapture = {
      schemaVersion: 1,
      model: 'mediapipe-pose-full-float16-v1/tasks-vision-1.1.0',
      width,
      height,
      startMs: options.start * 1000,
      endMs: options.end * 1000,
      sampleFps: 30,
      frames,
      settings: {
        minConfidence: options.minConfidence ?? 0.5,
        maxGapMs: options.maxGapMs ?? 100,
        smoothing: options.smoothing !== false,
      },
    };
    options.onCapture?.(raw);
    const processed = processLandmarks(raw, options);
    return { raw, ...processed };
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    worker?.terminate();
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
