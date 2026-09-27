// For every sample in corpus/manifest.json: can the browser play it natively,
// and does libvlc-wasm actually play it (frames with content, audible sound)?
//
//   node tests/verify-corpus.mjs [--engines=chromium,webkit,firefox] [--only=category-or-id]
//
// Writes corpus/results/results.json, corpus/results/RESULTS.md and a
// snapshot per video sample.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { startServer, openHarness, root } from './lib/browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const nativeEngines = (args.engines ?? 'chromium').split(',');
const only = args.only;
const seconds = +(args.seconds ?? 4);

const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
let reference = {};
try { reference = JSON.parse(readFileSync(`${root}/corpus/reference.json`, 'utf8')); } catch { console.warn('no corpus/reference.json; run node corpus/reference.mjs'); }
const samples = manifest.samples.filter((s) => !only || s.category === only || s.id === only);
const outDir = `${root}/corpus/results`;
mkdirSync(`${outDir}/shots`, { recursive: true });

const { server, url } = await startServer();
const media = (f) => `/corpus/media/${f}`;

// 1. Native support, per engine.
const native = {};
for (const engine of nativeEngines) {
  const { browser, page } = await openHarness(url, engine);
  for (const s of samples) {
    if (s.test?.mode === 'subtitles-over') continue;
    const r = await page.evaluate((u) => window.harness.nativeCheck(u, 5000), media(s.file)).catch((e) => ({ ok: false, reason: e.message }));
    (native[s.id] ??= {})[engine] = r;
  }
  await browser.close();
  console.log(`native checks done in ${engine}`);
}

// 2. libvlc-wasm, in Chromium.
let { browser, page, consoleLines } = await openHarness(url, 'chromium');
async function restart() {
  await browser.close().catch(() => {});
  ({ browser, page, consoleLines } = await openHarness(url, 'chromium'));
  await page.evaluate(() => window.harness.ensureVLC({ soundfont: '/corpus/media/assets/TimGM6mb.sf2' }));
}
await page.evaluate(() => window.harness.ensureVLC({ soundfont: '/corpus/media/assets/TimGM6mb.sf2' }));
const results = [];
for (const s of samples) {
  const t0 = Date.now();
  const c = s.test?.mode === 'subtitles-over'
    ? { url: media(s.test.video), subtitles: [media(s.file), ...(s.companions ?? []).map((x) => media(x.file))] }
    : { url: media(s.file) };
  let r;
  try {
    r = await Promise.race([
      page.evaluate((cc) => window.harness.playCase({ ...cc, seconds: cc.seconds, snapshot: true }), { ...c, seconds }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), (seconds + 25) * 1000)),
    ]);
  } catch (e) {
    r = { error: e.message, video: {}, audio: {}, tracks: [], events: [], timings: {}, stats: {} };
    // A hung or crashed page is unusable for the next sample; start over.
    await restart();
  }

  const wantVideo = !!s.video;
  const wantAudio = !!s.audio;
  const videoOk = (r.video.framesDrawn ?? 0) >= 1 && (r.video.maxVariance ?? 0) > 2;
  // Judged against what native FFmpeg / VLC make of the same seconds
  // (corpus/reference.json): some samples are near-silent by design.
  const ref = reference[s.id]?.peakDb;
  const peakDb = r.audio.peak > 0 ? 20 * Math.log10(r.audio.peak) : -Infinity;
  r.audio.peakDb = Number.isFinite(peakDb) ? +peakDb.toFixed(1) : null;
  r.audio.referencePeakDb = ref ?? null;
  const audioOk = (r.audio.framesPlayed ?? 0) > 0 && (
    ref == null ? r.audio.peak > 0.003 : ref < -50 ? true : peakDb >= ref - 15);
  const textTracks = (r.tracks ?? []).filter((t) => t.type === 'text').length;
  const checks = [];
  if (wantVideo) checks.push(['video', videoOk]);
  if (wantAudio) checks.push(['audio', audioOk]);
  if (s.test?.mode === 'subtitles-over') checks.push(['subtitle track', textTracks > 0]);
  if (!checks.length) checks.push(['anything', videoOk || audioOk]);
  const passed = checks.every(([, ok]) => ok) && !r.error;

  let shot = null;
  if (r.snapshot) {
    shot = `shots/${s.id}.jpg`;
    writeFileSync(`${outDir}/${shot}`, Buffer.from(r.snapshot.split(',')[1], 'base64'));
  }
  const row = {
    id: s.id, name: s.name, category: s.category, file: s.file,
    native: native[s.id] ?? null,
    vlc: {
      passed, expectedFailure: s.test?.expectFail ?? null, knownIssue: s.test?.knownIssue ?? null,
      checks: Object.fromEntries(checks.map(([k, v]) => [k, v])),
      error: r.error ?? null, events: r.events,
      tracks: r.tracks, video: r.video, audio: r.audio, timings: r.timings,
      stats: r.stats && { lostPictures: r.stats.lostPictures, latePictures: r.stats.latePictures, audioDropped: r.stats.audioDropped, audioUnderruns: r.stats.audioUnderruns },
      logs: passed ? undefined : r.logs,
    },
    shot,
    wallMs: Date.now() - t0,
  };
  results.push(row);
  const nat = Object.entries(row.native ?? {}).map(([e, v]) => `${e[0]}:${v.ok ? 'Y' : 'n'}`).join(' ');
  console.log(`${passed ? 'PASS' : s.test?.expectFail ? 'XFAIL' : s.test?.knownIssue ? 'KNOWN' : 'FAIL'}  ${s.id.padEnd(46)} native[${nat}]  ${checks.map(([k, v]) => `${k}:${v ? 'ok' : 'NO'}`).join(' ')}  ${r.error ?? ''}`);
}
await browser.close();
await server.close();

