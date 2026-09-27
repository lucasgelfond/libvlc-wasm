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
    // Some formats cannot seek by position (id RoQ): fall back to a time.
    const shot = await vlc.thumbnail(path, { position: 0.3, width: 640 }).catch(() => vlc.thumbnail(path, { time: 1, width: 640, fast: false }));
    const { jpeg, width, height } = shot;
    writeFileSync(`${out}/${name}.jpg`, jpeg);
    console.log(`thumbs: ${name} ${width}x${height}`);
  } catch (e) {
    console.warn(`thumbs: ${name}: ${e.message}`);
  }
}
await vlc.destroy();
process.exit(0);
