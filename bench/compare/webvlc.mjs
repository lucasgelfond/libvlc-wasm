// Runs the corpus through addyosmani/webvlc (2026): a React UI around the browser's own
// <video>/<audio> element (plus a butterchurn visualiser for audio). It contains no wasm build of
// VLC, so this measures what Chrome alone plays, behind webvlc's UI.
//   git clone --depth 1 https://github.com/addyosmani/webvlc .research/webvlc && (cd .research/webvlc && npm i && npx vite build)
//   node bench/compare/webvlc.mjs [--only=category] [--limit=N] [--video-only] [--shots]
// Writes bench/compare/webvlc-results.json. Silent: Chrome runs muted.
//
// Served from its production build (what the live demo at webvlc.addy.ie runs), not `vite` dev.
//
// webvlc never loads the FIRST video file opened in a fresh page: MediaEngine attaches the
// <source> to the <audio> element that is mounted before isVideo flips, then the <video> that
// replaces it has no source (readyState 0, no error shown). Opening a file again works. Each row
// records that first attempt as `firstOpenLoaded`, then re-opens the same file and measures that.
//
// webvlc drops any file whose extension is not in its allow-list (fileUtils.js), so e.g. .rm,
// .wmv, .flv or .ts never reach the <video> element. For those, and for any file webvlc failed
// on, the row also carries `browserAlone`: the same file put straight into a bare <video>/<audio>
// with the same checks, so the table can separate "webvlc refused it" from "Chrome can't play it".
import { writeFileSync, existsSync } from 'node:fs';
import { root, args, loadSamples, serve, launch, variance, AUDIO_PROBE, logRow, summarize } from './_common.mjs';

const repo = `${root}/.research/webvlc`;
if (!existsSync(`${repo}/dist/index.html`)) throw new Error('clone addyosmani/webvlc into .research/webvlc, then npm i && npx vite build');
const PORT = 5496;
const samples = loadSamples();

// `audible` = the analyser saw signal, or (fallback, since captureStream does not always hook in
// time on short files) Chrome reports decoded audio bytes while currentTime advanced.
// Route every media element's audio into an analyser too (via captureStream, never to the
// speakers), so audible audio is measured the same way as the wasm ports' Web Audio graphs.
const MEDIA_PROBE = `(() => {
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      if (!this.__probed) {
        this.__probed = true;
        const ctx = new AudioContext();
        const hook = () => {
          const tracks = this.captureStream().getAudioTracks();
          if (!tracks.length) return false;
          const src = ctx.createMediaStreamSource(new MediaStream(tracks));
          const a = ctx.createAnalyser(); a.fftSize = 2048; src.connect(a);
          window.__mediaAnalysers = [...(window.__mediaAnalysers ?? []), a];
          return true;
        };
        const tryHook = () => { if (!hook()) setTimeout(tryHook, 100); };
        this.addEventListener('playing', tryHook, { once: true });
      }
    } catch {}
    return origPlay.call(this);
  };
  let peak = 0;
  const buf = new Float32Array(2048);
  setInterval(() => {
    for (const a of window.__mediaAnalysers ?? []) {
      a.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      peak = Math.max(peak, Math.sqrt(s / buf.length));
    }
  }, 50);
  window.__mediaPeak = () => peak;
})();`;

const mediaState = () => {
  const el = document.querySelector('video, audio');
  if (!el) return null;
  return {
    tag: el.tagName.toLowerCase(), readyState: el.readyState, videoWidth: el.videoWidth ?? 0,
    currentTime: el.currentTime, error: el.error ? el.error.code : null,
    audioBytes: el.webkitAudioDecodedByteCount ?? null, videoFrames: el.webkitVideoDecodedFrameCount ?? null,
  };
};

/** Measures one file in `p` after `open()` has been called; `selector` is the element to screenshot. */
async function measure(p, scratch, s, open, selector) {
  let firstFrameMs = null, maxVar = 0, loadedMs = null, played = false;
  const tOpen = Date.now();
  await open();
  while (Date.now() - tOpen < 6000) {
    await p.waitForTimeout(250);
    const st = await p.evaluate(mediaState).catch(() => null);
    if (st?.readyState >= 2 && loadedMs == null) loadedMs = Date.now() - tOpen;
    if (st?.videoWidth > 0 && st.currentTime > 0) played = true;
    if (!s.video || st?.tag !== 'video' || !st.videoWidth) continue;
    const shot = await p.locator(selector).screenshot({ timeout: 2000 }).catch(() => null);
    if (!shot) continue;
    const v = await variance(scratch, shot);
    maxVar = Math.max(maxVar, v);
    if (v > 20 && firstFrameMs == null) firstFrameMs = Date.now() - tOpen;
    if (v >= maxVar && args.shots) writeFileSync(`${root}/bench/compare/webvlc-${s.id}.png`, shot);
  }
  const state = await p.evaluate(mediaState).catch(() => null);
  const peak = Math.max(
    await p.evaluate(() => window.__mediaPeak?.() ?? 0).catch(() => 0),
    await p.evaluate(() => window.__audioPeak?.().peak ?? 0).catch(() => 0),
  );
  return { firstFrameMs, maxVar: played ? maxVar : 0, loadedMs, state, peak };
}

