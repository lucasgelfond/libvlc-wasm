// End to end through the player site (apps/player), as a visitor uses it:
// the start screen, the sample menu, a DVD's menus, ?sample= links, a picked
// file, and the formats page. Muted, like every test here.
//   node tests/app.mjs [--engine=webkit]
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { root, launchMuted } from './lib/browser.mjs';

const engine = process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
// The app's own Vite (it has its own version and SvelteKit), on a free port.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  let r;
  try {
    const detail = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 60 s')), 60000))]);
    r = { name, ok: true, detail: detail ?? '' };
  } catch (e) {
    r = { name, ok: false, detail: String(e?.message ?? e).split('\n')[0] };
  }
  r.ms = Date.now() - t0;
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const ready = () => page.waitForFunction(() => window.session?.ready, null, { timeout: 30000 });
const frames = () => page.evaluate(() => window.session.player?.renderer?.framesDrawn ?? 0);

await test('start screen: engine ready, no page errors', async () => {
  await page.goto(`${url}/`);
  await ready();
  await page.getByText('Drop files or folders for playback').waitFor();
  assert(!errors.length, errors.join('; '));
  return 'ready';
});

await test('about text folds and unfolds', async () => {
  const more = page.getByRole('button', { name: /more|less/i }).first();
  const before = await more.getAttribute('aria-expanded');
  await more.click();
  const after = await more.getAttribute('aria-expanded');
  assert(before !== after, `aria-expanded stayed ${before}`);
  await more.click();
  return `${before} → ${after} → ${before}`;
});

await test('sample menu: DVD opens on its menu, a click plays', async () => {
  await page.getByRole('button', { name: 'sample' }).click();
  await page.getByRole('menuitem', { name: /DVD/ }).click();
  await page.waitForFunction(() => window.session.inMenu && window.session.player.renderer.framesDrawn > 2, null, { timeout: 20000 });
  // "Play" on the showcase disc's main menu: 84..340 x 292..334 of its 720x480
  // picture, which is 4:3 and drawn centred inside the canvas.
  const box = await page.locator('canvas').boundingBox();
  const pw = Math.min(box.width, box.height * 4 / 3), ph = pw * 3 / 4;
  const px = box.x + (box.width - pw) / 2, py = box.y + (box.height - ph) / 2;
  await page.mouse.click(px + pw * (212 / 720), py + ph * (313 / 480));
  await page.waitForFunction(() => !window.session.inMenu && window.session.time > 0.5, null, { timeout: 15000 });
  // The feature's tracks are announced one by one as the title starts.
  await page.waitForFunction(() => window.session.audio.length === 2 && window.session.subtitles.length === 2, null, { timeout: 8000 })
    .catch(() => {});
  const s = await page.evaluate(() => ({ audio: window.session.audio.length, subs: window.session.subtitles.length }));
  assert(s.audio === 2 && s.subs === 2, JSON.stringify(s));
  return `menu → feature, ${s.audio} audio and ${s.subs} subtitle tracks`;
});

for (const [id, kind] of [['bluray', 'video'], ['playstation', 'video'], ['wmv', 'video'], ['c64', 'audio'], ['genesis', 'audio']]) {
  await test(`?sample=${id} plays its ${kind}`, async () => {
    await page.goto(`${url}/?sample=${id}`);
    await ready();
    await page.waitForFunction(() => window.session.state === 'playing' && window.session.tracks.length, null, { timeout: 20000 });
    if (kind === 'video') {
      const f0 = await frames();
      await page.waitForFunction((n) => window.session.player.renderer.framesDrawn > n + 5, f0, { timeout: 10000 });
    } else {
      await page.waitForFunction(() => window.session.time > 1 && window.session.player.audioFramesPlayed > 24000, null, { timeout: 15000 });
    }
    return (await page.evaluate(() => window.session.tracks.map((t) => `${t.type}:${t.codec.trim()}`).join(' ')));
  });
}

await test('a file picked from disk plays', async () => {
  await page.goto(`${url}/`);
  await ready();
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles(resolve(root, 'corpus/media/gen/t_wmv2.wmv'));
  await page.waitForFunction(() => window.session.state === 'playing' && window.session.player.renderer.framesDrawn > 5, null, { timeout: 15000 });
  return await page.evaluate(() => window.session.name);
});

await test('formats page: summary and table, no tooltips', async () => {
  await page.goto(`${url}/formats`);
  const rows = page.locator('tbody tr');
  await rows.first().waitFor();
  const n = await rows.count();
  assert(n > 50, `${n} rows`);
  assert(!(await page.locator('[data-slot="tooltip-trigger"], [data-tooltip-trigger]').count()), 'a tooltip trigger remains');
  return `${n} rows`;
});

await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n[${engine}] ${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
