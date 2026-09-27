// Regression check over the format corpus: every sample in
// tests/corpus-baseline.json must still play in libvlc-wasm. Newly passing
// samples are reported so the baseline can be raised.
//   node tests/corpus-check.mjs [--update-baseline]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root } from './lib/browser.mjs';

const update = process.argv.includes('--update-baseline');
const baselinePath = `${root}/tests/corpus-baseline.json`;
const out = mkdtempSync(join(tmpdir(), 'libvlc-wasm-corpus-'));
try {
  // Browsers' own support is not what this checks: one engine is enough.
  execFileSync('node', ['tests/verify-corpus.mjs', '--engines=chromium', `--out=${out}`], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const { results } = JSON.parse(readFileSync(`${out}/results.json`, 'utf8'));
  const passing = results.filter((r) => r.vlc.passed).map((r) => r.id).sort();
  // Samples with a knownIssue are timing-sensitive by nature (a 0.1 s clip, a
  // truncated file): they are reported, never held to the baseline.
  const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
  const flaky = new Set(manifest.samples.filter((s) => s.test?.knownIssue).map((s) => s.id));
  if (update) {
    const held = passing.filter((id) => !flaky.has(id));
    writeFileSync(baselinePath, JSON.stringify({ note: 'corpus samples libvlc-wasm must keep playing; raise with node tests/corpus-check.mjs --update-baseline', passing: held }, null, 1) + '\n');
    console.log(`baseline: ${passing.length} of ${results.length} samples`);
    process.exit(0);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).passing;
  const lost = baseline.filter((id) => !passing.includes(id));
  const gained = passing.filter((id) => !baseline.includes(id) && !flaky.has(id));
  for (const id of lost) {
    const r = results.find((x) => x.id === id);
    console.log(`FAIL  ${id.padEnd(50)} ${r ? JSON.stringify(r.vlc.checks) + ' ' + (r.vlc.error ?? '') : 'missing from the run'}`);
  }
  for (const id of gained) console.log(`NEW   ${id} now plays (raise the baseline: --update-baseline)`);
  console.log(`\n[corpus] ${passing.length}/${results.length} play; ${baseline.length - lost.length}/${baseline.length} of the baseline`);
  process.exitCode = lost.length ? 1 : 0;
} finally {
  rmSync(out, { recursive: true, force: true });
}
