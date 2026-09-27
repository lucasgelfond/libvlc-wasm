// Shared by the port harnesses in bench/compare (krowemoh.mjs, webvlc.mjs, jbk.mjs).
// Same sample selection, picture test and timing as vlcjs.mjs, plus a silent audio probe.
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { root, launchMuted } from '../../tests/lib/browser.mjs';

export { root };
export const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));

/** --engine=chromium|webkit|firefox (default chromium, which is installed Chrome as before). */
export const engine = args.engine ?? 'chromium';
if (!['chromium', 'webkit', 'firefox'].includes(engine)) throw new Error(`unknown --engine=${engine}`);

/**
 * The harness's port, offset per engine so the three engines can run at once. --port-base moves
 * the base (two runs of one script, e.g. jbk.mjs on two builds); --port sets it outright.
 */
export const portFor = (base) => +(args.port ?? +(args['port-base'] ?? base) + { chromium: 0, webkit: 10, firefox: 20 }[engine]);

/** bench/compare/<base>-results.json for Chromium (unchanged), <base>-<engine>-results.json otherwise. */
export const resultsFile = (base) => `${root}/bench/compare/${base}${engine === 'chromium' ? '' : `-${engine}`}-results.json`;

/**
 * vlcjs.mjs's video set (every video sample without a special test mode, plus the generated
 * H.264/Opus/ASS control) followed by the audio-only samples, which vlcjs.mjs skipped.
 */
export function loadSamples() {
  const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
  const keep = (s) => !s.test?.mode && (!args.only || s.category === args.only);
  let samples = manifest.samples.filter((s) => s.video && keep(s));
  samples.push({ id: 'gen-h264-opus-ass', name: 'H.264 + Opus + ASS in MKV (generated)', category: 'control', file: 'gen/t_h264_opus_ass.mkv', video: 'H.264', audio: 'Opus' });
  if (!args['video-only']) samples.push(...manifest.samples.filter((s) => !s.video && s.audio && keep(s)));
  if (args.ids) { const ids = new Set(args.ids.split(',')); samples = samples.filter((s) => ids.has(s.id)); }
  if (args.limit) samples = samples.slice(0, +args.limit);
  return samples;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/**
 * Static server with cross-origin isolation (SharedArrayBuffer needs it). `mounts` maps a URL
 * prefix to a directory; `pages` maps a path to an HTML string served from memory.
 */
export async function serve(port, mounts, pages = {}, { isolate = true } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const headers = isolate ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store' } : { 'Cache-Control': 'no-store' };
    if (pages[path] != null) { res.writeHead(200, { ...headers, 'Content-Type': 'text/html' }); res.end(pages[path]); return; }
    for (const [prefix, dir] of Object.entries(mounts)) {
      if (!path.startsWith(prefix)) continue;
      const file = normalize(join(dir, path.slice(prefix.length) || 'index.html'));
      if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) break;
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': statSync(file).size });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404, headers); res.end('not found');
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return server;
}

/**
 * The --engine browser, always muted (tests/lib/browser.mjs launchMuted). Chromium is installed
 * Chrome, as the Chromium-only runs always were; WebKit and Firefox are Playwright's builds.
 */
export async function launch() {
  return launchMuted(engine, engine === 'chromium' ? { channel: 'chrome' } : {});
}

/** Luma variance of a PNG screenshot, decoded in a scratch page (identical to vlcjs.mjs). */
export async function variance(scratch, png) {
  return scratch.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(96, 54); const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 96, 54);
    const d = g.getImageData(0, 0, 96, 54).data;
    let s = 0, s2 = 0;
    for (let k = 0; k < d.length; k += 4) { const y = (d[k] * 2 + d[k + 1] * 5 + d[k + 2]) >> 3; s += y; s2 += y * y; }
    const n = d.length / 4;
    return s2 / n - (s / n) ** 2;
  }, png.toString('base64'));
}

/**
 * Init script: every AudioNode connected to a context's destination is also connected to an
 * AnalyserNode on that context. The analyser is not connected to anything audible, and Chrome
 * runs with --mute-audio anyway; it only lets the harness read the signal level.
 * window.__audioPeak() returns the loudest RMS seen so far (0 = silence / no audio graph).
 */
export const AUDIO_PROBE = `(() => {
  const analysers = new Map();
  let peak = 0, firstAt = null;
  const t0 = performance.now();
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode) {
        const ctx = this.context;
        let a = analysers.get(ctx);
        if (!a) { a = ctx.createAnalyser(); a.fftSize = 2048; analysers.set(ctx, a); }
        orig.call(this, a);
      }
    } catch {}
    return r;
  };
  const buf = new Float32Array(2048);
  setInterval(() => {
    for (const a of analysers.values()) {
      a.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (rms > peak) peak = rms;
      if (rms > 1e-3 && firstAt == null) firstAt = performance.now() - t0;
    }
  }, 50);
  window.__audioPeak = () => ({ peak, firstAt, graphs: analysers.size });
})();`;

