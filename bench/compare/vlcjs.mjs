// Runs the corpus through addyosmani/vlc.js (the 2024 VideoLabs binary) so the
// comparison in bench/compare/COMPARISON.md is measured, not assumed.
//   git clone --depth 1 https://github.com/addyosmani/vlc.js .research/vlc.js
//   node bench/compare/vlcjs.mjs [--only=category] [--limit=N]
// Writes bench/compare/vlcjs-results.json. Silent: Chrome runs muted.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { root } from '../../tests/lib/browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const repo = `${root}/.research/vlc.js`;
if (!existsSync(repo)) throw new Error('clone addyosmani/vlc.js into .research/vlc.js first');

const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
let samples = manifest.samples.filter((s) => s.video && !s.test?.mode && (!args.only || s.category === args.only));
samples.push({ id: 'gen-h264-opus-ass', name: 'H.264 + Opus + ASS in MKV (generated)', category: 'control', file: 'gen/t_h264_opus_ass.mkv', video: 'H.264' });
if (args.limit) samples = samples.slice(0, +args.limit);

const server = await createServer({ root: repo, configFile: `${repo}/vite.config.js`, logLevel: 'error', server: { port: 5499 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const scratch = await browser.newPage();

/** Luma variance of a PNG screenshot, decoded in a scratch page. */
async function variance(png) {
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

const results = [];
for (const s of samples) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  let ready = false, firstFrameMs = null, maxVar = 0, crashed = false;
  page.on('crash', () => { crashed = true; });
  try {
    await page.goto('http://localhost:5499/', { timeout: 30000 });
    ready = await page.waitForFunction(() => /Ready|ready/.test(document.getElementById('status-text')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false);
    const tOpen = Date.now();
    await page.setInputFiles('#input-file', `${root}/corpus/media/${s.file}`);
    while (Date.now() - tOpen < 6000 && !crashed) {
      await page.waitForTimeout(250);
      const shot = await page.locator('#canvas').screenshot({ timeout: 2000 }).catch(() => null);
      if (!shot) continue;
      const v = await variance(shot);
      maxVar = Math.max(maxVar, v);
      if (v > 20 && firstFrameMs == null) firstFrameMs = Date.now() - tOpen;
      if (v >= maxVar && args.shots) (await import('node:fs')).writeFileSync(`${root}/bench/compare/vlcjs-${s.id}.png`, shot);
    }
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  const status = await page.locator('#status-text').textContent().catch(() => null);
  const row = { id: s.id, name: s.name, category: s.category, ready, video: maxVar > 20, firstFrameMs, maxVariance: Math.round(maxVar), crashed, status, errors: errors.slice(0, 5), wallMs: Date.now() - t0 };
  results.push(row);
  console.log(`${row.video ? 'VIDEO' : 'none '}  ${s.id.padEnd(44)} ${firstFrameMs ?? '-'} ms  ${crashed ? 'CRASHED ' : ''}${errors[0]?.slice(0, 90) ?? ''}`);
  await page.close().catch(() => {});
}
await browser.close();
await server.close();
writeFileSync(`${root}/bench/compare/vlcjs-results.json`, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
const n = results.filter((r) => r.video).length;
console.log(`\naddyosmani/vlc.js showed video for ${n}/${results.length} video samples`);
