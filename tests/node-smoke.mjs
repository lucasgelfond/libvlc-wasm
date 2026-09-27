// Headless check of the wasm build under Node: version, parse, thumbnail.
//   node tests/node-smoke.mjs [files...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import createLibVLCModule from '../packages/core/wasm/libvlc.js';
import { createEngine, EVENT } from '../packages/core/src/engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => resolve(f))
  : ['t_mpeg2_ac3.ts', 't_h264_opus_ass.mkv', 't_wmv2.wmv'].map((f) => `${root}/corpus/media/gen/${f}`);

const keepalive = setInterval(() => {}, 1000); // pthread workers are unref()d
const t0 = performance.now();
const logs = [];
const engine = await createEngine(createLibVLCModule, {
  threads: 8,
  onEvent: (player, type, a, b, str) => { if (type === EVENT.LOG) logs.push(`[${a}] ${str}`); },
});
const t1 = performance.now();
console.log(`module ready in ${(t1 - t0).toFixed(0)} ms`);

const { FS, NODEFS } = engine.Module;
FS.mkdir('/host');
FS.mount(NODEFS, { root: '/' }, '/host');

const { value: version } = await engine.call('version', {}, 'json');
console.log('libvlc', version);

const { i: inst } = await engine.call('instance_new', { s: ['--verbose=1'] });
if (!inst) throw new Error('libvlc_new failed');
console.log(`instance in ${(performance.now() - t1).toFixed(0)} ms`);

mkdirSync(`${root}/tests/out`, { recursive: true });
for (const f of files) {
  const mrl = `file:///host${f}`;
  const tp = performance.now();
  const { i: ok, value: info } = await engine.call('parse', { i: [inst], s: [mrl] }, 'json');
  console.log(`\n${basename(f)}  parse ${ok === 0 ? 'ok' : 'FAILED'} in ${(performance.now() - tp).toFixed(0)} ms`);
  console.log(`  duration ${info?.duration}s`);
  for (const t of info?.tracks ?? [])
    console.log(`  ${t.type.padEnd(5)} ${t.codec} ${t.codecName ?? ''} ${t.width ? `${t.width}x${t.height}` : ''}${t.rate ? `${t.rate}Hz ${t.channels}ch` : ''}`);

  const tt = performance.now();
  const { i: size, d: dims, value: jpeg } = await engine.call('thumbnail', { i: [inst, 320, 0, 0, 0], d: [1, 0], s: [mrl] }, 'bytes');
  if (size > 0) {
    const out = `${root}/tests/out/${basename(f)}.jpg`;
    writeFileSync(out, jpeg);
    console.log(`  thumbnail ${Math.floor(dims / 65536)}x${dims % 65536} (${size} B) in ${(performance.now() - tt).toFixed(0)} ms -> ${out}`);
  } else console.log('  thumbnail FAILED');
}
if (process.env.LOGS) console.log(logs.join('\n'));
clearInterval(keepalive);
engine.dispose();
engine.Module.PThread?.terminateAllThreads?.();
