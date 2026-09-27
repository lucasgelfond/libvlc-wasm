// Merges every per-engine measurement of the in-browser players into one matrix for the formats
// page: each tool x each engine (Chromium, WebKit, Firefox) x every sample in corpus/manifest.json.
//
//   node bench/compare/ports-matrix.mjs
//
// Reads (nothing is measured here; run these first):
//   corpus/results/results.json          tests/verify-corpus.mjs --engines=chromium,webkit,firefox
//                                        --wasm-engines=chromium,webkit,firefox  (libvlc-wasm, native)
//   corpus/compat/measurements.json      corpus/compat/build.mjs --measure=wasm --wasm-engines=...
//                                        (ffmpeg.wasm; Chromium in `wasm`, the others in wasmByEngine)
//   bench/compare/<port>[-<engine>]-results.json   vlcjs.mjs, krowemoh.mjs, jbk.mjs (twice), webvlc.mjs
//                                        each with --engine=chromium|webkit|firefox
// Writes bench/compare/ports-matrix.json (JSON only: the site renders it).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { root, launchMuted } from '../../tests/lib/browser.mjs';

const ENGINES = ['chromium', 'webkit', 'firefox'];
const read = (p) => JSON.parse(readFileSync(`${root}/${p}`, 'utf8'));
const manifest = read('corpus/manifest.json');
const verify = read('corpus/results/results.json');
const meas = read('corpus/compat/measurements.json');
const rev = (dir) => { try { return execFileSync('git', ['-C', `${root}/${dir}`, 'log', '-1', '--format=%h %cs'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

const VIDEOLABS_BINARY = 'VideoLabs\' 2024-03-07 build of VLC 4.0.0-dev (experimental.wasm, 27 MB; no build scripts, cannot be rebuilt)';
const ports = [
  { key: 'vlcjs', base: 'vlcjs', label: 'addyosmani/vlc.js', repo: 'https://github.com/addyosmani/vlc.js',
    version: `${rev('.research/vlc.js') ?? 'unknown'}; ${VIDEOLABS_BINARY}`,
    obtained: 'git clone --depth 1 into .research/vlc.js; served by its own Vite config (COOP same-origin, COEP credentialless) and driven through its own UI (#input-file, #canvas). Unmodified.',
    notes: 'A VLC-styled UI over the VideoLabs binary, started with --codec=webcodec --aout=emworklet_audio.' },
  { key: 'krowemoh', base: 'krowemoh', label: 'Krowemoh/vlc.js', repo: 'https://github.com/Krowemoh/vlc.js',
    version: `${rev('.research/krowemoh') ?? 'unknown'}; ${VIDEOLABS_BINARY}`,
    obtained: 'git clone --depth 1 into .research/krowemoh. Its index.html is a SyntaxError as shipped (a missing comma before `options:`), so the harness serves that page with the comma added and `source` pointed at the sample; the wrapper, options and binary are the repo\'s.',
    notes: 'The VideoLabs binary re-hosted behind a ~100-line VLCPlayer() wrapper that fetch()es a URL into a File.' },
  { key: 'jbk-demo', base: 'jbk', label: 'jbk/vlc.js (published demo)', repo: 'https://code.videolan.org/jbk/vlc.js',
    version: `videolabs.io/communication/vlcjs-demo as mirrored 2026-09-27; ${VIDEOLABS_BINARY}`,
    obtained: 'The repo has no prebuilt binary (CI artifacts expired 2022-11-04), so the published demo page (jbk\'s vlc.html + lib/) was mirrored with curl into .research/vlcjs-jbk-demo. Its play button and chapter arrows are hidden so the picture check sees only what libvlc drew.',
    notes: 'jbk\'s own player page, which the other vlc.js projects derive from.' },
  { key: 'jbk-source', base: 'jbk-source-build', label: 'jbk/vlc.js (built from source)', repo: 'https://code.videolan.org/jbk/vlc.js',
    version: 'branch incoming af59a33 (2022-10-14) + VLC 06e361b1 with the repo\'s vlc_patches/aug; built 2026-09-27',
    obtained: 'Built in the project\'s own CI image (registry.videolan.org/vlc-debian-wasm-emscripten:20220505193036, amd64 under emulation, ~40 min) with two fixes for bitrot: emsdk pinned to 3.1.18 (master needs python >= 3.10) and glslang\'s branch renamed master -> main. Output in .research/vlcjs-jbk-build; steps in the header of bench/compare/jbk.mjs.',
    notes: 'The same vlc.html as the demo, from source: shows the project still builds.' },
  { key: 'webvlc', base: 'webvlc', label: 'addyosmani/webvlc', repo: 'https://github.com/addyosmani/webvlc',
    version: rev('.research/webvlc') ?? 'unknown',
    obtained: 'git clone --depth 1 into .research/webvlc, npm i && npx vite build; its production build is served and driven through its file input. It never loads the first video opened in a fresh page, so each file is opened twice and the second attempt measured.',
    notes: 'A React UI over the browser\'s own <video>/<audio> (plus a butterchurn visualiser); it contains no wasm and no VLC, and drops files whose extension is not on its allow-list.' },
];

/** Why a tool cannot run in an engine at all, where that is known rather than just observed. */
const KNOWN_ENGINE_BLOCKERS = {
  vlcjs: { webkit: 'Its server sends Cross-Origin-Embedder-Policy: credentialless, which WebKit does not implement, so the page is not cross-origin isolated and SharedArrayBuffer (which the pthread build needs) is undefined: "ReferenceError: Can\'t find variable: SharedArrayBuffer". The other VideoLabs-binary ports use require-corp and do start in WebKit.' },
};

const portFile = (base, e) => `bench/compare/${base}${e === 'chromium' ? '' : `-${e}`}-results.json`;
const portData = {};
for (const p of ports) {
  portData[p.key] = {};
  for (const e of ENGINES) {
    const f = portFile(p.base, e);
    portData[p.key][e] = existsSync(`${root}/${f}`) ? read(f) : null;
  }
}

/** plays = every stream the sample has came out (video shown, audio audible); like libvlc-wasm's `passed`. */
const combine = (s, video, audio) => (s.video && video !== true) || (s.audio && audio !== true) ? false : (s.video || s.audio ? true : null);

function libvlcCell(s, e) {
  const row = verify.results.find((r) => r.id === s.id);
  const v = row?.vlcByEngine?.[e] ?? (e === 'chromium' ? row?.vlc : null);
  if (!v) return { plays: null, video: null, audio: null, note: 'not measured' };
  const failed = Object.entries(v.checks ?? {}).filter(([, ok]) => !ok).map(([k]) => `no ${k}`);
  const note = v.passed ? (v.knownIssue ? `plays (known flaky: ${v.knownIssue})` : null)
    : [v.expectedFailure && `expected failure: ${v.expectedFailure}`, v.knownIssue && `known issue: ${v.knownIssue}`, v.error, failed.join(', ')].filter(Boolean).join('; ');
  return { plays: v.passed, video: v.checks?.video ?? null, audio: v.checks?.audio ?? null, note: note || null };
}

function ffmpegCell(s, e) {
  const m = e === 'chromium' ? meas.wasm?.[s.id] : meas.wasmByEngine?.[e]?.[s.id];
  if (!m) return { plays: null, video: null, audio: null, note: 'not measured' };
  if (m.loadError) return { plays: false, video: s.video ? false : null, audio: s.audio ? false : null, note: `ffmpeg.wasm did not load: ${m.loadError}` };
  if (m.subs) {
    const ok = m.subs.subtitleKiB > 0;
    return { plays: ok, video: null, audio: null, note: ok ? `${m.subs.subtitleKiB} KiB of subpictures decoded (decode only)` : `no subtitles decoded${m.subs.firstError ? `: ${m.subs.firstError}` : ''}` };
  }
  const video = s.video ? m.video.frames > 0 : null;
  const audio = s.audio ? m.audio.samples > 0 : null;
  const err = (s.video && !video ? m.video.firstError : null) ?? (s.audio && !audio ? m.audio.firstError : null);
  const bits = [];
  if (s.video) bits.push(`${m.video.frames} frames`);
  if (s.audio) bits.push(`${m.audio.samples} audio samples`);
  if (err) bits.push(err);
  return { plays: combine(s, video, audio), video, audio, note: `decode only (no playback): ${bits.join('; ')}` };
}

const NOT_SINGLE_FILE = 'not measured: this sample is a VobSub .idx/.sub pair laid over a separate video, and the harness only opens one file through the port\'s UI';

function portCell(p, s, e) {
  const d = portData[p.key][e];
  if (!d) return { plays: null, video: null, audio: null, note: 'not run' };
  const r = d.results.find((x) => x.id === s.id);
  if (!r) return { plays: null, video: null, audio: null, note: s.test?.mode === 'subtitles-over' ? NOT_SINGLE_FILE : 'not run' };
  const video = s.video ? r.video === true : null;
  const audio = s.audio ? r.audible === true : null;
  const plays = combine(s, video, audio);
  const bits = [];
  if (!r.ready) bits.push('did not start');
  if (r.crashed) bits.push('page crashed');
  if (r.rejectedByUi) bits.push('webvlc\'s extension filter refused the file');
  if (r.browserAlone && !plays) {
    const b = r.browserAlone;
    bits.push(`the same file in a bare <${s.video ? 'video' : 'audio'}>: ${b.video || (!s.video && b.audible) ? 'plays' : 'fails too'}`);
  }
  if (!plays && KNOWN_ENGINE_BLOCKERS[p.key]?.[e]) bits.push(`the port cannot run in ${e} (see tools[].engineBlockers)`);
  if (!plays) {
    if (s.video && !video) bits.push('no picture');
    if (s.audio && !audio) bits.push('no audio');
    if (s.test?.options?.some((o) => /decryption_key/.test(o))) bits.push('no way to pass the ClearKey key');
    const err = r.errors.find((x) => !/unknown command customCmd|Failed to load resource|^\[object Object\]$/.test(x));
    if (err) bits.push(err.slice(0, 160));
  }
  if (plays && r.firstFrameMs != null) bits.push(`first picture ${r.firstFrameMs} ms`);
  return { plays, video, audio, note: bits.join('; ') || null };
}

function nativeCell(s, e) {
  const row = verify.results.find((r) => r.id === s.id);
  const n = row?.native?.[e];
  if (!n) return { plays: null, video: null, audio: null, note: s.test?.mode === 'subtitles-over' ? 'not measured: external VobSub subtitles, not a single media file' : 'not measured' };
  const video = s.video ? n.ok && !n.audioOnly : null;
  const plays = s.video ? video : n.ok;
  return { plays, video, audio: s.video ? null : n.ok, note: n.ok ? (n.audioOnly ? 'loaded, but no video track decoded (audio only)' : 'reached loadeddata') : n.reason };
}

const tools = [
  { key: 'libvlc-wasm', label: 'libvlc-wasm', repo: null, obtained: 'This repository\'s build (packages/core), played through tests/browser/ by tests/verify-corpus.mjs.', version: `${JSON.parse(readFileSync(`${root}/packages/core/package.json`, 'utf8')).version} (${rev('.') ?? ''}), results ${verify.date}`,
    notes: 'tests/verify-corpus.mjs: 4 s of playback; a picture with content and audio within 15 dB of native FFmpeg\'s peak.', cell: libvlcCell },
  { key: 'ffmpeg.wasm', label: 'ffmpeg.wasm', repo: 'https://github.com/ffmpegwasm/ffmpeg.wasm', obtained: 'npm @ffmpeg/ffmpeg 0.12.15 + @ffmpeg/core 0.12.10 (single-threaded UMD core loaded through blob URLs), run by corpus/compat/build.mjs --measure=wasm.', version: meas.tools.ffmpegWasm ?? '@ffmpeg/core 0.12.10',
    notes: 'corpus/compat/build.mjs: decodes the first 10 s to the null muxer (video frames > 0, audio samples > 0). Decoding only: ffmpeg.wasm has no player.', cell: ffmpegCell },
  ...ports.map((p) => ({ key: p.key, label: p.label, repo: p.repo, version: p.version, obtained: p.obtained,
    notes: `${p.notes} Picture = canvas luma variance > 20 within 6 s of opening; audio = RMS > 1e-3 on an AnalyserNode tapped off the page's Web Audio output.`, cell: (s, e) => portCell(p, s, e) })),
  { key: 'native', label: 'Browser alone (<video>/<audio>)', repo: null, obtained: 'tests/verify-corpus.mjs native check in each engine.', version: 'the engine\'s own media stack',
    notes: 'tests/verify-corpus.mjs native check: the element reaches loadeddata within 5 s (and has a video size, for video samples). Audio is not measured separately.', cell: nativeCell },
];
tools.find((t) => t.key === 'webvlc').notes = 'A React UI over the browser\'s own <video>/<audio>; no wasm. Production build. Picture = luma variance > 20 on the <video>; audio = signal on an analyser fed by captureStream (Chrome) / mozCaptureStream (Firefox), else decoded audio while playing (webkitAudioDecodedByteCount, mozHasAudio, or in WebKit an audio track present while currentTime advances).';

// Engine versions (launching a browser opens no page, so nothing can make a sound).
const engineVersions = {};
for (const e of ENGINES) {
  for (const [k, opts] of Object.entries(e === 'chromium' ? { playwright: {}, chrome: { channel: 'chrome' } } : { playwright: {} })) {
    const b = await launchMuted(e, opts).catch(() => null);
    if (b) { engineVersions[e === 'chromium' ? `chromium-${k}` : e] = b.version(); await b.close(); }
  }
}

const samples = manifest.samples.map((s) => ({
  id: s.id, name: s.name, category: s.category, video: s.video ?? null, audio: s.audio ?? null,
  results: Object.fromEntries(tools.map((t) => [t.key, Object.fromEntries(ENGINES.map((e) => [e, t.cell(s, e)]))])),
}));

// Per tool x engine totals.
const totals = {};
for (const t of tools) {
  totals[t.key] = {};
  for (const e of ENGINES) {
    const cells = samples.map((s) => s.results[t.key][e]);
    const ran = Object.values(portData[t.key] ?? {}).length ? portData[t.key][e] : true;
    totals[t.key][e] = {
      plays: cells.filter((c) => c.plays === true).length,
      of: samples.length,
      notMeasured: cells.filter((c) => c.plays == null).length,
      ...(ran ? {} : { run: false }),
    };
  }
}

const startFailures = {};
for (const p of ports) for (const e of ENGINES) {
  const d = portData[p.key][e];
  if (!d) continue;
  const notReady = d.results.filter((r) => !r.ready);
  if (notReady.length > d.results.length / 2) (startFailures[p.key] ??= {})[e] = notReady[0]?.errors?.[0] ?? 'never became ready';
}

const out = {
  date: new Date().toISOString(),
  engines: ENGINES,
  engineVersions,
  engineNotes: {
    chromium: 'The vlc.js-family ports and webvlc ran in installed Google Chrome (as their Chromium-only runs always did); libvlc-wasm, ffmpeg.wasm and the native checks ran in Playwright\'s Chromium build.',
    webkit: 'Playwright WebKit (headless), the closest automatable stand-in for Safari.',
    firefox: 'Playwright Firefox (headless).',
  },
  silence: 'Every browser was launched through tests/lib/browser.mjs launchMuted, which routes all Web Audio into a zero gain and forces media elements muted; analysers upstream of it still see the signal.',
  tools: tools.map(({ key, label, repo, version, obtained, notes }) => ({
    key, label, repo, version, obtained, notes,
    totals: totals[key],
    engineBlockers: Object.fromEntries(ENGINES.filter((e) => KNOWN_ENGINE_BLOCKERS[key]?.[e] || startFailures[key]?.[e])
      .map((e) => [e, KNOWN_ENGINE_BLOCKERS[key]?.[e] ?? `did not start: ${startFailures[key][e]}`])),
  })),
  totals,
  startFailures,
  samples,
};
writeFileSync(`${root}/bench/compare/ports-matrix.json`, `${JSON.stringify(out, null, 1)}\n`);

for (const t of out.tools) {
  console.log(`${t.label.padEnd(34)} ${ENGINES.map((e) => `${e} ${t.totals[e].run === false ? 'not run' : `${t.totals[e].plays}/${t.totals[e].of}`}`).join('   ')}`);
  for (const [e, why] of Object.entries(t.engineBlockers)) console.log(`   ${e}: ${why.slice(0, 150)}`);
}
