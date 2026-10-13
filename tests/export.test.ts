import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportMp4 } from '../src/export/index.js';
import sharp from 'sharp';
import { renderSvg, motionViewBox, sampleMotion } from '../src/index.js';
import { createExercise } from '../src/exercises/index.js';
it('exports exact timestamps to a valid silent H.264 MP4', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stick-export-'));
  try {
    const path = join(dir, 'demo.mp4');
    await exportMp4(createExercise('squat', { durationMs: 1000 }), path, {
      width: 720,
      height: 720,
      fps: 30,
    });
    const info = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path], {
        encoding: 'utf8',
      }),
    );
    expect(info.streams).toHaveLength(1);
    expect(info.streams[0]).toMatchObject({
      codec_name: 'h264',
      width: 720,
      height: 720,
      nb_frames: '30',
    });
    expect(Number(info.streams[0].duration)).toBeCloseTo(1, 2);
    const decoded = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      'select=eq(n\\,15)',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    const clip = createExercise('squat', { durationMs: 1000 });
    const svg = renderSvg(sampleMotion(clip, 500), clip.camera, {
      viewBox: motionViewBox(clip),
      color: '#25324a',
      background: '#faf9f6',
    }).replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
    const expected = await sharp(Buffer.from(svg))
      .resize(720, 720, { fit: 'contain', background: '#faf9f6' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(decoded).removeAlpha().raw().toBuffer();
    expect(actual.length).toBe(expected.length);
    const error = actual.reduce((sum, v, i) => sum + Math.abs(v - expected[i]), 0) / actual.length;
    expect(error).toBeLessThan(3);
    await expect(exportMp4(clip, path)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
it('rejects invalid export dimensions before starting an encoder', async () => {
  await expect(exportMp4(createExercise('squat'), '/unused.mp4', { width: 101 })).rejects.toThrow(
    /even/,
  );
});

it('reports unavailable FFmpeg clearly', async () => {
  await expect(
    exportMp4(createExercise('squat'), '/tmp/unused.mp4', { ffmpegPath: '/not-a-real-ffmpeg' }),
  ).rejects.toThrow(/Install FFmpeg/);
});
