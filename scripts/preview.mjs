import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
const snapshot = await mkdtemp(join(tmpdir(), 'stick-preview-'));
const build = spawnSync('npx', ['vite', 'build', 'playground', '--outDir', snapshot], {
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn(
  'npx',
  [
    'vite',
    'preview',
    'playground',
    '--outDir',
    snapshot,
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
    '--strictPort',
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
