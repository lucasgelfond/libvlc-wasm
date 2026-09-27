// Draws the benchmark summary image from bench/results/results.json and
// corpus/compat/compat.json: decode speed per codec, time to first frame for a
// file the browser can't play, and how many corpus formats each tool plays.
//   node bench/chart.mjs   -> bench/results/chart.svg, chart.png (2x)
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { root } from '../tests/lib/browser.mjs';

const bench = JSON.parse(readFileSync(`${root}/bench/results/results.json`, 'utf8'));
const compat = JSON.parse(readFileSync(`${root}/corpus/compat/compat.json`, 'utf8'));

const W = 1200, PAD = 48;
const INK = '#171717', MUTED = '#737373', GRID = '#e5e5e5';
const SERIES = [
  { key: 'ffmpegNative', label: 'FFmpeg (native)', color: '#a3a3a3' },
  { key: 'vlcNative', label: 'VLC desktop (native)', color: '#7c2d12' },
  { key: 'libvlcWasm', label: 'libvlc-wasm, software', color: '#f97316' },
  { key: 'libvlcWebCodecs', label: 'libvlc-wasm + WebCodecs', color: '#16a34a' },
  { key: 'ffmpegWasm', label: 'ffmpeg.wasm', color: '#2563eb' },
];
const CLIPS = [
  ['h264_1080p.mkv', 'H.264'], ['hevc_1080p.mkv', 'HEVC'], ['vp9_1080p.webm', 'VP9'], ['av1_1080p.mkv', 'AV1'],
  ['mpeg4asp_1080p.avi', 'MPEG-4 ASP'], ['msmpeg4_1080p.avi', 'MS-MPEG4 (DivX 3)'], ['mjpeg_1080p.avi', 'Motion-JPEG'],
  ['mpeg2_1080p.mpg', 'MPEG-2'],
];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, s, { size = 13, weight = 400, fill = INK, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

let y = PAD;
const out = [];
out.push(text(PAD, y + 8, 'libvlc-wasm: VLC 4 in the browser, benchmarked', { size: 24, weight: 650 }));
y += 34;
out.push(text(PAD, y, `${bench.machine.cpu} · ${bench.browser} · ${bench.date.slice(0, 10)} · every number measured, none estimated`, { fill: MUTED }));
y += 40;

// Panel 1: decode speed, 1080p, one thread.
out.push(text(PAD, y, 'Decode speed, 1080p, one thread (frames per second, higher is better)', { size: 16, weight: 600 }));
y += 22;
let lx = PAD;
for (const s of SERIES) {
  out.push(`<rect x="${lx}" y="${y - 10}" width="12" height="12" rx="2" fill="${s.color}"/>`);
  out.push(text(lx + 18, y, s.label, { size: 12, fill: MUTED }));
  lx += 30 + s.label.length * 6.6;
}
y += 18;
const labelW = 150, chartX = PAD + labelW, chartW = W - chartX - PAD - 40;
const max = 700, BAR = 11, GAP = 2;
const scale = (v) => (Math.min(v, max) / max) * chartW;
const top = y;
const groupH = SERIES.length * (BAR + GAP) + 16;
for (const t of [0, 100, 200, 300, 400, 500, 600, 700]) {
  const x = chartX + scale(t);
  out.push(`<line x1="${x}" x2="${x}" y1="${top}" y2="${top + CLIPS.length * groupH}" stroke="${GRID}"/>`);
  out.push(text(x, top + CLIPS.length * groupH + 16, t, { size: 11, fill: MUTED, anchor: 'middle' }));
}
// The player's display pacing ceiling: past it the decoder is not the limit.
const ceil = chartX + scale(550);
out.push(`<line x1="${ceil}" x2="${ceil}" y1="${top - 4}" y2="${top + CLIPS.length * groupH}" stroke="${MUTED}" stroke-dasharray="4 4"/>`);
out.push(text(ceil + 4, top + 6, 'player pacing ceiling', { size: 10, fill: MUTED }));
for (const [clip, name] of CLIPS) {
  const r = bench.results.find((x) => x.clip === clip)?.runs?.['1'] ?? {};
  out.push(text(PAD, y + groupH / 2 - 4, name, { size: 13, weight: 550 }));
  let by = y;
  for (const s of SERIES) {
    const v = r[s.key]?.fps;
    if (v) {
      out.push(`<rect x="${chartX}" y="${by}" width="${Math.max(1, scale(v))}" height="${BAR}" rx="2" fill="${s.color}"/>`);
      out.push(text(chartX + scale(v) + 5, by + BAR - 1.5, `${Math.round(v)}${v > max ? '+' : ''}`, { size: 10, fill: MUTED }));
    } else {
      out.push(text(chartX + 4, by + BAR - 1.5, s.key === 'libvlcWebCodecs' ? 'no browser decoder' : s.key === 'ffmpegWasm' ? 'no AV1 decoder' : '—', { size: 10, fill: MUTED }));
    }
    by += BAR + GAP;
  }
  y += groupH;
}
y += 44;

// Panel 2: first frame of a file no browser plays.
const sd = bench.showdown;
out.push(text(PAD, y, 'Time to first frame of a RealVideo file no browser plays (ms, lower is better)', { size: 16, weight: 600 }));
y += 20;
const ttff = [
  ['libvlc-wasm: open() and play', sd.vlcFirstFrameMs, [['plays directly', sd.vlcFirstFrameMs, '#f97316']]],
  ['ffmpeg.wasm: convert the first 10 s, then <video>', sd.ffmpegLoadMs + sd.ffmpegWasm_first10s_Ms,
    [['load', sd.ffmpegLoadMs, '#93c5fd'], ['transcode', sd.ffmpegWasm_first10s_Ms, '#2563eb']]],
  ['ffmpeg.wasm: convert the whole file, then <video>', sd.ffmpegLoadMs + sd.ffmpegWasm_whole_Ms,
    [['load', sd.ffmpegLoadMs, '#93c5fd'], ['transcode', sd.ffmpegWasm_whole_Ms, '#2563eb']]],
];
const tMax = 1400, tW = W - PAD * 2 - 330 - 60;
for (const [label, total, parts] of ttff) {
  out.push(text(PAD, y + 13, label, { size: 13 }));
  let x = PAD + 330;
  for (const [, v, c] of parts) {
    const w = Math.max(2, (v / tMax) * tW);
    out.push(`<rect x="${x}" y="${y + 2}" width="${w}" height="16" rx="2" fill="${c}"/>`);
    x += w;
  }
  out.push(text(x + 6, y + 15, `${Math.round(total)} ms`, { size: 12, weight: 600 }));
  y += 26;
}
y += 34;

// Panel 3: formats that play, from the compatibility matrix.
const n = compat.samples.length;
const plays = (pick) => compat.samples.filter(pick).length;
const decodes = (k) => (s) => { const d = s[k]; if (!d) return false; const want = [s.video && s.video !== 'none' ? d.video : null, s.audio && s.audio !== 'none' ? d.audio : null].filter((x) => x !== null); return want.length > 0 && want.every(Boolean); };
const vjTested = compat.samples.filter((s) => s.vlcjs !== null && s.vlcjs !== undefined);
const bars = [
  ['libvlc-wasm', plays((s) => s.libvlcWasm?.passed), n, '#f97316', 'plays in the page'],
  ['VLC desktop 3.0.24', plays(decodes('nativeVlc')), n, '#7c2d12', 'native app'],
  ['ffmpeg.wasm', plays(decodes('ffmpegWasm')), n, '#2563eb', 'decodes; converts before showing'],
  ['vlc.js (addyosmani)', vjTested.filter((s) => s.vlcjs).length, vjTested.length, '#a855f7', 'video samples only'],
  ['The browser alone', plays((s) => s.browsers?.chromium || s.browsers?.webkit || s.browsers?.firefox), n, '#a3a3a3', 'Chrome, Safari or Firefox'],
];
out.push(text(PAD, y, `Formats played from a ${n}-file corpus of formats browsers can't play`, { size: 16, weight: 600 }));
y += 20;
const fW = W - PAD * 2 - 180 - 330;
for (const [label, v, of, c, note] of bars) {
  out.push(text(PAD, y + 13, label, { size: 13, weight: 550 }));
  out.push(`<rect x="${PAD + 180}" y="${y + 2}" width="${fW}" height="16" rx="2" fill="${GRID}"/>`);
  out.push(`<rect x="${PAD + 180}" y="${y + 2}" width="${(v / of) * fW}" height="16" rx="2" fill="${c}"/>`);
  out.push(text(PAD + 180 + fW + 8, y + 15, `${v} / ${of}`, { size: 12, weight: 600 }));
  out.push(text(PAD + 180 + fW + 64, y + 15, note, { size: 11, fill: MUTED }));
  y += 26;
}
y += 30;
out.push(text(PAD, y, 'VLC columns run the whole player (demux, decode, copy, WebGL upload) at 32x; FFmpeg columns decode only. Native VLC is forced to software decoding.', { size: 11, fill: MUTED }));
y += 16;
out.push(text(PAD, y, 'Sources: bench/run.mjs, bench/results/RESULTS.md, corpus/compat/build.mjs, tests/verify-corpus.mjs.', { size: 11, fill: MUTED }));
y += PAD - 10;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" font-family="Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
<rect width="${W}" height="${y}" fill="#ffffff"/>
${out.join('\n')}
</svg>
`;
writeFileSync(`${root}/bench/results/chart.svg`, svg);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: Math.ceil(y) }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: `${root}/bench/results/chart.png`, clip: { x: 0, y: 0, width: W, height: Math.ceil(y) } });
await browser.close();
const app = `${root}/apps/player/static`;
if (existsSync(app)) copyFileSync(`${root}/bench/results/chart.png`, `${app}/benchmarks.png`);
console.log(`bench/results/chart.svg, chart.png (${W}x${Math.ceil(y)} @2x)`);
