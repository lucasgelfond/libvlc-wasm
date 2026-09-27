// Runs the corpus through addyosmani/vlc.js (the 2024 VideoLabs binary) so the
// comparison on the site's /benchmarks page is measured, not assumed.
//   git clone --depth 1 https://github.com/addyosmani/vlc.js .research/vlc.js
//   node bench/compare/vlcjs.mjs [--engine=chromium|webkit|firefox] [--only=category] [--limit=N] [--video-only] [--shots]
// Writes bench/compare/vlcjs-results.json (vlcjs-<engine>-results.json off Chromium). Silent: every engine runs muted.
import { writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';
import { root, args, engine, portFor, loadSamples, variance, AUDIO_PROBE, logRow, saveResults, session, timed, resumeRows, checkpoint } from './_common.mjs';

const repo = `${root}/.research/vlc.js`;
if (!existsSync(repo)) throw new Error('clone addyosmani/vlc.js into .research/vlc.js first');
const samples = loadSamples();
const PORT = portFor(5499);

const server = await createServer({ root: repo, configFile: `${repo}/vite.config.js`, logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const sess = await session();

const results = resumeRows('vlcjs');
for (const s of samples) {
  if (results.some((r) => r.id === s.id)) continue;
  const page = await sess.page({ viewport: { width: 1024, height: 700 } });
  await page.addInitScript(AUDIO_PROBE);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  let ready = false, firstFrameMs = null, maxVar = 0, crashed = false, audio = null;
  page.on('crash', () => { crashed = true; });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 30000 });
    ready = await page.waitForFunction(() => /Ready|ready/.test(document.getElementById('status-text')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false);
    const tOpen = Date.now();
    await page.setInputFiles('#input-file', `${root}/corpus/media/${s.file}`);
    while (Date.now() - tOpen < 6000 && !crashed) {
      await page.waitForTimeout(250);
      const shot = await page.locator('#canvas').screenshot({ timeout: 2000 }).catch(() => null);
      if (!shot) continue;
      const v = await variance(sess.scratch, shot);
      maxVar = Math.max(maxVar, v);
      if (v > 20 && firstFrameMs == null) firstFrameMs = Date.now() - tOpen;
      if (v >= maxVar && args.shots) writeFileSync(`${root}/bench/compare/vlcjs-${s.id}.png`, shot);
    }
    audio = await timed(page.evaluate(() => window.__audioPeak?.()), 5000);
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  const status = await page.locator('#status-text').textContent().catch(() => null);
  const row = {
    id: s.id, name: s.name, category: s.category, hasVideo: !!s.video, hasAudio: !!s.audio,
    ready, video: s.video ? maxVar > 20 : null, firstFrameMs, maxVariance: Math.round(maxVar),
    audible: s.audio ? (audio?.peak ?? 0) > 1e-3 : null, audioPeakRms: audio ? +audio.peak.toFixed(4) : null, audioGraphs: audio?.graphs ?? 0,
    crashed, status, errors: errors.slice(0, 5), wallMs: Date.now() - t0,
  };
  results.push(row);
  checkpoint('vlcjs', results);
  logRow(row);
  await timed(page.close(), 10000);
}
await sess.close();
await server.close();
saveResults('vlcjs', `addyosmani/vlc.js (${engine})`, { port: 'addyosmani/vlc.js', relaunches: sess.relaunches }, results);
