// Compatibility matrix for a public media test suite: which of its files native
// FFmpeg, native VLC 3, libvlc-wasm and the browsers' own <video>/<audio> can play.
// The denominator is the union of files native FFmpeg or native VLC plays;
// libvlc-wasm failures are retried once with :demux=avformat (and raw ES files
// with their ES demuxer).
//
//   node corpus/compat/suite.mjs --suite=libvpx     inventory + every tool + summary
//   node corpus/compat/suite.mjs --suite=fate       the FFmpeg FATE suite + curated corpus (= fate.mjs)
//   node corpus/compat/suite.mjs --index            only rewrite suites/index.json from the summaries on disk
//   --tool=ffmpeg       one tool (inventory,ffmpeg,vlc,wasm,native,summary; comma list)
//   --only=h264         limit measuring to one folder (comma list)
//   --resume            skip files that already have a result for that tool
//   --retry=timeout     with --resume, re-measure results whose status matches
//   options: --jobs=8 (ffprobe/ffmpeg/VLC processes)  --pages=4 (libvlc-wasm pages)
//            --engines=chromium,webkit,firefox          --seconds=2 (libvlc-wasm play time)
//
// A suite is defined by corpus/suites/<name>.json (built by corpus/suites/lists.mjs,
// fetched by corpus/suites/fetch.mjs into corpus/suites/<name>/, gitignored):
// its description, source, licence and the list of files, each with an optional
// "folder" (the category it is summarised under; default: first path component)
// and "reference": true for checksum files that are not playback candidates.
// A definition with "derivedFrom": "fate" and "folders": [...] measures nothing:
// it re-summarises those FATE folders from the FATE caches.
//
// FATE keeps its historical file names (corpus/compat/fate-*.json). Every
// other suite caches per file, keyed by path relative to corpus/ ("suites/<name>/..."),
// in corpus/compat/suites/:
//   <name>-inventory.json   ffprobe: container, streams, duration (non-media files recorded as such)
//   <name>-ffmpeg.json      native FFmpeg: video frames / audio samples decoded from the first 5 s
//   <name>-vlc.json         native VLC 3: pictures reaching the stats vout / seconds written by afile
//   <name>-wasm.json        libvlc-wasm in Chromium through tests/browser/harness.js
//   <name>-native.json      browser-native <video>/<audio> (harness nativeCheck) per engine
// and the summary step writes <name>-matrix.json (one row per union file),
// <name>-summary.json from them, then corpus/compat/suites/index.json over
// every suite.
//
// "Plays" means, for every tool: the file has video and a video frame came out,
// or it has audio and audio came out (see criteria() below and METHOD).
//
// Nothing here makes a sound: FFmpeg decodes to the null muxer, VLC renders audio
// to a WAV file (afile) that is deleted afterwards, and the browsers are launched
// muted by tests/lib/browser.mjs (the harness also routes audio through a zero gain).
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync, readdirSync, renameSync, openSync, readSync, closeSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How every column is measured, stored with each summary (and in suites/index.json). */
const METHOD = {
  media: 'ffprobe finds a video or audio stream (checksums, reference text and headerless raw dumps are not media)',
  plays: 'the file has video and a picture came out, or it has audio and sound came out',
  ffmpeg: 'ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -: frames > 0 or samples > 0',
  vlc: 'VLC.app headless, --vout=stats --aout=afile, --run-time=4: a picture reached the vout or audio was written; retried with --codec=avcodec,none when a video file shows nothing',
  wasm: 'tests/browser/harness.js playCase in muted headless Chromium: a frame drawn with content, or audible output (same criteria as tests/verify-corpus.mjs); failures retried with :demux=avformat, raw elementary streams with their ES demuxer; retries are reported, not counted',
  browsers: "the harness nativeCheck: the browser's own <video>/<audio> reaches loadeddata within 4 s (muted)",
  denominator: 'N = media files native FFmpeg or native VLC 3 plays; files neither plays are listed as unplayableByAll and not counted',
  caveats: 'many suite files are deliberately broken, truncated, single-frame or headerless; "plays" means something came out, not a bit-exact decode',
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const fate = `${root}/corpus/fate`;
const suitesDir = `${root}/corpus/suites`;

const VLC = '/Applications/VLC.app/Contents/MacOS/VLC';
const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (args.index) { writeIndex(); process.exit(0); }
const SUITE = String(args.suite ?? 'fate');
const isFate = SUITE === 'fate';
const def = isFate ? null : JSON.parse(readFileSync(`${suitesDir}/${SUITE}.json`, 'utf8'));
const derived = def?.derivedFrom ?? null;
const scratch = `${root}/.scratch/${SUITE}`;
mkdirSync(scratch, { recursive: true });
const ALL = ['inventory', 'ffmpeg', 'vlc', 'wasm', 'native', 'summary'];
// A derived suite only re-summarises another suite's measurements.
const defTools = derived ? ['summary'] : def?.tools ? ['inventory', ...def.tools, 'summary'] : ALL;
const tools = new Set(derived ? ['summary'] : args.tool ? ['inventory', ...String(args.tool).split(','), 'summary'] : defTools);
const only = args.only ? new Set(String(args.only).split(',')) : null;
const resume = !!args.resume;
const retry = args.retry ? new RegExp(String(args.retry)) : null;
const JOBS = +(args.jobs ?? 8);
const PAGES = +(args.pages ?? 4);
const SECONDS = +(args.seconds ?? 2);
const ENGINES = String(args.engines ?? 'chromium,webkit,firefox').split(',');

// ---------------------------------------------------------------------------
// Cache files: one JSON object, one entry per line, so diffs stay readable.
// FATE (and a suite derived from it) reads corpus/compat/fate-*.json; the others
// live in corpus/compat/suites/.
const outDir = isFate ? here : `${here}/suites`;
mkdirSync(outDir, { recursive: true });
const cacheSuite = derived ?? SUITE;
const cachePath = (name) => (cacheSuite === 'fate' ? `${here}/fate-${name}.json` : `${outDir}/${cacheSuite}-${name}.json`);
const outPath = (name) => `${outDir}/${SUITE}-${name}.json`;
function load(name) {
  try { return JSON.parse(readFileSync(cachePath(name), 'utf8')); } catch { return {}; }
}
function save(name, obj) {
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`).join(',\n');
  const tmp = `${cachePath(name)}.tmp`;
  writeFileSync(tmp, `{\n${body}\n}\n`);
  renameSync(tmp, cachePath(name));
}
// Saves at most every few seconds while a step runs, and always at its end.
function saver(name, obj) {
  let last = 0;
  return (force = false) => { if (force || Date.now() - last > 5000) { save(name, obj); last = Date.now(); } };
}

function run(cmd, argv, { timeoutMs = 60000, maxBytes = 4 << 20 } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const add = (d) => { if (out.length < maxBytes) out += d; };
    p.stdout.on('data', add);
    p.stderr.on('data', add);
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutMs);
    p.on('error', (e) => { out += `spawn error: ${e.message}`; });
    p.on('close', (code, signal) => { clearTimeout(t); res({ code, signal, out, timedOut }); });
  });
}
async function pool(items, n, fn) {
  let i = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, async (_, worker) => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item, worker);
      if (++done % 50 === 0) console.log(`  ... ${done}/${items.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }));
}
// Folder (category) of a file: FATE's top-level folder, curated/<category> for the
// curated corpus, and for a suite the definition's "folder" or the first path part.
const suiteFolder = new Map();
const folderOf = (rel) => {
  const p = rel.split('/');
  if (p[0] === 'fate') return p[1];
  if (p[0] === 'media') return `curated/${p[1]}`;
  return suiteFolder.get(rel) ?? p[2];
};
const inScope = (rel) => !only || only.has(folderOf(rel)) || only.has(folderOf(rel).split('/')[0]);
const clip = (s, n = 200) => (s == null ? null : String(s).trim().slice(0, n));

