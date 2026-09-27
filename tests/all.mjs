// Every test suite, one command. Exits non-zero if anything regressed.
//   pnpm test                 everything, in Chromium, WebKit and Firefox
//   pnpm test -- --quick      Chromium only; skips the corpus and packaging runs
//   pnpm test -- --engines=webkit --only=features,sout
// Needs the fixtures (tests/make-fixtures.sh, make-dvd.sh, make-bluray.sh) and
// the corpus (node corpus/fetch.mjs). Nothing makes a sound.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { root } from './lib/browser.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const quick = process.argv.includes('--quick');
const engines = (arg('engines') ?? (quick ? 'chromium' : 'chromium,webkit,firefox')).split(',');
const only = arg('only')?.split(',');

/** [suite, script, args, needs] -- needs: a file that must exist, or the suite is skipped with a hint. */
const SUITES = [
  ['node', 'tests/node-smoke.mjs', [], 'corpus/media/gen/t_wmv2.wmv'],
  ...engines.map((e) => ['features', 'tests/features.mjs', [`--engine=${e}`], 'corpus/media/gen/t_bluray.iso']),
  ...engines.map((e) => ['sout', 'tests/sout.mjs', [`--engine=${e}`], 'packages/sout/wasm/libvlc-sout.wasm']),
  ['colors', 'tests/colors.mjs', [], 'bench/media/colors/i420.mpg'],
  ['app', 'tests/app.mjs', [], 'apps/player/node_modules'],
  ['samples', 'tests/samples.mjs', [], 'apps/player/node_modules'],
  ...(quick ? [] : [['corpus', 'tests/corpus-check.mjs', [], 'corpus/media/realmedia']]),
  ...(quick ? [] : [['package', 'tests/package.mjs', [], 'packages/core/wasm/libvlc.wasm']]),
  ...(quick ? [] : [['bundle', 'tests/bundle.mjs', [], 'packages/sout/wasm/libvlc-sout.wasm']]),
].filter(([name]) => !only || only.includes(name));

function runSuite(script, args) {
  return new Promise((resolve) => {
    const child = spawn('node', [script, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

const summary = [];
const t0 = Date.now();
for (const [name, script, args, needs] of SUITES) {
  const label = `${name}${args.length ? ' ' + args.join(' ').replace('--engine=', '') : ''}`;
  if (needs && !existsSync(`${root}/${needs}`)) {
    summary.push([label, 'skipped', `missing ${needs}`]);
    continue;
  }
  console.log(`\n=== ${label}`);
  const t = Date.now();
  const { code, out } = await runSuite(script, args);
  const tally = [...out.matchAll(/(\d+)\/(\d+) (?:passed|play)/g)].pop();
  summary.push([label, code === 0 ? 'pass' : 'FAIL', `${tally ? `${tally[1]}/${tally[2]}` : ''} ${((Date.now() - t) / 1000).toFixed(0)} s`]);
}

console.log('\n=== summary');
for (const [label, status, detail] of summary) console.log(`${status.padEnd(8)} ${label.padEnd(20)} ${detail}`);
const failed = summary.filter(([, s]) => s === 'FAIL');
console.log(`\n${failed.length ? `${failed.length} suite(s) failed` : 'all suites passed'} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exitCode = failed.length ? 1 : 0;
