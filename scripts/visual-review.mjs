import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { exercises } from '../dist/exercises/index.js';
import { sampleMotion, renderSvg, motionViewBox } from '../dist/index.js';
const dir = 'docs/evidence';
await mkdir(dir, { recursive: true });
for (const clip of Object.values(exercises)) {
  const tiles = [];
  for (const [row, view] of ['front', 'side', 'three-quarter'].entries()) {
    const camera = { view },
      viewBox = motionViewBox(clip, camera);
    for (const [column, t] of [0, 0.25, 0.5, 0.75, 1].entries()) {
      const svg = renderSvg(sampleMotion(clip, t * clip.durationMs), camera, {
        viewBox,
        title: clip.name,
        background: '#faf9f6',
        color: '#25324a',
      }).replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
      tiles.push({
        input: await sharp(Buffer.from(svg))
          .resize(220, 220, { fit: 'contain', background: '#faf9f6' })
          .png()
          .toBuffer(),
        left: column * 220,
        top: row * 250 + 30,
      });
      const label = `<svg width="220" height="30"><text x="8" y="22" font-size="14">${view} · ${Math.round(t * 100)}%</text></svg>`;
      tiles.push({ input: Buffer.from(label), left: column * 220, top: row * 250 });
    }
  }
  await sharp({ create: { width: 1100, height: 750, channels: 4, background: '#faf9f6' } })
    .composite(tiles)
    .png()
    .toFile(`${dir}/${clip.id}.png`);
}
await writeFile(
  `${dir}/index.html`,
  '<!doctype html><meta charset="utf-8"><title>Motion review</title>' +
    Object.keys(exercises)
      .map((id) => `<h2>${id}</h2><img width="1100" src="${id}.png">`)
      .join(''),
);
console.log('Rendered eight exercise sheets: front, side, three-quarter × five checkpoints');
