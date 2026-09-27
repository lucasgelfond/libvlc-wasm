// Downloads the test corpus listed in manifest.json into corpus/media/ (gitignored).
//   node corpus/fetch.mjs            everything missing
//   node corpus/fetch.mjs realmedia  one category
import { readFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(`${here}/manifest.json`, 'utf8'));
const only = process.argv[2];

const jobs = [];
for (const s of manifest.samples) {
  if (only && s.category !== only && s.id !== only) continue;
  if (!s.url) continue; // generated locally (s.generated names the script)
  jobs.push({ id: s.id, url: s.url, file: s.file });
  for (const c of s.companions ?? []) jobs.push({ id: `${s.id} (companion)`, ...c });
}
for (const a of manifest.assets ?? []) jobs.push(a);

let ok = 0, skipped = 0, failed = 0;
async function run(job) {
  const out = resolve(here, 'media', job.file);
  if (existsSync(out) && statSync(out).size > 0) { skipped++; return; }
  mkdirSync(dirname(out), { recursive: true });
  try {
    const r = await fetch(job.url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    writeFileSync(out, new Uint8Array(await r.arrayBuffer()));
    ok++;
    process.stdout.write(`  ${job.file}\n`);
  } catch (e) {
    failed++;
    console.error(`  FAILED ${job.id}: ${e.message}`);
  }
}

const queue = [...jobs];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await run(queue.shift()); }));
console.log(`${ok} downloaded, ${skipped} already present, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