export function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

/** One-line console summary per row, like vlcjs.mjs. */
export function logRow(row) {
  const a = row.audible == null ? '' : row.audible ? ' +audio' : ' -audio';
  console.log(`${row.video ? 'VIDEO' : 'none '}${a.padEnd(8)} ${row.id.padEnd(44)} ${row.firstFrameMs ?? '-'} ms  ${row.crashed ? 'CRASHED ' : ''}${row.errors[0]?.slice(0, 90) ?? ''}`);
}

export function summarize(label, results) {
  const vids = results.filter((r) => r.hasVideo);
  const core = vids.filter((r) => r.category !== 'everyday');
  const aud = results.filter((r) => r.hasAudio);
  const s = {
    videoShown: `${vids.filter((r) => r.video).length}/${vids.length}`,
    videoShownExclEveryday: `${core.filter((r) => r.video).length}/${core.length}`,
    audible: `${aud.filter((r) => r.audible).length}/${aud.length}`,
    medianFirstFrameMs: median(vids.map((r) => r.firstFrameMs)),
    crashed: results.filter((r) => r.crashed).length,
  };
  console.log(`\n${label}: video ${s.videoShown} (${s.videoShownExclEveryday} excl. everyday), audible ${s.audible}, median first frame ${s.medianFirstFrameMs} ms, crashes ${s.crashed}`);
  return s;
}

/**
 * Writes resultsFile(base). With --ids (a re-run of some samples, e.g. retrying ones that failed
 * while the machine was busy) the new rows replace the old ones in the existing file, which keeps
 * its order, and the summary is recomputed over the merged rows; `rerun` lists what was redone.
 */
export function saveResults(base, label, meta, results, extend = () => {}) {
  const file = resultsFile(base);
  let rows = results, rerun;
  if (args.ids && existsSync(file)) {
    const prev = JSON.parse(readFileSync(file, 'utf8'));
    const fresh = new Map(results.map((r) => [r.id, r]));
    rows = prev.results.map((r) => fresh.get(r.id) ?? r);
    for (const r of results) if (!prev.results.some((x) => x.id === r.id)) rows.push(r);
    rerun = [...new Set([...(prev.rerun ?? []), ...results.map((r) => r.id)])];
    meta = { ...meta, date: prev.date, rerunDate: new Date().toISOString() };
  }
  const summary = summarize(label, rows);
  extend(summary, rows);
  clearCheckpoint(base);
  writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), ...meta, engine, summary, ...(rerun ? { rerun } : {}), results: rows }, null, 1));
  return summary;
}

/**
 * A launch() browser that comes back if it goes away (a crashed engine, or a browser process
 * killed from outside mid-run): page() relaunches when the old one is gone. `scratch` is the
 * page variance() decodes screenshots in. `relaunches` is recorded in the results file.
 */
/** `promise`, or `fallback` after `ms`: a page whose main thread is stuck never answers evaluate() or close(). */
export const timed = (promise, ms, fallback = null) => Promise.race([Promise.resolve(promise).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms))]);

export async function session() {
  let browser = await launch();
  let scratch = await browser.newPage();
  const s = {
    relaunches: 0,
    get scratch() { return scratch; },
    async page(opts) {
      if (browser.isConnected()) {
        const page = await timed(browser.newPage(opts), 30000);
        if (page) return page;
      }
      await timed(browser.close(), 10000);
      s.relaunches++;
      console.warn(`[${engine}] browser went away; relaunching`);
      browser = await launch();
      scratch = await browser.newPage();
      return browser.newPage(opts);
    },
    close: () => timed(browser.close(), 10000),
  };
  return s;
}

/**
 * Rows are checkpointed after every sample to .scratch/compare/<base>[-<engine>].partial.json;
 * --resume picks up from there, so a run killed halfway need not start over.
 */
const partialFile = (base) => `${root}/.scratch/compare/${base}${engine === 'chromium' ? '' : `-${engine}`}.partial.json`;
export function resumeRows(base) {
  const f = partialFile(base);
  if (!args.resume || !existsSync(f)) return [];
  const rows = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`resuming ${base} (${engine}) after ${rows.length} samples`);
  return rows;
}
export function checkpoint(base, rows) {
  mkdirSync(`${root}/.scratch/compare`, { recursive: true });
  writeFileSync(partialFile(base), JSON.stringify(rows));
}
export const clearCheckpoint = (base) => rmSync(partialFile(base), { force: true });
