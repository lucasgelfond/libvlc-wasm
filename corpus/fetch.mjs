// Downloads the test corpus listed in manifest.json into corpus/media/ (gitignored).
//   node corpus/fetch.mjs            everything missing
//   node corpus/fetch.mjs realmedia  one category
//   node corpus/fetch.mjs --write-hashes   record the sha256 of every file
//                                          already in media/ into manifest.json
// An entry with a sha256 is checked on download; a mismatch is not written.
import { readFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(`${here}/manifest.json`, 'utf8'));
const writeHashes = process.argv.includes('--write-hashes');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// `entry` is the manifest object itself, so --write-hashes can fill it in.
const jobs = [];
for (const s of manifest.samples) {
  if (only && s.category !== only && s.id !== only) continue;
  if (!s.url) continue; // generated locally (s.generated names the script)
  jobs.push({ id: s.id, url: s.url, file: s.file, entry: s });
  for (const c of s.companions ?? []) jobs.push({ id: `${s.id} (companion)`, ...c, entry: c });
}
for (const a of manifest.assets ?? []) jobs.push({ ...a, entry: a });

if (writeHashes) {
  let n = 0;
  for (const job of jobs) {
    const out = resolve(here, 'media', job.file);
    if (!existsSync(out) || statSync(out).size === 0) continue;
    job.entry.sha256 = sha256(readFileSync(out));
    n++;
  }
  writeFileSync(`${here}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${n} of ${jobs.length} hashes written to manifest.json`);
  process.exit(0);
}

let ok = 0, skipped = 0, failed = 0;
async function run(job) {
  const out = resolve(here, 'media', job.file);
  if (existsSync(out) && statSync(out).size > 0) { skipped++; return; }
  mkdirSync(dirname(out), { recursive: true });
  try {
    const r = await fetch(job.url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const got = job.sha256 && sha256(bytes);
    if (got && got !== job.sha256) throw new Error(`sha256 ${got}, expected ${job.sha256}`);
    writeFileSync(out, bytes);
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
