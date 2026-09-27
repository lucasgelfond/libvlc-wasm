// Benchmarks libvlc-wasm against native FFmpeg, native VLC.app and ffmpeg.wasm
// on this machine.
//   node bench/run.mjs [--threads=1,4] [--only=h264] [--skip=native,ffmpegwasm]
// Writes bench/results/results.json and bench/results/RESULTS.md.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer, root } from '../tests/lib/browser.mjs';
import { ffmpegNative, vlcNative } from './native.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const threadsList = (args.threads ?? '1,4').split(',').map(Number);
const skip = new Set((args.skip ?? '').split(',').filter(Boolean));
const clips = readdirSync(`${root}/bench/media`)
  .filter((f) => !f.startsWith('.') && statSync(`${root}/bench/media/${f}`).isFile() && (!args.only || f.includes(args.only))).sort();
const out = `${root}/bench/results`;
mkdirSync(out, { recursive: true });

if ('report-only' in args) {
  const d = JSON.parse(readFileSync(`${out}/results.json`, 'utf8'));
  writeFileSync(`${out}/RESULTS.md`, report(d));
  console.log(`rewrote ${out}/RESULTS.md`);
  process.exit(0);
}

const machine = {
  cpu: cpus()[0].model, cores: cpus().length, memGB: Math.round(totalmem() / 2 ** 30),
  os: execSync('sw_vers -productVersion 2>/dev/null || uname -r').toString().trim(),
  ffmpeg: execSync('ffmpeg -version').toString().split('\n')[0],
  node: process.version,
};

// --- sizes ------------------------------------------------------------------
function sizes(path) {
  const buf = readFileSync(path);
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}
const size = {
  'libvlc-wasm (libvlc.wasm)': sizes(`${root}/packages/core/wasm/libvlc.wasm`),
  'ffmpeg.wasm core-mt 0.12.10': sizes(`${root}/node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.wasm`),
};
console.log('sizes', size);

// --- browser ----------------------------------------------------------------
const { server, url } = await startServer();
// Installed Chrome by default: Playwright's Chromium has no H.264/HEVC decoders
// for WebCodecs to use. --browser=chromium to compare.
const browser = await chromium.launch({
  channel: (args.browser ?? 'chrome') === 'chrome' ? 'chrome' : undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

async function newPage(context) {
  const page = await (context ?? browser).newPage();
  await page.goto(`${url}/bench/browser/`);
  await page.waitForFunction(() => window.benchReady === true, null, { timeout: 60000 });
  return page;
}

// Cold: fresh profile, nothing cached, wasm compiled from scratch. Warm: same
// context again, so the HTTP cache and V8's compiled-code cache can apply.
const startup = { cold: [], warm: [] };
for (let k = 0; k < ('showdown-only' in args ? 0 : 3); k++) {
  const ctx = await browser.newContext();
  const p1 = await newPage(ctx);
  startup.cold.push(await p1.evaluate(() => window.bench.startup()));
  await p1.close();
  const p2 = await newPage(ctx);
  startup.warm.push(await p2.evaluate(() => window.bench.startup()));
  await ctx.close();
}
console.log('startup', startup);

const page = await newPage();
const showdownOnly = 'showdown-only' in args;
const previous = showdownOnly ? JSON.parse(readFileSync(`${out}/results.json`, 'utf8')) : null;
const results = previous?.results ?? [];
for (const clip of showdownOnly ? [] : clips) {
  const file = `${root}/bench/media/${clip}`;
  const media = `/bench/media/${clip}`;
  const row = { clip, bytes: statSync(file).size, runs: {} };
  for (const t of threadsList) {
    const r = {};
    if (!skip.has('native')) {
      r.ffmpegNative = ffmpegNative(file, t);
      r.vlcNative = vlcNative(file, t, r.ffmpegNative.frames);
    }
    r.libvlcWasm = await page.evaluate(([u, th]) => window.bench.vlcDecode(u, th, 'software'), [media, t]).catch((e) => ({ error: e.message }));
    if (/h264|hevc|vp9|av1/.test(clip)) {
      r.libvlcWebCodecs = await page.evaluate(([u, th]) => window.bench.vlcDecode(u, th, 'webcodecs'), [media, t]).catch((e) => ({ error: e.message }));
    }
    if (!skip.has('ffmpegwasm')) {
      r.ffmpegWasm = await Promise.race([
        page.evaluate(([u, th]) => window.bench.ffmpegWasmDecode(u, th, true), [media, t]),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 180000)),
      ]).catch((e) => ({ error: e.message }));
    }
    row.runs[t] = r;
    const f = (x) => (x?.fps ? x.fps.toFixed(1).padStart(7) : (x?.error ? '  error' : '      -'));
    console.log(`${clip.padEnd(20)} t=${t}  ffmpeg ${f(r.ffmpegNative)}  vlc ${f(r.vlcNative)}  libvlc-wasm ${f(r.libvlcWasm)}  +webcodecs ${f(r.libvlcWebCodecs)}  ffmpeg.wasm ${f(r.ffmpegWasm)}  fps`);
  }
  row.probe = await page.evaluate((u) => window.bench.vlcProbeAndThumb(u), media).catch((e) => ({ error: e.message }));
  results.push(row);
}
// Time to first frame for a file the browser can't play: RealVideo 4 + Cook,
// 2 MB, header says two hours (so "whole file" means the 2 MB actually there).
// Save the sweep first: the showdown drives ffmpeg.wasm, which can hang.
writeFileSync(`${out}/results.json`, JSON.stringify({ date: new Date().toISOString(), machine, size, startup, results }, null, 1));
const showdown = await Promise.race([
  page.evaluate(() => window.bench.firstFrameShowdown('/corpus/media/realmedia/realvideo-4-cook-rmvb.rmvb')),
  new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 300000)),
]).catch((e) => ({ error: e.message }));
console.log('first frame showdown', showdown);
const memoryBytes = await page.evaluate(() => window.bench.memory()).catch(() => null);
const browserVersion = browser.version();
await browser.close();
await server.close();

