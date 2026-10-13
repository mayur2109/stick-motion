import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
const run = (file, args, cwd) =>
  execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const dir = await mkdtemp(join(tmpdir(), 'stick-consumer-'));
try {
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', dir], process.cwd()),
  )[0];
  for (const file of packed.files) {
    if (/(?:\.env|\.task$|\.wasm$|\.webm$|test-results|playground|node_modules)/.test(file.path))
      throw new Error(`Unexpected packaged file: ${file.path}`);
  }
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'clean-consumer', private: true, type: 'module' }),
  );
  const registryTest = process.env.STICK_MOTION_REGISTRY_TEST === '1';
  const installSpec = registryTest ? 'stick-motion@0.1.0' : join(dir, packed.filename);
  if (registryTest) {
    const integrity = JSON.parse(
      run(
        'npm',
        ['view', installSpec, 'dist.integrity', '--json', '--userconfig', '/dev/null'],
        dir,
      ),
    );
    if (integrity !== packed.integrity)
      throw new Error('Registry tarball differs from the verified package');
  }
  run('npm', ['install', '--ignore-scripts', '--userconfig', '/dev/null', installSpec], dir);
  const vanilla = JSON.parse(run('npm', ['ls', '--json'], dir));
  if (vanilla.dependencies?.react || vanilla.dependencies?.sharp)
    throw new Error('Vanilla consumer acquired optional peers');
  run(
    'node',
    [
      '--input-type=module',
      '-e',
      "import {sampleMotion} from 'stick-motion'; import {createExercise} from 'stick-motion/exercises'; console.log(sampleMotion(createExercise('squat'),0).root)",
    ],
    dir,
  );
  run('npm', ['install', '--ignore-scripts', 'react', 'react-dom', '@types/react'], dir);
  await writeFile(
    join(dir, 'consumer.ts'),
    `import {sampleMotion,MotionClip} from 'stick-motion';
import {createExercise} from 'stick-motion/exercises';
import {MotionPlayer} from 'stick-motion/react';
import {importVideo} from 'stick-motion/video';
import {exportMp4} from 'stick-motion/export';
const clip:MotionClip=createExercise('squat'); console.log(sampleMotion(clip,0),MotionPlayer,importVideo,exportMp4);`,
  );
  run(
    process.execPath,
    [
      join(process.cwd(), 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'consumer.ts',
    ],
    dir,
  );
  await writeFile(
    join(dir, 'verify.mjs'),
    `import assert from 'node:assert/strict';
import { sampleMotion, validateMotion, renderSvg } from 'stick-motion';
import { createExercise } from 'stick-motion/exercises';
import { MotionPlayer } from 'stick-motion/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
const clip=createExercise('squat');
assert.equal(validateMotion(clip).valid,true);
assert.match(renderSvg(sampleMotion(clip,2000)),/<svg/);
assert.match(renderToString(createElement(MotionPlayer,{clip})),/Timeline/);
console.log('Clean core and React imports passed');`,
  );
  console.log(run('node', ['verify.mjs'], dir).trim());
  run(
    join(dir, 'node_modules/.bin/stick-motion'),
    ['generate', 'plank', '--output', join(dir, 'plank.json')],
    dir,
  );
  run(join(dir, 'node_modules/.bin/stick-motion'), ['validate', join(dir, 'plank.json')], dir);
  const directive = await readFile(
    join(dir, 'node_modules/stick-motion/dist/react/index.js'),
    'utf8',
  );
  if (!/^["']use client["']/.test(directive)) throw new Error('React client directive was lost');
  const result = await build({
    stdin: {
      contents: `import {sampleMotion} from 'stick-motion'; import {MotionPlayer} from 'stick-motion/react'; console.log(sampleMotion, MotionPlayer);`,
      resolveDir: dir,
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    external: ['react', 'react/jsx-runtime'],
  });
  const files = Object.keys(result.metafile.inputs);
  if (files.some((f) => /mediapipe|\/video\/|\/export\/|sharp|node:/.test(f)))
    throw new Error('Viewer imports heavy processing dependencies');
  const bytes = result.outputFiles[0].contents.length;
  if (bytes > 60000) throw new Error(`Viewer exceeds 60 KB unminified budget: ${bytes}`);
  const consumerTree = JSON.parse(run('npm', ['ls', '--json'], dir));
  if (consumerTree.dependencies?.sharp || consumerTree.dependencies?.['@mediapipe/tasks-vision'])
    throw new Error('Optional processors were installed for basic playback');
  console.log(
    `Package install, SSR, client directive, asset exclusion, and import isolation passed (${bytes} viewer bytes).`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
