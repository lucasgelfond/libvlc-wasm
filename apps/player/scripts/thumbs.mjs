// Draws the sample gallery's thumbnails with libvlc-wasm itself (Node API):
// most of these formats are ones other tools cannot read. Writes
// static/samples/thumbs/<file>.jpg for every sample with a picture; the JPEGs
// are small and committed, so this only needs re-running when samples change.
//   node scripts/thumbs.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVLC } from 'libvlc-wasm/node';

const here = dirname(fileURLToPath(import.meta.url));
const samples = resolve(here, '../static/samples');
const out = `${samples}/thumbs`;
mkdirSync(out, { recursive: true });
const src = readFileSync(resolve(here, '../src/lib/samples.ts'), 'utf8');
const files = [...src.matchAll(/files: \['([^']+)'/g)].map((m) => basename(m[1]));

const vlc = await createVLC();
for (const name of files) {
  const path = `${samples}/${name}`;
  if (!existsSync(path)) { console.warn(`thumbs: ${name} missing (run scripts/samples.mjs)`); continue; }
  try {
    const info = await vlc.probe(path);
    if (!info.tracks.some((t) => t.type === 'video') && !/\.iso$/i.test(name)) { console.log(`thumbs: ${name}: audio only`); continue; }
    // Several candidate frames; keep the one with the most detail. A JPEG's
    // size is a good proxy: black or flat frames compress to almost nothing.
    // Some formats cannot seek by position (id RoQ), so times are tried too.
    const tries = [0.15, 0.3, 0.45, 0.6, 0.75].map((position) => ({ position, width: 640 }))
      .concat([1, 3, 6].map((time) => ({ time, width: 640, fast: false })));
    let shot = null;
    for (const t of tries) {
      const s = await vlc.thumbnail(path, t).catch(() => null);
      if (s && (!shot || s.jpeg.length > shot.jpeg.length)) shot = s;
    }
    if (!shot) throw new Error('no frame at any position');
    const { jpeg, width, height } = shot;
    writeFileSync(`${out}/${name}.jpg`, jpeg);
    console.log(`thumbs: ${name} ${width}x${height}`);
  } catch (e) {
    console.warn(`thumbs: ${name}: ${e.message}`);
  }
}
await vlc.destroy();
process.exit(0);
