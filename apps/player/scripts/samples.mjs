// Puts the sample gallery's files in static/samples/, so the app works on a
// fresh clone and when deployed: copied from the test corpus if it has been
// fetched (corpus/fetch.mjs), otherwise downloaded from each file's original
// public URL (corpus/manifest.json). The generated DVD image is committed.
// Runs before dev and build (package.json predev/prebuild).
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(here, '../static/samples');
mkdirSync(out, { recursive: true });

const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
const src = readFileSync(resolve(here, '../src/lib/samples.ts'), 'utf8');
const files = [...src.matchAll(/files: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]));

let fetched = 0, copied = 0, kept = 0;
for (const path of files) {
  const dst = `${out}/${basename(path)}`;
  if (existsSync(dst) && statSync(dst).size > 0) { kept++; continue; }
  const local = `${root}/corpus/media/${path}`;
  if (existsSync(local)) { copyFileSync(local, dst); copied++; continue; }
  const s = manifest.samples.find((x) => x.file === path);
  if (!s?.url) { console.warn(`samples: no local copy or URL for ${path}`); continue; }
  const r = await fetch(s.url);
  if (!r.ok) { console.warn(`samples: ${s.url}: HTTP ${r.status}`); continue; }
  // Some corpus entries are the first N bytes of a longer file.
  let bytes = new Uint8Array(await r.arrayBuffer());
  if (s.bytes && bytes.length > s.bytes) bytes = bytes.slice(0, s.bytes);
  writeFileSync(dst, bytes);
  fetched++;
}
console.log(`samples: ${kept} present, ${copied} copied from corpus/media, ${fetched} downloaded`);