// ---------------------------------------------------------------------------
// 1. Inventory: ffprobe decides what is media. Extensions that are certainly
// reference data (checksums, text) are not even probed.
// Headerless PCM (.pcm/.s16/.f32/.dec) is FATE's decoded reference output, and text
// subtitles carry no picture or sound; neither is a playback candidate.
const NOT_MEDIA = /(\.(md5|sha\d*|txt|ref|crc|framecrc|json|html?|log|c|h|sh|py|pl|diff|patch|md|cfg|ini|nfo|pcm|s16|s24|s32|f32|f64|dec|srt|vtt|ass|ssa|smi|lrc|sami|stl|jss|pjs)|\/md5sum)$/i;
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(relative(fate, p));
  }
  return out;
}
// Keys are relative to corpus/: "fate/<folder>/..." for the FATE suite, and
// "media/<file>" for the curated corpus in corpus/manifest.json (measured the
// same way, so both share one set of criteria). The VobSub pair is left out: it
// is only playable as subtitles over another clip.
const corpusDir = `${root}/corpus`;
function fateFiles() {
  const manifest = JSON.parse(readFileSync(`${corpusDir}/manifest.json`, 'utf8'));
  const curated = manifest.samples.filter((s) => s.test?.mode !== 'subtitles-over' && existsSync(`${corpusDir}/media/${s.file}`)).map((s) => `media/${s.file}`);
  return [...walk(fate).map((f) => `fate/${f}`), ...curated].sort();
}
// A suite's files are the ones its definition lists (reference checksums left
// out) that have been fetched; a derived suite takes its folders of FATE.
function suiteFiles() {
  if (derived === 'fate') {
    const want = new Set(def.folders);
    return fateFiles().filter((f) => f.startsWith('fate/') && want.has(f.split('/')[1]));
  }
  const out = [];
  let missing = 0;
  for (const f of def.files) {
    if (f.reference) continue;
    const rel = `suites/${SUITE}/${f.path}`;
    if (!existsSync(`${corpusDir}/${rel}`)) { missing++; continue; }
    if (f.folder) suiteFolder.set(rel, f.folder);
    out.push(rel);
  }
  if (missing) console.log(`${SUITE}: ${missing} listed files not fetched yet (node corpus/suites/fetch.mjs ${SUITE}); measuring the rest`);
  return out.sort();
}
const allFiles = isFate ? fateFiles() : suiteFiles();
const allSet = new Set(allFiles);
const abs = (rel) => `${corpusDir}/${rel}`;
const inventory = load('inventory');