// A partial run (--only) must not replace the full report.
if (only) {
  writeFileSync(`${outDir}/partial-${only}.json`, JSON.stringify({ date: new Date().toISOString(), nativeEngines, results }, null, 1));
} else {
  writeFileSync(`${outDir}/results.json`, JSON.stringify({ date: new Date().toISOString(), nativeEngines, results }, null, 1));
  writeFileSync(`${outDir}/RESULTS.md`, report(results));
}
const pass = results.filter((r) => r.vlc.passed).length;
const nativeNo = results.filter((r) => r.native && !r.native.chromium?.ok).length;
console.log(`\n${pass}/${results.length} play in libvlc-wasm; ${nativeNo} of them Chromium cannot play natively`);
if (process.env.CONSOLE) console.log(consoleLines.join('\n'));

function report(rows) {
  const lines = [
    '# Corpus results',
    '',
    `Generated ${new Date().toISOString()} by \`node tests/verify-corpus.mjs\`. Native = the browser's own`,
    '`<video>`/`<audio>` reached `loadeddata`. libvlc-wasm = played in headless Chromium with frames that have',
    'content (pixel variance) and/or audible output (RMS through an AnalyserNode).',
    '',
    `| sample | category | ${nativeEngines.map((e) => `native ${e}`).join(' | ')} | libvlc-wasm | first frame | notes |`,
    `|---|---|${nativeEngines.map(() => '---').join('|')}|---|---|---|`,
  ];
  for (const r of rows) {
    const nat = nativeEngines.map((e) => (r.native?.[e] ? (r.native[e].ok ? 'yes' : 'no') : '—'));
    const v = r.vlc.passed ? '✅ plays' : r.vlc.expectedFailure ? '➖ VLC can\'t either' : r.vlc.knownIssue ? '⚠️ known issue' : '❌ FAIL';
    const ff = r.vlc.timings?.openToFirstFrameMs ? `${Math.round(r.vlc.timings.openToFirstFrameMs)} ms` : '';
    const notes = r.vlc.passed ? (r.vlc.tracks ?? []).map((t) => t.codecName ?? t.codec).filter(Boolean).join(', ')
      : (r.vlc.expectedFailure ?? r.vlc.knownIssue ?? r.vlc.error ?? Object.entries(r.vlc.checks).filter(([, ok]) => !ok).map(([k]) => `no ${k}`).join(', '));
    lines.push(`| ${r.name} | ${r.category} | ${nat.join(' | ')} | ${v} | ${ff} | ${notes} |`);
  }
  return `${lines.join('\n')}\n`;
}
