import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('./assets.json', import.meta.url), 'utf8'));
const out = new URL('../playground/public/assets/', import.meta.url);
await mkdir(out, { recursive: true });
for (const [name, { url, sha256 }] of Object.entries(manifest)) {
  const destination = new URL(name, out);
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch {
    /* Download absent assets below. */
  }
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== sha256) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Asset download failed: ${name} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== sha256)
      throw new Error(`Asset checksum mismatch: ${name}`);
    await writeFile(destination, bytes);
  }
  console.log(`Verified ${name}`);
}
await cp(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
  new URL('wasm/', out),
  { recursive: true },
);
await cp(new URL('../dist/video/worker.js', import.meta.url), new URL('worker.js', out));
