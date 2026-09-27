// Runs the corpus through Krowemoh/vlc.js (2024): the Videolabs 2024-03-07 VLC 4.0.0-dev
// binary re-hosted with a ~100-line VLCPlayer() wrapper (lib/vlc/vlc.js) that fetch()es a URL
// into a File and hands it to libvlc when #play is clicked.
//   git clone --depth 1 https://github.com/Krowemoh/vlc.js .research/krowemoh
//   node bench/compare/krowemoh.mjs [--engine=chromium|webkit|firefox] [--only=category] [--limit=N] [--video-only] [--shots]
// Writes bench/compare/krowemoh-results.json (krowemoh-<engine>-results.json off Chromium). Silent: every engine runs muted.
//
// The repo's own index.html does not run as shipped (`source: "/path/to/video.mkv"` is missing
// the comma before `options:`, a SyntaxError), so the harness page below is that index.html
// with the comma added and `source` pointing at the sample. Nothing else is changed; the
// wrapper, options and binary are the repo's.
import { writeFileSync, existsSync } from 'node:fs';
import { root, args, engine, portFor, loadSamples, serve, variance, AUDIO_PROBE, logRow, saveResults, session, timed, resumeRows, checkpoint } from './_common.mjs';

const repo = `${root}/.research/krowemoh`;
if (!existsSync(repo)) throw new Error('clone Krowemoh/vlc.js into .research/krowemoh first');
const PORT = portFor(5497);
const samples = loadSamples();

const page = (src) => `<!doctype html>
<html lang="en-us"><head><meta charset="utf-8"><title>VLC Wasm Example</title></head><body>
<div>
  <canvas id="canvas" style="background-color:gray;"></canvas>
  <div>
    <button id="play">Play</button>
    <button id="pause">Stop</button>
    <meter id="seekbar" max="100" style="width: 500px" value="0"></meter>
    <meter id="volume" max="100" style="width: 100px" value="80"></meter>
  </div>
</div>
<script src="./lib/vlc/experimental.js"></script>
<script type="module">
  import { VLCPlayer } from "./lib/vlc/vlc.js";
  let video = {
    source: ${JSON.stringify(src)},
    options:"--codec=webcodec --aout=emworklet_audio -vv --input-repeat=10000",
    size: { width: "700px", height: "" },
  };
  window.onload = async function () { await VLCPlayer(video); window.__vlcReady = true; };
</script></body></html>`;

const pages = {};
for (const s of samples) pages[`/h/${s.id}.html`] = page(`/media/${s.file}`);
const server = await serve(PORT, { '/h/lib/': `${repo}/lib/`, '/media/': `${root}/corpus/media/` }, pages);
const sess = await session();

const results = resumeRows('krowemoh');
for (const s of samples) {
  if (results.some((r) => r.id === s.id)) continue;
  const p = await sess.page({ viewport: { width: 1024, height: 700 } });
  await p.addInitScript(AUDIO_PROBE);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  const t0 = Date.now();
  let ready = false, firstFrameMs = null, maxVar = 0, crashed = false, audio = null;
  p.on('crash', () => { crashed = true; });
  try {
    await p.goto(`http://127.0.0.1:${PORT}/h/${s.id}.html`, { timeout: 30000 });
    ready = await p.waitForFunction(() => window.__vlcReady === true, null, { timeout: 30000 }).then(() => true, () => false);
    const tOpen = Date.now();
    await p.click('#play', { timeout: 5000 });
    while (Date.now() - tOpen < 6000 && !crashed) {
      await p.waitForTimeout(250);
      const shot = await p.locator('#canvas').screenshot({ timeout: 2000 }).catch(() => null);
      if (!shot) continue;
      const v = await variance(sess.scratch, shot);
      maxVar = Math.max(maxVar, v);
      if (v > 20 && firstFrameMs == null) firstFrameMs = Date.now() - tOpen;
      if (v >= maxVar && args.shots) writeFileSync(`${root}/bench/compare/krowemoh-${s.id}.png`, shot);
    }
    audio = await timed(p.evaluate(() => window.__audioPeak?.()), 5000);
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  const row = {
    id: s.id, name: s.name, category: s.category, hasVideo: !!s.video, hasAudio: !!s.audio,
    ready, video: s.video ? maxVar > 20 : null, firstFrameMs, maxVariance: Math.round(maxVar),
    audible: s.audio ? (audio?.peak ?? 0) > 1e-3 : null, audioPeakRms: audio ? +audio.peak.toFixed(4) : null, audioGraphs: audio?.graphs ?? 0,
    crashed, errors: errors.slice(0, 5), wallMs: Date.now() - t0,
  };
  results.push(row);
  checkpoint('krowemoh', results);
  logRow(row);
  await timed(p.close(), 10000);
}
await sess.close();
server.close();
saveResults('krowemoh', `Krowemoh/vlc.js (${engine})`, { port: 'Krowemoh/vlc.js', relaunches: sess.relaunches }, results);