if (previous) { startup.cold = previous.startup.cold; startup.warm = previous.startup.warm; }
const data = { showdown, date: previous?.date ?? new Date().toISOString(), machine, browser: `${(args.browser ?? 'chrome') === 'chrome' ? 'Chrome' : 'Chromium'} ${browserVersion}`, size, startup, memoryBytes, results };
writeFileSync(`${out}/results.json`, JSON.stringify(data, null, 1));
writeFileSync(`${out}/RESULTS.md`, report(data));
console.log(`\nwrote ${out}/RESULTS.md`);

function report(d) {
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;
  const L = [
    '# Benchmarks',
    '',
    `${d.date} · ${d.machine.cpu} (${d.machine.cores} cores, ${d.machine.memGB} GB) · macOS ${d.machine.os} · ${d.browser} (headless)`,
    '',
    '## Download size',
    '',
    '| binary | raw | gzip -9 | brotli -11 |', '|---|---|---|---|',
    ...Object.entries(d.size).map(([k, v]) => `| ${k} | ${mb(v.raw)} | ${mb(v.gzip)} | ${mb(v.brotli)} |`),
    '',
    '## Startup (createVLC() to ready, median of 3)',
    '',
    `cold (empty cache): **${med(d.startup.cold.map((x) => x.readyMs)).toFixed(0)} ms** · warm: **${med(d.startup.warm.map((x) => x.readyMs)).toFixed(0)} ms**`,
    '',
    '## Decode throughput, 1080p30, 5 s (frames per second, higher is better)',
    '',
    'The VLC columns run the whole player at 32x with frame dropping off, counting frames as the video output shows them:',
    'demux, decode, frame copy and (wasm) the WebGL upload, so they include player overhead and top out near the',
    'vout\'s pacing ceiling (~550 fps). The FFmpeg and ffmpeg.wasm columns are decode only (`-f null`).',
    'Native VLC 3 is forced to software decoding (`--codec=avcodec|dav1d`). WebCodecs is the browser\'s decoder',
    '(VideoToolbox on this Mac) driven through VLC. The last column compares like with like — the same player,',
    'native vs wasm, both in software; † marks results at the pacing ceiling, where the decoder is not the limit.',
    '',
    '| clip | threads | native FFmpeg | native VLC 3 | libvlc-wasm (software) | libvlc-wasm + WebCodecs | ffmpeg.wasm | native VLC ÷ libvlc-wasm |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of d.results) {
    for (const [t, x] of Object.entries(r.runs)) {
      const f = (v) => (v?.fps ? v.fps.toFixed(1) : v?.error ? 'error' : '—');
      const capped = (v) => v?.fps >= 450;
      const ratio = x.libvlcWasm?.fps && x.vlcNative?.fps
        ? `${(x.vlcNative.fps / x.libvlcWasm.fps).toFixed(2)}×${capped(x.vlcNative) && capped(x.libvlcWasm) ? ' †' : ''}` : '—';
      L.push(`| ${r.clip} | ${t} | ${f(x.ffmpegNative)} | ${f(x.vlcNative)} | ${f(x.libvlcWasm)} | ${f(x.libvlcWebCodecs)} | ${f(x.ffmpegWasm)} | ${ratio} |`);
    }
  }
  const sd = d.showdown ?? {};
  if (sd.vlcFirstFrameMs) {
    const ms = (v) => (v == null ? '—' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);
    L.push('', '## Time to first frame for a file the browser can\'t play', '',
      'RealVideo 4 + Cook (`.rmvb`, 2 MB). libvlc-wasm plays it directly; with ffmpeg.wasm it must first be',
      'transcoded to H.264/AAC MP4 (`-preset ultrafast`, 4 threads) and handed to `<video>`.', '',
      '| path | time to first frame |', '|---|---|',
      `| libvlc-wasm \`player.open(file)\` | **${ms(sd.vlcFirstFrameMs)}** |`,
      `| ffmpeg.wasm load (once per page) | ${ms(sd.ffmpegLoadMs)} |`,
      `| ffmpeg.wasm transcode first 10 s → \`<video>\` | ${ms(sd.ffmpegWasm_first10s_Ms)} |`,
      `| ffmpeg.wasm transcode whole file → \`<video>\` | ${ms(sd.ffmpegWasm_whole_Ms)} |`);
  }
  L.push('', '## Probe and thumbnail (libvlc-wasm)', '', '| clip | probe | thumbnail |', '|---|---|---|');
  for (const r of d.results) L.push(`| ${r.clip} | ${r.probe?.probeMs?.toFixed(0) ?? '—'} ms | ${r.probe?.thumbnailMs?.toFixed(0) ?? '—'} ms |`);
  return `${L.join('\n')}\n`;
}
