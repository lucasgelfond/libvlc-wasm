// Shared by the port harnesses in bench/compare (krowemoh.mjs, webvlc.mjs, jbk.mjs).
// Same sample selection, picture test and timing as vlcjs.mjs, plus a silent audio probe.
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { root } from '../../tests/lib/browser.mjs';

export { root };
export const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));

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

/** Headless Chrome, always muted. */
export async function launch() {
  return chromium.launch({ channel: 'chrome', args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
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
