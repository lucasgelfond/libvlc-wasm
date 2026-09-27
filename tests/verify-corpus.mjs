// For every sample in corpus/manifest.json: can the browser play it natively,
// and does libvlc-wasm actually play it (frames with content, audible sound)?
//
//   node tests/verify-corpus.mjs [--engines=chromium,webkit,firefox] [--wasm-engines=chromium,webkit,firefox]
//                                [--only=category-or-id [--merge]] [--out=dir]
//
// --engines picks the browsers for the native checks; --wasm-engines the browsers libvlc-wasm is
// played in (default chromium). Each row's `vlc` stays the Chromium result (or the first
// --wasm-engines entry when Chromium is not among them); `vlcByEngine` holds every engine's.
//
// Writes corpus/results/results.json (rendered by the site) and a
// snapshot per video sample.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, openHarness, root } from './lib/browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const nativeEngines = (args.engines ?? 'chromium').split(',');
const wasmEngines = (args['wasm-engines'] ?? 'chromium').split(',');
const primaryEngine = wasmEngines.includes('chromium') ? 'chromium' : wasmEngines[0];
const only = args.only;
const seconds = +(args.seconds ?? 4);

const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
let reference = {};
try { reference = JSON.parse(readFileSync(`${root}/corpus/reference.json`, 'utf8')); } catch { console.warn('no corpus/reference.json; run node corpus/reference.mjs'); }
const samples = manifest.samples.filter((s) => !only || s.category === only || s.id === only);
// --out keeps a test run's results out of the committed corpus/results.
const outDir = args.out ? resolve(args.out) : `${root}/corpus/results`;
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

