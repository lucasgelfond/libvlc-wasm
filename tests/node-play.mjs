// Plays a file under Node with no page attached: video frames land in the
// vmem buffers and audio in the ring (nobody drains it, so the aout drops).
// Useful for crash traces, which Node prints with wasm function names.
//   node tests/node-play.mjs file [seconds]
import { resolve } from 'node:path';
import createLibVLCModule from '../packages/core/wasm/libvlc.js';
import { createEngine, EVENT, STATE_NAMES } from '../packages/core/src/engine.js';

const file = resolve(process.argv[2]);
const seconds = +(process.argv[3] ?? 3);
const keepalive = setInterval(() => {}, 1000);

const engine = await createEngine(createLibVLCModule, {
  threads: 20,
  onEvent: (player, type, a, b, str) => {
    if (type === EVENT.LOG) { if (a >= 3 || process.env.LOGS) console.log(`  ${(performance.now() / 1000).toFixed(3)} log[${a}] ${str}`); return; }
    if (type === EVENT.STATE) console.log(`  state ${STATE_NAMES[a]}`);
    else if (type === EVENT.STOPPING) console.log(`  stopping reason=${a}`);
    else if (type === EVENT.LENGTH) console.log(`  length ${a / 1e6}s`);
  },
});
const { FS, NODEFS } = engine.Module;
FS.mkdir('/host');
FS.mount(NODEFS, { root: '/' }, '/host');
const { i: inst } = await engine.call('instance_new', { s: [['--aout=adummy', process.env.AVT ? `--avcodec-threads=${process.env.AVT}` : '--avcodec-threads=4', process.env.LOGS ? '--verbose=2' : '', ...(process.env.VLCARGS ?? '').split(' ').filter(Boolean)].join('\n')] });
if (process.env.LOGS) await engine.call('set_log_level', { i: [inst, 0] });
const { i: p } = await engine.call('player_new', { i: [inst, 1, 48000, 2, 24000] });
console.log(`player ${p}`);
await engine.call('open', { i: [p], s: [`file:///host${file}`, ''] });
const t0 = performance.now();
await engine.call('play', { i: [p] });
await new Promise((r) => setTimeout(r, seconds * 1000));
const { value: status } = await engine.call('status', { i: [p] }, 'json');
const { value: info } = await engine.call('media_info', { i: [p] }, 'json');
console.log('status', status);
console.log('stats', info?.stats);
console.log(`wall ${(performance.now() - t0).toFixed(0)} ms`);
await engine.call('stop', { i: [p] });
clearInterval(keepalive);
process.exit(0);
