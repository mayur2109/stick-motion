import { build } from 'esbuild';
await build({
  entryPoints: ['src/video/worker.ts'],
  outfile: 'dist/video/worker.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
});
