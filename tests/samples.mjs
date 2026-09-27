// Plays every sample the site offers (apps/player/src/lib/samples.ts) the way a
// visitor would, and checks what a visitor would notice, not only that it
// started: the clock runs, the seek bar moves (by time, or by position when
// the file has no duration), video shows a picture that is not black and keeps
// drawing, audio produces sound, and nothing stops early. Muted.
//   node tests/samples.mjs [--engine=webkit] [--only=bluray,quake] [--seconds=6]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, launchMuted } from './lib/browser.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const engine = arg('engine') ?? 'chromium';
const seconds = +(arg('seconds') ?? 6);
const only = arg('only')?.split(',');

// The sample list is TypeScript; the ids and kinds are all this needs.
const src = readFileSync(resolve(root, 'apps/player/src/lib/samples.ts'), 'utf8');
const samples = [...src.matchAll(/id:\s*"([^"]+)",\s*label:\s*"[^"]*",\s*kind:\s*"(video|audio|disc)"/g)]
  .map(([, id, kind]) => ({ id, kind }))
  .filter((s) => !only || only.includes(s.id));
if (!samples.length) throw new Error('no samples found in samples.ts');

const port = 5300 + Math.floor(Math.random() * 500);
const server = spawn('pnpm', ['exec', 'vite', 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { cwd: resolve(root, 'apps/player'), stdio: ['ignore', 'pipe', 'pipe'] });
const url = `http://127.0.0.1:${port}`;
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('the app dev server did not start in 60 s')), 60000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); ok(); } });
  server.on('exit', (code) => fail(new Error(`the app dev server exited (${code})`)));
});
const browser = await launchMuted(engine);
// The dev server optimizes dependencies on the first load and then reloads the
// page, which would restart the first sample: load once before measuring.
{
  const warm = await browser.newPage();
  await warm.goto(url);
  await warm.waitForFunction(() => window.session?.ready, null, { timeout: 60000 });
  await warm.waitForTimeout(2000);
  await warm.close();
}

/** In the page: luma variance of the canvas, 0 for a flat (black) picture. */
const variance = () => {
  const c = document.querySelector('canvas');
  const o = new OffscreenCanvas(96, 54).getContext('2d');
  o.drawImage(c, 0, 0, 96, 54);
  const d = o.getImageData(0, 0, 96, 54).data;
  let s = 0, s2 = 0;
  for (let k = 0; k < d.length; k += 4) { const y = (d[k] * 2 + d[k + 1] * 5 + d[k + 2]) >> 3; s += y; s2 += y * y; }
  const n = d.length / 4;
  return s2 / n - (s / n) ** 2;
};
const snap = () => {
  const s = window.session;
  return {
    state: s.state, time: s.time, position: s.position, duration: s.duration, ended: s.ended, error: s.error,
    inMenu: s.inMenu, level: s.level, frames: s.player?.renderer?.framesDrawn ?? 0,
    sheen: !!document.querySelector('.sheen')
  };
};

let failed = 0;
for (const { id, kind } of samples) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const problems = [];
  let detail = '';
  try {
    await page.goto(`${url}/?sample=${id}`);
    await page.waitForFunction(() => window.session?.state === 'playing', null, { timeout: 45000 });
    // A disc starts in its menu: pick the first entry, as a visitor would.
    if (kind === 'disc') {
      await page.waitForTimeout(1500);
      if (await page.evaluate(() => window.session.inMenu)) {
        await page.evaluate(() => window.session.player.navigate('activate'));
        await page.waitForFunction(() => !window.session.inMenu, null, { timeout: 15000 }).catch(() => problems.push('stayed in the disc menu'));
      }
    }
    await page.waitForTimeout(1000);
    const a = await page.evaluate(snap);
    let maxVar = 0, maxLevel = a.level ?? 0, last = a;
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
      await page.waitForTimeout(1000);
      last = await page.evaluate(snap);
      maxLevel = Math.max(maxLevel, last.level ?? 0);
      if (kind !== 'audio') maxVar = Math.max(maxVar, await page.evaluate(variance));
      if (last.ended || last.state !== 'playing') break;
    }
    const wall = (Date.now() - t0) / 1000 + 1;
    const ran = last.time - a.time;
    if (last.error) problems.push(`error: ${last.error}`);
    // Stopped early: ended well before the reported duration.
    if (last.ended && last.duration && last.time < last.duration - 2) problems.push(`stopped early at ${last.time.toFixed(1)} s of ${last.duration.toFixed(1)} s`);
    // A sample is there to be tried: one over in a moment is a bad sample.
    else if (last.ended && last.time < 3) problems.push(`ended after ${last.time.toFixed(1)} s`);
    if (!last.ended && ran < wall * 0.5) problems.push(`clock ran ${ran.toFixed(1)} s in ${wall.toFixed(0)} s`);
    // The seek bar: by time when there is a duration, otherwise by position.
    if (!last.ended) {
      // No length and no position (a looping chiptune): the bar must say so.
      const moved = last.duration > 0 ? last.time > a.time : last.position > a.position || last.sheen;
      if (!moved) problems.push(`seek bar did not move (duration ${last.duration}, position ${a.position.toFixed(3)} → ${last.position.toFixed(3)})`);
    }
    if (kind !== 'audio') {
      const fps = (last.frames - a.frames) / wall;
      if (fps < 3 && !last.ended) problems.push(`drew ${fps.toFixed(1)} pictures/s`);
      if (maxVar < 20) problems.push(`picture is flat or black (variance ${maxVar.toFixed(1)})`);
      detail = `${fps.toFixed(1)} fps, variance ${maxVar.toFixed(0)}, `;
    }
    if (kind === 'audio' && !(maxLevel > 0.001)) problems.push('no sound (audio level 0)');
    detail += `t ${a.time.toFixed(1)}→${last.time.toFixed(1)} s, pos ${a.position.toFixed(3)}→${last.position.toFixed(3)}, level ${maxLevel.toFixed(3)}`;
  } catch (e) {
    problems.push(String(e?.message ?? e).split('\n')[0]);
  }
  if (errors.length) problems.push(`page error: ${errors[0]}`);
  const ok = !problems.length;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(14)} ${ok ? detail : problems.join('; ')}`);
  await page.close();
}
await browser.close();
server.kill();
console.log(`\n${samples.length - failed}/${samples.length} samples play as a visitor would see them`);
process.exit(failed ? 1 : 0);
