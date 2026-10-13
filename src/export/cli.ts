#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { exportMp4 } from './index.js';
import { createExercise, exerciseIds, type ExerciseId } from '../exercises/index.js';
import { validateMotion } from '../core/validate.js';
import type { MotionClip } from '../core/types.js';
async function main() {
  const [command, input, ...args] = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  if (command === 'generate' && exerciseIds.includes(input as ExerciseId)) {
    const clip = createExercise(input as ExerciseId),
      output = option('--output') ?? `${input}.json`;
    await writeFile(output, JSON.stringify(clip), { flag: 'wx' });
    console.log(output);
    return;
  }
  if ((command === 'export' || command === 'validate') && input) {
    const clip = JSON.parse(await readFile(input, 'utf8')) as MotionClip;
    if (command === 'validate') {
      const d = validateMotion(clip);
      console.log(JSON.stringify(d, null, 2));
      if (!d.valid) process.exitCode = 1;
      return;
    }
    const output = option('--output');
    if (!output) throw new Error('Specify --output demo.mp4');
    console.log(
      JSON.stringify(
        await exportMp4(clip, output, {
          width: option('--width') ? Number(option('--width')) : undefined,
          height: option('--height') ? Number(option('--height')) : undefined,
          fps: option('--fps') ? Number(option('--fps')) : undefined,
        }),
      ),
    );
    return;
  }
  console.log(
    'stick-motion generate <exercise> --output clip.json\nstick-motion validate clip.json\nstick-motion export clip.json --output demo.mp4 [--width 720 --height 720 --fps 30]',
  );
  if (command !== '--help' && command !== '-h') process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