// 2. libvlc-wasm, in each --wasm-engines browser.
// Another build may relink packages/core/wasm mid-run; a page that loaded a half-written module
// fails with 'Import #0 "env"' and is simply reopened.
const SOUNDFONT = { soundfont: '/corpus/media/assets/TimGM6mb.sf2' };
async function openVlc(engine) {
  for (let attempt = 0; ; attempt++) {
    const h = await openHarness(url, engine);
    try {
      await h.page.evaluate((o) => window.harness.ensureVLC(o), SOUNDFONT);
      return h;
    } catch (e) {
      await h.browser.close().catch(() => {});
      if (attempt >= 4) throw e;
      console.warn(`[${engine}] VLC did not start (${String(e.message).slice(0, 120)}); retrying`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function judge(s, r) {
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
  return {
    passed, expectedFailure: s.test?.expectFail ?? null, knownIssue: s.test?.knownIssue ?? null,
    checks: Object.fromEntries(checks.map(([k, v]) => [k, v])),
    error: r.error ?? null, events: r.events,
    tracks: r.tracks, video: r.video, audio: r.audio, timings: r.timings,
    stats: r.stats && { lostPictures: r.stats.lostPictures, latePictures: r.stats.latePictures, audioDropped: r.stats.audioDropped, audioUnderruns: r.stats.audioUnderruns },
    logs: passed ? undefined : r.logs,
  };
}

const byEngine = {}; // engine -> id -> { vlc, snapshot, wallMs }
let consoleLines = [];
for (const engine of wasmEngines) {
  let h = await openVlc(engine);
  consoleLines = h.consoleLines;
  const out = (byEngine[engine] = {});
  for (const s of samples) {
    const t0 = Date.now();
    const c = s.test?.mode === 'subtitles-over'
      ? { url: media(s.test.video), subtitles: [media(s.file), ...(s.companions ?? []).map((x) => media(x.file))] }
      : { url: media(s.file), options: s.test?.options ?? [] };
    let r;
    for (let attempt = 0; ; attempt++) {
      try {
        r = await Promise.race([
          h.page.evaluate((cc) => window.harness.playCase({ ...cc, seconds: cc.seconds, snapshot: true }), { ...c, seconds }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), (seconds + 25) * 1000)),
        ]);
      } catch (e) {
        r = { error: e.message, video: {}, audio: {}, tracks: [], events: [], timings: {}, stats: {} };
        // A hung or crashed page is unusable for the next sample; start over.
        await h.browser.close().catch(() => {});
        h = await openVlc(engine);
        consoleLines = h.consoleLines;
      }
      if (!/Import #0 "env"/.test(r.error ?? '') || attempt >= 2) break;
    }
    const vlc = judge(s, r);
    out[s.id] = { vlc, snapshot: r.snapshot ?? null, wallMs: Date.now() - t0 };
    const nat = Object.entries(native[s.id] ?? {}).map(([e, v]) => `${e[0]}:${v.ok ? 'Y' : 'n'}`).join(' ');
    const tag = vlc.passed ? 'PASS' : vlc.expectedFailure ? 'XFAIL' : vlc.knownIssue ? 'KNOWN' : 'FAIL';
    console.log(`[${engine}] ${tag}  ${s.id.padEnd(46)} native[${nat}]  ${Object.entries(vlc.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'NO'}`).join(' ')}  ${vlc.error ?? ''}`);
  }
  await h.browser.close().catch(() => {});
}

/** The per-engine verdict kept in vlcByEngine: `vlc` has the full detail for the primary engine. */
function compact(v) {
  return {
    passed: v.passed, checks: v.checks, error: v.error, expectedFailure: v.expectedFailure, knownIssue: v.knownIssue,
    firstFrameMs: v.timings?.openToFirstFrameMs != null ? Math.round(v.timings.openToFirstFrameMs) : null,
    framesDrawn: v.video?.framesDrawn ?? null, maxVariance: v.video?.maxVariance != null ? Math.round(v.video.maxVariance) : null,
    audioFramesPlayed: v.audio?.framesPlayed ?? null, peakDb: v.audio?.peakDb ?? null,
    tracks: (v.tracks ?? []).map((t) => `${t.type}:${t.codecName ?? t.codec}`),
    logs: v.passed ? undefined : (v.logs ?? []).slice(-30),
  };
}

const results = [];
for (const s of samples) {
  const primary = byEngine[primaryEngine][s.id];
  let shot = null;
  // Snapshots are the primary engine's, as before; the other engines' go to shots/<engine>/.
  for (const engine of wasmEngines) {
    const snap = byEngine[engine][s.id].snapshot;
    if (!snap) continue;
    const rel = engine === primaryEngine ? `shots/${s.id}.jpg` : `shots/${engine}/${s.id}.jpg`;
    if (engine !== primaryEngine) mkdirSync(`${outDir}/shots/${engine}`, { recursive: true });
    writeFileSync(`${outDir}/${rel}`, Buffer.from(snap.split(',')[1], 'base64'));
    if (engine === primaryEngine) shot = rel;
  }
  results.push({
    id: s.id, name: s.name, category: s.category, file: s.file,
    native: native[s.id] ?? null,
    vlc: primary.vlc,
    vlcByEngine: Object.fromEntries(wasmEngines.map((e) => [e, compact(byEngine[e][s.id].vlc)])),
    shot,
    wallMs: primary.wallMs,
  });
}
await server.close();

// A partial run (--only) must not replace the full report, unless --merge asks for its rows to
// replace those rows in it: re-running a sample that failed only because the machine was busy.
// Only the engines this run played are replaced; the file's native checks stay as they were.
if (only && args.merge) {
  const prev = JSON.parse(readFileSync(`${outDir}/results.json`, 'utf8'));
  const prevPrimary = prev.wasmEngines?.includes('chromium') ? 'chromium' : prev.wasmEngines?.[0] ?? 'chromium';
  for (const r of results) {
    const p = prev.results.find((x) => x.id === r.id);
    if (!p) {
      // A sample added to the manifest since the full run: its row goes in whole, in manifest order.
      const order = manifest.samples.map((x) => x.id);
      prev.results.push({ ...r, rerun: wasmEngines });
      prev.results.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      continue;
    }
    // Refresh this run's native checks too; engines it did not check keep their old result.
    if (r.native) p.native = { ...(p.native ?? {}), ...r.native };
    p.vlcByEngine ??= {};
    for (const e of wasmEngines) {
      p.vlcByEngine[e] = r.vlcByEngine[e];
      if (e === prevPrimary) { p.vlc = byEngine[e][r.id].vlc; p.wallMs = byEngine[e][r.id].wallMs; }
    }
    p.rerun = [...new Set([...(p.rerun ?? []), ...wasmEngines])];
  }
  prev.rerunDate = new Date().toISOString();
  writeFileSync(`${outDir}/results.json`, JSON.stringify(prev, null, 1));
} else if (only) {
  writeFileSync(`${outDir}/partial-${only}.json`, JSON.stringify({ date: new Date().toISOString(), nativeEngines, wasmEngines, results }, null, 1));
} else {
  writeFileSync(`${outDir}/results.json`, JSON.stringify({ date: new Date().toISOString(), nativeEngines, wasmEngines, results }, null, 1));
}
for (const e of wasmEngines) {
  const pass = samples.filter((s) => byEngine[e][s.id].vlc.passed).length;
  console.log(`${e}: ${pass}/${samples.length} play in libvlc-wasm`);
}
const pass = results.filter((r) => r.vlc.passed).length;
const nativeNo = results.filter((r) => r.native && !r.native.chromium?.ok).length;
console.log(`\n${pass}/${results.length} play in libvlc-wasm (${primaryEngine}); ${nativeNo} of them Chromium cannot play natively`);
if (process.env.CONSOLE) console.log(consoleLines.join('\n'));

