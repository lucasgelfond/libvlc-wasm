// Downloads the files a suite definition (corpus/suites/<name>.json, built by
// lists.mjs) lists into corpus/suites/<name>/ (gitignored). One file at a time,
// resumable: a file already present at the listed size is skipped, a partial
// download is continued (curl -C -). A definition may set "fetchRate" (curl
// --limit-rate) to be gentler on its host.
//
//   node corpus/suites/fetch.mjs libvpx [more suites...]
//   node corpus/suites/fetch.mjs --all
import { readFileSync, existsSync, statSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BUDGET = 3.2e9;
const argv = process.argv.slice(2);
const names = argv.includes('--all')
  ? readdirSync(here).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  : argv.filter((a) => !a.startsWith('--'));

for (const name of names) {
  const def = JSON.parse(readFileSync(`${here}/${name}.json`, 'utf8'));
  if (def.derivedFrom) { console.log(`${name}: derived from ${def.derivedFrom}, nothing to fetch`); continue; }
  const total = def.files.reduce((s, f) => s + (f.bytes ?? 0), 0);
  if (total > BUDGET) throw new Error(`${name}: ${(total / 1e9).toFixed(2)} GB is over the per-suite budget; subset it in lists.mjs`);
  let got = 0, skipped = 0, failed = 0;
  for (const f of def.files) {
    const out = `${here}/${name}/${f.path}`;
    if (existsSync(out) && (f.bytes == null || statSync(out).size === f.bytes)) { skipped++; continue; }
    mkdirSync(dirname(out), { recursive: true });
    const part = `${out}.part`;
    const args = ['-fsSL', '--retry', '3', '--retry-delay', '5', '--connect-timeout', '30', '-C', '-', '-o', part, '-A', 'libvlc-wasm compat measurement (one request at a time)'];
    if (def.fetchRate) args.push('--limit-rate', def.fetchRate);
    const r = spawnSync('curl', [...args, f.url], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status === 0 && existsSync(part)) { renameSync(part, out); got++; } else {
      failed++;
      console.log(`  ${f.path}: curl ${r.status} ${String(r.stderr).trim().slice(0, 160)}`);
    }
    if ((got + failed) % 50 === 0) console.log(`  ${name}: ${got + failed + skipped}/${def.files.length}`);
  }
  console.log(`${name}: ${got} downloaded, ${skipped} already present, ${failed} failed (${(total / 1e6).toFixed(1)} MB listed)`);
}