const server = await serve(PORT, { '/': `${repo}/dist/` }, {}, { isolate: false });
const browser = await launch();
const scratch = await browser.newPage();

const results = [];
for (const s of samples) {
  const p = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  await p.addInitScript(AUDIO_PROBE);
  await p.addInitScript(MEDIA_PROBE);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let crashed = false, ready = false, m = null, uiError = null, firstOpenLoaded = null;
  p.on('crash', () => { crashed = true; });
  const t0 = Date.now();
  const path = `${root}/corpus/media/${s.file}`;
  try {
    await p.goto(`http://localhost:${PORT}/`, { timeout: 30000 });
    ready = await p.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 }).then(() => true, () => false);
    const input = p.locator('input[type=file]').first();
    await input.setInputFiles(path);
    await p.waitForTimeout(1500);
    const first = await p.evaluate(mediaState);
    firstOpenLoaded = first ? first.readyState > 0 : null;
    if (first) await input.setInputFiles([]);
    m = await measure(p, scratch, s, () => input.setInputFiles(path), 'video');
    uiError = await p.evaluate(() => document.querySelector('[class*=errorMessage]')?.textContent?.trim() || null).catch(() => null);
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  const rejectedByUi = ready && !m?.state; // no media element was ever created for the file
  let browserAlone;
  const failed = s.video ? !((m?.maxVar ?? 0) > 20) : !((m?.peak ?? 0) > 1e-3);
  if ((rejectedByUi || failed) && !crashed) {
    // The same file in a bare element, bypassing webvlc's UI (extension allow-list, MIME hints).
    const q = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    await q.addInitScript(MEDIA_PROBE);
    await q.setContent(`<input type=file><${s.video ? 'video' : 'audio'} style="width:960px;height:540px;background:#000"></${s.video ? 'video' : 'audio'}>
      <script>document.querySelector('input').onchange = (e) => { const el = document.querySelector('video,audio'); el.src = URL.createObjectURL(e.target.files[0]); el.play().catch(() => {}); };</script>`);
    const b = await measure(q, scratch, s, () => q.locator('input').setInputFiles(path), 'video').catch(() => null);
    browserAlone = b && { video: s.video ? b.maxVar > 20 : null, firstFrameMs: b.firstFrameMs, audible: s.audio ? b.peak > 1e-3 || (b.state?.audioBytes > 0 && b.state.currentTime > 0) : null, mediaError: b.state?.error ?? null };
    await q.close().catch(() => {});
  }
  const row = {
    id: s.id, name: s.name, category: s.category, hasVideo: !!s.video, hasAudio: !!s.audio,
    ready, rejectedByUi, firstOpenLoaded, video: s.video ? (m?.maxVar ?? 0) > 20 : null, firstFrameMs: m?.firstFrameMs ?? null, loadedMs: m?.loadedMs ?? null,
    maxVariance: Math.round(m?.maxVar ?? 0), audible: s.audio ? (m?.peak ?? 0) > 1e-3 || (m?.state?.audioBytes > 0 && m.state.currentTime > 0) : null, audioPeakRms: m ? +m.peak.toFixed(4) : null,
    mediaError: m?.state?.error ?? null, uiError, media: m?.state ?? null, browserAlone,
    crashed, errors: errors.slice(0, 5), wallMs: Date.now() - t0,
  };
  results.push(row);
  logRow(row);
  await p.close().catch(() => {});
}
await browser.close();
server.close();
const summary = summarize('addyosmani/webvlc', results);
const alone = results.filter((r) => r.browserAlone);
summary.rejectedByUi = results.filter((r) => r.rejectedByUi).length;
summary.failedButBrowserPlays = alone.filter((r) => r.browserAlone.video || (!r.hasVideo && r.browserAlone.audible)).map((r) => r.id);
console.log(`webvlc's extension filter refused ${summary.rejectedByUi} files; of the files webvlc failed on, a bare element plays: ${summary.failedButBrowserPlays.join(', ') || 'none'}`);
writeFileSync(`${root}/bench/compare/webvlc-results.json`, JSON.stringify({ date: new Date().toISOString(), port: 'addyosmani/webvlc', summary, results }, null, 1));