if (tools.has('inventory')) {
  for (const f of allFiles) if (inventory[f] && !inventory[f].skip && NOT_MEDIA.test(f)) inventory[f] = { b: inventory[f].b, skip: 'extension' };
  const todo = allFiles.filter((f) => inScope(f) && (!inventory[f] || args.reprobe));
  console.log(`inventory: ${allFiles.length} files, probing ${todo.length}`);
  const flush = saver('inventory', inventory);
  await pool(todo, JOBS, async (rel) => {
    const bytes = statSync(abs(rel)).size;
    if (NOT_MEDIA.test(rel)) { inventory[rel] = { b: bytes, skip: 'extension' }; return; }
    const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,disposition',
      '-of', 'json', '-i', abs(rel)], { timeoutMs: 30000 });
    let j = {};
    try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* not JSON: an error message */ }
    const streams = (j.streams ?? []).map((s) => `${s.codec_type ?? 'unknown'}:${s.codec_name ?? 'unknown'}${s.disposition?.attached_pic ? '(cover)' : ''}`);
    const entry = { b: bytes, f: j.format?.format_name ?? null, s: [...new Set(streams)] };
    const d = parseFloat(j.format?.duration);
    if (Number.isFinite(d)) entry.d = +d.toFixed(2);
    if (!j.format) entry.e = clip(r.timedOut ? 'ffprobe timeout' : r.out.split('\n').find((l) => l.trim()) ?? 'unrecognised', 160);
    inventory[rel] = entry;
    flush();
  });
  // Forget files that are gone, and results for files that are no longer candidates.
  for (const k of Object.keys(inventory)) if (!allSet.has(k)) delete inventory[k];
  save('inventory', inventory);
  if (!only) {
    for (const name of ['ffmpeg', 'vlc', 'wasm', 'native']) {
      const c = load(name);
      const stale = Object.keys(c).filter((k) => k !== '_tool' && (!inventory[k] || inventory[k].skip));
      if (stale.length) { for (const k of stale) delete c[k]; save(name, c); }
    }
  }
}

// ffprobe's verdict decides what is media, but a file it rejects is still tried
// by every tool (VLC has demuxers FFmpeg lacks: tracker modules, MIDI, ...);
// only the extension-skipped reference files are never played. For a file
// ffprobe rejected, either kind of output counts.
const probed = (rel) => !!inventory[rel] && !inventory[rel].skip;
const kinds = (rel) => {
  const s = inventory[rel]?.s ?? [];
  const k = {
    video: s.some((x) => x.startsWith('video:') && !x.endsWith('(cover)')),
    audio: s.some((x) => x.startsWith('audio:')),
  };
  if (!k.video && !k.audio && !s.length) return { video: true, audio: true, unknown: true };
  return k;
};
const IMAGE_FORMATS = /(^|,)(image2|[\w]+_pipe|apng|webp|gif|avif|jpegxl_anim|imagepipe)(,|$)/;
const isMedia = (rel) => (inventory[rel]?.s ?? []).some((x) => /^(video|audio):/.test(x));
const mediaFiles = allFiles.filter(probed);
const scoped = mediaFiles.filter(inScope);
const pending = (cache, needsAlt = false) => scoped.filter((f) => !resume || !cache[f] || (retry && retry.test(cache[f].status ?? ''))
  || (needsAlt && cache[f].status !== 'plays' && needsAlt(f) && (!cache[f].alt || (esDemux(f) && !cache[f].es))));
const ALT_OPTION = ':demux=avformat';
// A headerless elementary stream is only found by VLC's ES probes, which want a
// known extension or a particular first NAL. The second experiment names the
// ES demuxer outright; if that plays, the failure is detection, not decoding.
const ES_DEMUX = { h264: 'h264', hevc: 'hevc', vc1: 'vc1', m4v: 'm4v', mpegvideo: 'es', cavsvideo: 'es', dirac: 'es' };
const esDemux = (rel) => { const d = ES_DEMUX[inventory[rel]?.f]; return d ? `:demux=${d}` : null; };
const fileUrl = (rel) => `/corpus/${rel.split('/').map(encodeURIComponent).join('/')}`;

