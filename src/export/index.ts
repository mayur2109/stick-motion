import { mkdtemp, rm, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Camera, MotionClip } from '../core/types.js';
import { renderSvg, motionViewBox } from '../core/render.js';
import { sampleMotion } from '../core/motion.js';
import { validateMotion } from '../core/validate.js';
export interface ExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  camera?: Camera;
  background?: string;
  ffmpegPath?: string;
}
export async function exportMp4(clip: MotionClip, output: string, options: ExportOptions = {}) {
  try {
    await access(resolve(output));
    throw new Error('Output already exists; choose a new filename.');
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const width = options.width ?? 720,
    height = options.height ?? 720,
    fps = options.fps ?? 30;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= 4096 && n % 2 === 0))
    throw new Error('Dimensions must be even integers between 2 and 4096');
  if (!Number.isInteger(fps) || fps < 1 || fps > 60)
    throw new Error('FPS must be between 1 and 60');
  const diagnostics = validateMotion(clip);
  if (!diagnostics.valid) throw new Error(diagnostics.errors.join('; '));
  if (clip.durationMs > 30000) throw new Error('Export supports clips up to 30 seconds');
  let sharp: (typeof import('sharp'))['default'];
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error('MP4 export requires Sharp. Install it with npm install sharp.');
  }
  const ffmpeg = options.ffmpegPath ?? 'ffmpeg';
  try {
    await promisify(execFile)(ffmpeg, ['-version']);
  } catch {
    throw new Error('Install FFmpeg and make ffmpeg available on PATH, or pass ffmpegPath.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'stick-motion-'));
  try {
    const viewBox = motionViewBox(clip, options.camera ?? clip.camera);
    const frameCount = Math.ceil((clip.durationMs / 1000) * fps);
    for (let frame = 0; frame < frameCount; frame++) {
      const svg = renderSvg(
        sampleMotion(clip, (frame * 1000) / fps),
        options.camera ?? clip.camera,
        {
          viewBox,
          title: clip.name,
          color: '#25324a',
          background: options.background ?? '#faf9f6',
        },
      ).replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
      const png = await sharp(Buffer.from(svg))
        .resize(width, height, { fit: 'contain', background: options.background ?? '#faf9f6' })
        .png()
        .toBuffer();
      await writeFile(join(dir, `${String(frame).padStart(6, '0')}.png`), png);
    }
    await promisify(execFile)(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-n',
        '-framerate',
        String(fps),
        '-i',
        join(dir, '%06d.png'),
        '-frames:v',
        String(frameCount),
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        join(dir, 'encoded.mp4'),
      ],
      { timeout: 120000, maxBuffer: 1024 * 1024 },
    );
    await copyFile(join(dir, 'encoded.mp4'), resolve(output), constants.COPYFILE_EXCL);
    return {
      output: resolve(output),
      frameCount,
      width,
      height,
      fps,
      durationMs: (frameCount / fps) * 1000,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