// ---------------------------------------------------------------------------
// 2a. Native FFmpeg: the first video and first audio stream (attached pictures
// excluded by the capital V) decoded to the null muxer for 5 s.
if (tools.has('ffmpeg')) {
  const cache = load('ffmpeg');
  const todo = pending(cache);
  console.log(`ffmpeg: ${todo.length} files`);
  const flush = saver('ffmpeg', cache);
  const version = (await run(FFMPEG, ['-version'])).out.split('\n')[0].replace(/ Copyright.*/, '');
  await pool(todo, JOBS, async (rel) => {
    const k = kinds(rel);
    const argv = ['-hide_banner', '-nostdin', '-i', abs(rel), '-map', '0:V:0?', '-map', '0:a:0?', '-sn', '-dn', '-t', '5'];
    argv.push('-filter:a', 'volumedetect');
    argv.push('-f', 'null', '-');
    const r = await run(FFMPEG, argv, { timeoutMs: 60000 });
    const log = r.out;
    const frames = k.video ? +([...log.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? 0) : 0;
    const samples = Math.max(0, ...[...log.matchAll(/n_samples: (\d+)/g)].map((m) => +m[1]));
    const mv = /max_volume: (-?[\d.]+|-inf) dB/.exec(log)?.[1];
    const errors = log.split('\n').filter((l) => /error|invalid|not supported|unsupported|could not|failed|no decoder|unknown|not implemented/i.test(l) && !/^\s*(Stream|Metadata)|muxing overhead|^\[out#/.test(l));
    const e = { v: frames, a: samples, pk: mv == null || mv === '-inf' ? null : +mv, code: r.code };
    if (errors.length) { e.err = clip(errors[0]); e.errs = errors.length; }
    if (r.timedOut) e.to = true;
    e.status = status(rel, 'ffmpeg', e);
    cache[rel] = e;
    flush();
  });
  cache._tool = { version };
  save('ffmpeg', cache);
}

// ---------------------------------------------------------------------------
// 2b. Native VLC 3 (VLC.app), headless: the statistics vout logs "VOUT got" per
// picture it is handed (no window), afile writes decoded audio to a WAV (never
// a speaker). Same flags as corpus/compat/build.mjs, first 4 s. When a video
// file shows nothing, it is retried with software decoding forced, as there.
function wavSeconds(path) {
  if (!existsSync(path)) return 0;
  const size = statSync(path).size;
  const fd = openSync(path, 'r');
  const h = Buffer.alloc(Math.min(size, 4096));
  readSync(fd, h, 0, h.length, 0);
  closeSync(fd);
  let channels = 2, rate = 44100, bits = 16, data = Math.max(0, size - 44);
  for (let o = 12; o + 8 <= h.length;) {
    const id = h.toString('ascii', o, o + 4), len = h.readUInt32LE(o + 4);
    if (id === 'fmt ') { channels = h.readUInt16LE(o + 10); rate = h.readUInt32LE(o + 12); bits = h.readUInt16LE(o + 22); }
    if (id === 'data') { data = Math.min(size - o - 8, len || size - o - 8); break; }
    o += 8 + len;
  }
  return data / (rate * channels * (bits / 8) || 1);
}
let wavSeq = 0;
async function vlcRun(rel, extra = []) {
  const wav = `${scratch}/vlc-${process.pid}-${wavSeq++}.wav`;
  rmSync(wav, { force: true });
  const argv = ['-I', 'dummy', '-vv', '--no-media-library', '--no-video-title-show', '--no-osd', '--no-metadata-network-access',
    '--no-sub-autodetect-file', '--no-loop', '--no-repeat', '--no-drop-late-frames', '--no-skip-frames', '--no-playlist-autostart=0',
    '--vout=stats', '--dummy-chroma=I420', '--aout=afile', `--audiofile-file=${wav}`, '--run-time=4', '--image-duration=1',
    '--play-and-exit', ...extra, abs(rel)].filter((a) => a !== '--no-playlist-autostart=0');
  const { out, timedOut, signal } = await run(VLC, argv, { timeoutMs: 30000, maxBytes: 16 << 20 });
  const a = wavSeconds(wav);
  rmSync(wav, { force: true });
  const errs = out.split('\n').filter((l) => / error: /.test(l) && !/cannot (load|open) module|keystore|lua|macosx window/.test(l)).map((l) => l.replace(/^\[[0-9a-f]+\] /, ''));
  const r = {
    v: (out.match(/VOUT got/g) ?? []).length,
    a: +a.toFixed(3),
    dm: [...new Set([...out.matchAll(/using demux module "([^"]+)"/g)].map((m) => m[1]))],
    dec: [...new Set([...out.matchAll(/using (video|audio) decoder module "([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`))],
    nd: [...new Set([...out.matchAll(/(?:no suitable decoder module for fourcc `(.{4})'|Codec `(.{4})' \(([^)]*)\) is not supported)/g)].map((m) => (m[1] ?? `${m[2]} (${m[3]})`).trim()))],
  };
  if (errs.length) r.err = clip(errs[0]);
  if (timedOut) r.to = true;
  if (signal && !timedOut) r.crash = signal;
  return r;
}
if (tools.has('vlc')) {
  const cache = load('vlc');
  const todo = pending(cache);
  console.log(`vlc: ${todo.length} files`);
  const flush = saver('vlc', cache);
  const version = /VLC (?:media player|version) ([\d.]+)/.exec((await run(VLC, ['--version'])).out)?.[1] ?? 'unknown';
  // VLC paces playback in real time, so run several at once.
  await pool(todo, JOBS, async (rel) => {
    const r = await vlcRun(rel);
    if (kinds(rel).video && r.v === 0 && !r.to) {
      const sw = await vlcRun(rel, ['--codec=avcodec,none', '--avcodec-hw=none']);
      r.sw = sw.v;
    }
    r.status = status(rel, 'vlc', r);
    cache[rel] = r;
    flush();
  });
  cache._tool = { version };
  save('vlc', cache);
}

// ---------------------------------------------------------------------------
// Browser steps share a Vite server over the repo with the repo's config, plus
// corpus/fate and corpus/suites served as raw bytes with Range support (as vite.config.js does
// for corpus/media), so a `.ts` is never compiled as TypeScript.
function rawDir(mount, base) {
  const iso = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  return {
    name: `raw-media:${mount}`,
    configureServer(server) {
      server.middlewares.use(mount, (req, res, next) => {
        const path = resolve(base, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
        if (!path.startsWith(base)) return next();
        let st;
        try { st = statSync(path); } catch { return next(); }
        if (!st.isFile()) return next();
        const headers = { ...iso, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' };
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
        if (m) {
          const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
          const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
          if (start >= st.size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
          res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
          createReadStream(path, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { ...headers, 'Content-Length': st.size });
          createReadStream(path).pipe(res);
        }
      });
    },
  };
}
async function mediaServer() {
  const { createServer } = await import('vite');
  const server = await createServer({ root, configFile: `${root}/vite.config.js`, logLevel: 'error', plugins: [rawDir('/corpus/fate', fate), rawDir('/corpus/suites', suitesDir)],
    // Other people edit the harness and engine while this runs; a hot reload would
    // navigate a page mid-file. Pages pick up changes when they are restarted.
    // Several suites may run at once: each takes the next free port.
    server: { port: 5299, strictPort: false, hmr: false, watch: null } });
  await server.listen();
  return { server, url: server.resolvedUrls.local[0].replace(/\/$/, '') };
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what} timeout`)), ms))]);
// Page-level trouble that is not the file's fault: the engine being relinked
// under us, or the page navigating away. Restart the page and retry the file.
const RELINK = /Import #\d+ "env"|LinkError|CompileError|WebAssembly\.instantiate|magic word|expected magic|Execution context was destroyed|harness is not defined|Cannot read properties of undefined \(reading '(playCase|ensureVLC)'\)/i;

// ---------------------------------------------------------------------------
// 2c. libvlc-wasm in Chromium through the harness. Criteria as in
// tests/verify-corpus.mjs: video = a frame drawn with content (pixel variance
// > 2, or more than one distinct frame for flat test patterns); audio = frames
// played and audible (peak > 0.003), or, when native FFmpeg found the first
// 5 s near-silent (< -50 dB), frames played at all.
if (tools.has('wasm')) {
  const cache = load('wasm');
  const ffc0 = load('ffmpeg'), vlc0 = load('vlc');
  const todo = pending(cache, (rel) => (!ffc0[rel] || !vlc0[rel]) || ffc0[rel].status === 'plays' || vlc0[rel].status === 'plays');
  console.log(`wasm: ${todo.length} files on ${PAGES} pages`);
  const flush = saver('wasm', cache);
  const { openHarness } = await import('../../tests/lib/browser.mjs');
  const { server, url } = await mediaServer();
  const soundfont = existsSync(`${root}/corpus/media/assets/TimGM6mb.sf2`) ? '/corpus/media/assets/TimGM6mb.sf2' : undefined;
  const pages = [];
  async function openPage(i) {
    const old = pages[i];
    pages[i] = null;
    if (old) await old.browser.close().catch(() => {});
    for (let attempt = 0; ; attempt++) {
      try {
        const h = await openHarness(url, 'chromium'); // headless, --mute-audio
        await withTimeout(h.page.evaluate((sf) => window.harness.ensureVLC(sf ? { soundfont: sf } : {}).then((v) => v.version?.version), soundfont), 90000, 'ensureVLC');
        h.count = 0;
        pages[i] = h;
        return h;
      } catch (e) {
        // The wasm may be mid-relink by another build; wait and retry.
        console.log(`  page ${i} failed to start (${clip(e.message, 120)}), retrying`);
        if (attempt > 20) throw e;
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }
  for (let i = 0; i < PAGES; i++) await openPage(i);
  const version = await pages[0].page.evaluate(() => window.harness.vlc.version?.version ?? null).catch(() => null);
  // The experiment is only worth running where a native tool plays the file
  // (unknown when that tool has not been measured yet).
  const ffc = load('ffmpeg'), vlc = load('vlc');
  const nativePlays = (rel) => (!ffc[rel] || !vlc[rel]) || ffc[rel].status === 'plays' || vlc[rel].status === 'plays';
  async function play(rel, i, options) {
    let r;
    for (let attempt = 0; attempt < 3; attempt++) {
      let h = pages[i] ?? await openPage(i);
      if (h.count >= 100) h = await openPage(i);
      h.count++;
      const t0 = Date.now();
      try {
        const res = await withTimeout(h.page.evaluate((c) => window.harness.playCase(c), { url: fileUrl(rel), seconds: SECONDS, snapshot: false, options }), (SECONDS + 30) * 1000, 'page');
        r = { res, ms: Date.now() - t0 };
        if (res.error && RELINK.test(res.error)) { await openPage(i); r = null; continue; }
        break;
      } catch (e) {
        r = { thrown: e.message, ms: Date.now() - t0 };
        await openPage(i);
        if (RELINK.test(e.message)) { r = null; continue; }
        break; // a hang or crash is a result; do not spend another 30 s on it
      }
    }
    return wasmEntry(rel, r ?? { thrown: 'wasm failed to load after retries', ms: 0 });
  }
  await pool(todo, PAGES, async (rel, i) => {
    let e = cache[rel];
    if (!e || !resume || (retry && retry.test(e.status ?? ''))) e = await play(rel, i, []);
    // Every failure gets one experiment: force VLC's libavformat demuxer. If
    // that plays, the failure is VLC's choice of demuxer, not a missing codec.
    const experiment = async (opt) => {
      const x = await play(rel, i, [opt]);
      const r = { opt, status: x.status, v: x.v, a: x.a, tr: x.tr, err: x.err ?? x.thrown };
      if (x.status !== 'plays') r.log = x.log;
      return r;
    };
    if (e.status !== 'plays' && nativePlays(rel)) {
      if (!e.alt) e.alt = await experiment(ALT_OPTION);
      if (!e.es && esDemux(rel)) e.es = await experiment(esDemux(rel));
    }
    cache[rel] = e;
    flush();
  });
  for (const h of pages) await h?.browser.close().catch(() => {});
  await server.close();
  cache._tool = { version, seconds: SECONDS };
  save('wasm', cache);
}
function wasmEntry(rel, { res, thrown, ms }) {
  if (!res) return { thrown: clip(thrown), ms, status: /timeout/.test(thrown) ? 'timeout' : 'crash', log: [] };
  const e = {
    v: [res.video?.framesDrawn ?? 0, res.video?.distinctFrames ?? 0, res.video?.maxVariance ?? 0],
    a: [res.audio?.framesPlayed ?? 0, res.audio?.peak ?? 0],
    tr: (res.tracks ?? []).map((t) => `${t.type}:${t.codecName ?? t.codec}`),
    ev: [...new Set(res.events ?? [])],
    ms,
  };
  if (res.error) e.err = clip(res.error);
  e.status = status(rel, 'wasm', e);
  // Keep the tail of the warning/error log only for failures: it is what says why.
  // (dvdnav/dvdread probing every unrecognised file is noise, not a cause).
  if (e.status !== 'plays') e.log = (res.logs ?? []).filter((l) => /^(error|warn)/.test(l) && !/DVD|UDF|RTAV_VMGI|VIDEO_TS|AUDIO_TS|ISO9660/.test(l)).slice(-12).map((l) => clip(l, 220));
  return e;
}

// ---------------------------------------------------------------------------
// 2d. Browser-native: can <video>/<audio> reach loadeddata (harness nativeCheck)?
if (tools.has('native')) {
  const cache = load('native');
  const { openHarness } = await import('../../tests/lib/browser.mjs');
  const { server, url } = await mediaServer();
  const flush = saver('native', cache);
  await Promise.all(ENGINES.map(async (engine) => {
    const todo = scoped.filter((f) => !resume || !cache[f]?.[engine] || (retry && retry.test(cache[f][engine])));
    console.log(`native ${engine}: ${todo.length} files`);
    const pages = [];
    const openPage = async (i) => {
      if (pages[i]) await pages[i].browser.close().catch(() => {});
      pages[i] = await openHarness(url, engine);
      pages[i].count = 0;
    };
    const N = 2;
    for (let i = 0; i < N; i++) await openPage(i);
    await pool(todo, N, async (rel, i) => {
      if (pages[i].count++ >= 200) await openPage(i);
      let r;
      try {
        r = await withTimeout(pages[i].page.evaluate((u) => window.harness.nativeCheck(u, 4000), fileUrl(rel)), 20000, 'page');
      } catch (e) {
        r = { ok: false, reason: e.message };
        await openPage(i).catch(() => {});
      }
      // Stored compactly: "ok", "ok-audio-only", or the failure reason.
      (cache[rel] ??= {})[engine] = r.ok ? (r.audioOnly ? 'ok-audio-only' : 'ok') : clip(r.reason, 80);
      flush();
    });
    for (const p of pages) await p.browser.close().catch(() => {});
  }));
  await server.close();
  save('native', cache);
}

// ---------------------------------------------------------------------------
// Criteria, shared by the measuring steps and the summary.
function status(rel, tool, m) {
  const k = kinds(rel);
  let video = false, audio = false;
  if (tool === 'ffmpeg') {
    video = m.v > 0; audio = m.a > 0;
  } else if (tool === 'vlc') {
    video = m.v > 0; audio = m.a > 0;
  } else if (tool === 'wasm') {
    const [fd, df, mv] = m.v;
    video = fd >= 1 && (mv > 2 || df > 1);
    const ff = load.cacheFfmpeg ??= load('ffmpeg');
    const ref = ff[rel]?.pk;
    const silentRef = ff[rel] && ff[rel].a > 0 && (ref == null || ref < -50);
    audio = m.a[0] > 0 && (m.a[1] > 0.003 || silentRef);
  }
  if ((k.video && video) || (k.audio && audio)) return 'plays';
  if (m.to) return 'timeout';
  if (m.crash) return 'crash';
  if (tool === 'wasm' && m.v[0] >= 1 && k.video) return 'blank-video';
  if (tool === 'wasm' && m.a[0] > 0 && k.audio) return 'quiet-audio';
  return 'fails';
}

// ---------------------------------------------------------------------------
// 3. Summary. The denominator is the UNION of media files that native FFmpeg
// or native VLC 3 plays (FATE plus the curated corpus): a file neither native
// tool can play says nothing about libvlc-wasm, so it is listed as
// "unplayable by all" and not counted. Writes <suite>-matrix.json (one row per
// union file, for the site) and <suite>-summary.json.
if (tools.has('summary')) {
  load.cacheFfmpeg = null;
  const ff = load('ffmpeg'), vl = load('vlc'), wa = load('wasm'), na = load('native');
  // Recompute statuses so a criteria change needs no re-measurement.
  for (const [cache, tool] of [[ff, 'ffmpeg'], [vl, 'vlc'], [wa, 'wasm']]) {
    for (const [rel, m] of Object.entries(cache)) if (rel !== '_tool' && inventory[rel] && m.v !== undefined) m.status = status(rel, tool, m);
  }
  for (const [rel, m] of Object.entries(wa)) {
    if (rel === '_tool') continue;
    for (const x of [m.alt, m.es]) if (x?.v !== undefined) x.status = status(rel, 'wasm', x);
  }
  const COLS = ['ffmpeg', 'vlc', 'wasm', 'chromium', 'webkit', 'firefox'];
  const plays = (rel, col) => {
    if (col === 'ffmpeg') return ff[rel] ? ff[rel].status === 'plays' : null;
    if (col === 'vlc') return vl[rel] ? vl[rel].status === 'plays' : null;
    if (col === 'wasm') return wa[rel] ? wa[rel].status === 'plays' : null;
    const n = na[rel]?.[col];
    return n == null ? null : n.startsWith('ok');
  };
  const inUnion = (rel) => !!(plays(rel, 'ffmpeg') || plays(rel, 'vlc'));
  const union = mediaFiles.filter(inUnion);
  const unionNotProbed = union.filter((rel) => !isMedia(rel)).length;
  const unplayable = mediaFiles.filter((rel) => isMedia(rel) && plays(rel, 'ffmpeg') === false && plays(rel, 'vlc') === false);

  const codec = (rel, type) => (inventory[rel].s ?? []).find((x) => x.startsWith(`${type}:`) && !x.endsWith('(cover)'))?.slice(type.length + 1) ?? null;
  const matrix = union.map((rel) => {
    const w = wa[rel];
    const row = {
      path: rel, folder: folderOf(rel), container: inventory[rel].f, video: codec(rel, 'video'), audio: codec(rel, 'audio'),
      ...(IMAGE_FORMATS.test(inventory[rel].f ?? '') ? { image: true } : {}),
      ...Object.fromEntries(COLS.map((c) => [c, plays(rel, c)])),
    };
    if (w && w.status !== 'plays') {
      row.wasmStatus = w.status;
      row.wasmAvformat = w.alt ? w.alt.status === 'plays' : null;
      if (w.es) row.wasmEsDemux = { option: w.es.opt, plays: w.es.status === 'plays' };
      row.wasmCause = classify(rel, w);
      row.wasmError = snippet(w);
    }
    return row;
  });
  writeFileSync(outPath('matrix'), `[\n${matrix.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);

  const blank = () => ({ files: 0, media: 0, union: 0, unplayable: 0, ...Object.fromEntries(COLS.flatMap((c) => [[c, 0], [`${c}Measured`, 0]])) });
  const folders = {};
  const overall = blank();
  for (const rel of allFiles) {
    const f = folders[folderOf(rel)] ??= blank();
    for (const t of [f, overall]) {
      t.files++;
      if (!probed(rel)) continue;
      if (isMedia(rel)) t.media++;
      if (unplayable.includes(rel)) t.unplayable++;
      if (!inUnion(rel)) continue;
      t.union++;
      for (const c of COLS) {
        const p = plays(rel, c);
        if (p != null) t[`${c}Measured`]++;
        if (p) t[c]++;
      }
    }
  }
  const act = matrix.filter((r) => r.wasm === false).map((r) => ({
    ...r,
    cause: r.wasmEsDemux?.plays ? 'ES not detected: plays with :demux=<es>'
      : r.wasmAvformat ? 'demuxer choice: plays with :demux=avformat' : r.wasmCause,
  }));
  const summary = {
    ...(isFate
      ? { suite: 'fate', title: "FFmpeg's FATE", source: 'https://fate-suite.ffmpeg.org/', subset: 'the whole FATE sample suite (rsync of fate-suite.ffmpeg.org) plus the curated corpus (corpus/manifest.json)' }
      : {
        suite: SUITE, title: def.title, description: def.description, source: def.source ?? def.homepage, homepage: def.homepage,
        license: def.license ?? null, fetched: def.fetched ?? null,
        subset: derived ? `FATE folders ${def.folders.join(', ')}, from the FATE measurements (nothing re-measured)` : def.subset,
        ...(derived ? { derivedFrom: derived, folders: def.folders } : {}),
      }),
    method: METHOD,
    date: new Date().toISOString().slice(0, 10),
    denominator: isFate ? 'media files (ffprobe finds video or audio) that native FFmpeg or native VLC 3 plays; fate/ = FFmpeg FATE suite, media/ = curated corpus'
      : 'media files (ffprobe finds video or audio) that native FFmpeg or native VLC 3 plays',
    tools: {
      ffmpeg: ff._tool?.version ?? null, vlc: vl._tool?.version ? `VLC ${vl._tool.version}` : null,
      wasm: wa._tool ? `libvlc-wasm ${wa._tool.version ?? ''} in Chromium, ${wa._tool.seconds} s per file` : null, browsers: ENGINES,
      experiments: [`each libvlc-wasm failure retried once with the media option ${ALT_OPTION}`,
        `raw elementary streams (${Object.keys(ES_DEMUX).join(', ')}) also retried with the matching :demux=<es module>`],
    },
    overall, folders,
    actionableByCause: Object.fromEntries(Object.entries(groupBy(act, (a) => a.cause)).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1])),
    actionable: act,
    unionNotRecognisedByFfprobe: unionNotProbed,
    unplayableByAll: unplayable,
  };
  writeFileSync(outPath('summary'), `${JSON.stringify(summary, null, 1)}\n`);
  writeIndex();
  writeIndex();
  const o = overall;
  console.log(`${SUITE}: union ${o.union} (of ${o.media} media files): ffmpeg ${o.ffmpeg}, vlc ${o.vlc}, wasm ${o.wasm}/${o.wasmMeasured}, chromium ${o.chromium}, webkit ${o.webkit}, firefox ${o.firefox}; actionable ${act.length}; unplayable by all ${unplayable.length}`);
}

function groupBy(list, key) {
  const g = {};
  for (const x of list) (g[key(x)] ??= []).push(x);
  return g;
}
function snippet(w) {
  if (w.thrown) return clip(w.thrown, 240);
  const lines = (w.log ?? []).filter((l) => !/audio output|buffer too late|picture is too late|clock|playback too late|discontinuity/i.test(l));
  const pick = lines.find((l) => /no suitable|not supported|unsupported|could not|cannot|failed|unknown|unidentified|corrupt|invalid|error/i.test(l)) ?? lines[0];
  return clip([w.err, pick].filter(Boolean).join(' | '), 240) ?? '';
}
// A probable cause for a libvlc-wasm failure, from the logs of the plain
// attempt and the :demux=avformat attempt (which reaches FFmpeg's decoder
// choice directly, so its "could not identify the codec" is the telling line).
function classify(rel, w) {
  const NOISE = /DVD|UDF|VMG|AMG|RTAV|VIDEO_TS|AUDIO_TS|ISO9660|picture is too late|DBG av_read_frame/;
  const all = [w.err, w.thrown, ...(w.log ?? []), w.alt?.err, ...(w.alt?.log ?? []), w.es?.err, ...(w.es?.log ?? [])].filter((l) => l && !NOISE.test(l)).join('\n');
  if (w.status === 'timeout') return 'timeout / hang';
  if (w.status === 'crash' || /RuntimeError|unreachable|memory access out of bounds|Aborted\(|abort\(/i.test(all)) return 'crash (wasm trap / page died)';
  if (/get_buffer\(\) failed/.test(all)) return 'avcodec get_buffer() failed (pixel format not handled by VLC\'s avcodec glue)';
  if (/Unidentified codec|could not identify the audio or video codec|Codec `.*' .* is not supported|no suitable decoder module|unsupported codec/i.test(all)) return 'missing decoder (codec not in the wasm build)';
  if (/buffer deadlock prevented/.test(all)) return 'decoder produced no picture (buffer deadlock prevented)';
  if (/WebCodecs produced no picture/.test(all)) return 'WebCodecs decode failed, fallback produced nothing';
  if (/non-dated video buffer/.test(all)) return 'no timestamps (non-dated buffers dropped)';
  if (w.status === 'blank-video') return 'harness artifact? (frames drawn, flat picture)';
  if (w.status === 'quiet-audio') return 'harness artifact? (audio played, below threshold)';
  if (/VLC is unable to open|Your media can't be opened|no suitable demux/i.test(all)) return 'no demuxer accepted the file';
  if (/failed to enable threaded decoding/.test(all)) return 'no picture (decoder opened, nothing out)';
  return 'other / no clue in the log';
}


// ---------------------------------------------------------------------------
// suites/index.json: every suite, with its totals, for the site and for people.

function writeIndex() {
  const compat = dirname(fileURLToPath(import.meta.url));
  const defsDir = resolve(compat, '../suites');
  const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const entry = (name, title, s, extra = {}) => ({
    name, title, source: s?.source ?? extra.source ?? null, subset: s?.subset ?? extra.subset ?? null,
    overall: s?.overall ?? null,
    wasmFails: s?.actionable?.length ?? null,
    fixedByAvformat: s?.actionable?.filter((a) => a.wasmAvformat).length ?? null,
    topCauses: s ? Object.entries(s.actionableByCause).slice(0, 5) : [],
    ...extra,
  });
  const suites = [];
  const fs = read(`${compat}/fate-summary.json`);
  if (fs) suites.push(entry('fate', "FFmpeg's FATE", fs, { summary: 'fate-summary.json', matrix: 'fate-matrix.json' }));
  for (const f of readdirSync(defsDir).filter((x) => x.endsWith('.json')).sort()) {
    const d = read(`${defsDir}/${f}`);
    if (!d?.name) continue;
    const s = read(`${compat}/suites/${d.name}-summary.json`);
    suites.push(entry(d.name, d.title, s, {
      source: d.source ?? d.homepage, subset: d.subset, bytes: d.bytes ?? null, derived: d.derivedFrom ?? null,
      summary: `suites/${d.name}-summary.json`, matrix: `suites/${d.name}-matrix.json`, measured: !!s,
    }));
  }
  writeFileSync(`${compat}/suites/index.json`, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), method: METHOD, suites }, null, 1)}\n`);
}
