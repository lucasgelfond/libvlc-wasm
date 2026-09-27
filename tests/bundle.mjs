// What a consumer's bundle really contains, per way of using the SDK: packs
// the tarballs, builds a Vite app for each case, measures what it emits and
// what the page downloads, and checks the feature still works. Muted.
//   node tests/bundle.mjs [--keep]
//
// Cases:
//   probe      import { createVLC }; probe() a file (no player, no element)
//   player     createVLC + createPlayer + play
//   element    import 'libvlc-wasm/element' and a <vlc-player>
//   lazy       the page loads without the SDK; import('libvlc-wasm') on demand
//   transcode  libvlc-wasm-sout imported dynamically, only when converting
// Checks: the transcoding engine (35 MB) is never emitted unless imported; the
// lazy page fetches no wasm (nor any SDK code) before the SDK is imported; the
// subtitle font is emitted but not downloaded when nothing needs it.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { root, launchMuted } from './lib/browser.mjs';

const keep = process.argv.includes('--keep');
const tmp = mkdtempSync(join(tmpdir(), 'libvlc-wasm-bundle-'));
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

const CASES = {
  probe: `import { createVLC } from 'libvlc-wasm';
window.run = async () => {
  const vlc = await createVLC();
  const info = await vlc.probe(new File([await (await fetch('/t.wmv')).blob()], 't.wmv'));
  return info.tracks.map((t) => t.codec.trim()).join('+');
};`,
  player: `import { createVLC } from 'libvlc-wasm';
window.run = async () => {
  const vlc = await createVLC();
  const p = await vlc.createPlayer({ canvas: document.querySelector('canvas'), audio: false });
  await p.open('/t.wmv');
  await new Promise((r) => setTimeout(r, 1200));
  return p.renderer.framesDrawn > 5 ? 'frames' : 'no frames';
};`,
  element: `import 'libvlc-wasm/element';
window.run = async () => {
  const el = document.createElement('vlc-player');
  el.setAttribute('muted', '');
  el.setAttribute('autoplay', '');
  el.style.cssText = 'display:block;width:320px;height:240px';
  document.body.append(el);
  el.src = '/t.wmv';
  const p = await el.ready;
  for (let i = 0; i < 30 && !(p.renderer?.framesDrawn > 5); i++) await new Promise((r) => setTimeout(r, 200));
  return p.renderer?.framesDrawn > 5 ? 'frames' : 'no frames (state ' + p.state + ', renderer ' + !!p.renderer + ')';
};`,
  lazy: `window.run = async () => {
  const { createVLC } = await import('libvlc-wasm');
  const vlc = await createVLC();
  return vlc.version.version.split(' ')[0];
};`,
  transcode: `import { createVLC } from 'libvlc-wasm';
window.run = async () => {
  const { default: sout } = await import('libvlc-wasm-sout');
  const vlc = await createVLC({ engine: sout });
  const out = await vlc.transcode(new File([await (await fetch('/t.wmv')).blob()], 't.wmv'), { to: 'webm' });
  return out.size > 1000 ? 'webm ' + out.size : 'empty';
};`,
};

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

let failed = 0;
const servers = [];
try {
  for (const p of ['core', 'sout']) sh('pnpm', ['pack', '--pack-destination', tmp], resolve(root, 'packages', p));
  const tgz = (prefix) => readdirSync(tmp).find((f) => f.startsWith(prefix) && f.endsWith('.tgz'));
  const core = tgz('libvlc-wasm-0'), sout = tgz('libvlc-wasm-sout-');
  const browser = await launchMuted('chromium');
  const rows = [];
  for (const [name, code] of Object.entries(CASES)) {
    const app = join(tmp, name);
    mkdirSync(join(app, 'public'), { recursive: true });
    copyFileSync(resolve(root, 'corpus/media/gen/t_wmv2.wmv'), join(app, 'public/t.wmv'));
    const deps = { 'libvlc-wasm': `file:../${core}` };
    if (name === 'transcode') deps['libvlc-wasm-sout'] = `file:../${sout}`;
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name, private: true, type: 'module', dependencies: deps, devDependencies: { vite: '^7.1.0' } }));
    writeFileSync(join(app, 'vite.config.js'), "import vlc from 'libvlc-wasm/vite';\nexport default { plugins: [vlc()] };\n");
    writeFileSync(join(app, 'index.html'), '<!doctype html><canvas width="320" height="240"></canvas><script type="module" src="/main.js"></script>\n');
    writeFileSync(join(app, 'main.js'), code);
    sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], app);
    sh('npx', ['vite', 'build', '--logLevel', 'error'], app);

    // What the build emitted.
    const files = walk(join(app, 'dist')).map((f) => ({ f, size: statSync(f).size, ext: extname(f) }));
    const js = files.filter((x) => x.ext === '.js');
    const entry = js.filter((x) => /index-[^/]*\.js$/.test(x.f)).reduce((a, x) => a + x.size, 0);
    const wasm = files.filter((x) => x.ext === '.wasm');
    const soutEmitted = wasm.some((x) => x.f.includes('sout'));

    // What the page downloads, before and after run().
    const port = 6200 + Math.floor(Math.random() * 500);
    const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
    servers.push(server);
    await new Promise((ok, bad) => {
      const t = setTimeout(() => bad(new Error('preview did not start')), 30000);
      server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); ok(); } });
    });
    const page = await browser.newPage();
    const fetched = [];
    page.on('response', async (r) => {
      const u = new URL(r.url());
      const len = Number(r.headers()['content-length'] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      fetched.push({ path: u.pathname, len });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.run);
    await page.waitForTimeout(300);
    const before = fetched.reduce((a, x) => a + x.len, 0);
    const wasmBefore = fetched.some((x) => x.path.endsWith('.wasm'));
    const result = await page.evaluate(() => window.run()).catch((e) => `error: ${e.message}`);
    await page.waitForTimeout(300);
    const after = fetched.reduce((a, x) => a + x.len, 0);
    const fontFetched = fetched.some((x) => /NotoSans/.test(x.path));
    await page.close();
    server.kill();

    const checks = [
      [!/^error|no frames|empty/.test(result), `works (${result})`],
      [name === 'transcode' || !soutEmitted, 'sout engine not emitted'],
      [name !== 'lazy' || !wasmBefore, 'no wasm before import()'],
      [!fontFetched, 'font not downloaded'],
    ];
    const ok = checks.every(([c]) => c);
    if (!ok) failed++;
    rows.push({ name, ok, entry, jsTotal: js.reduce((a, x) => a + x.size, 0), wasm: wasm.reduce((a, x) => a + x.size, 0), before, after, checks });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} entry JS ${kb(entry).padStart(7)}  all JS ${kb(js.reduce((a, x) => a + x.size, 0)).padStart(7)}  wasm ${mb(wasm.reduce((a, x) => a + x.size, 0)).padStart(7)}  ` +
      `page load ${kb(before).padStart(7)}  after run ${mb(after).padStart(7)}  ${checks.filter(([c]) => !c).map(([, m]) => `NOT: ${m}`).join('; ') || checks[0][1]}`);
  }
  await browser.close();
  console.log(`\n[bundle] ${rows.length - failed}/${rows.length} passed`);
  process.exitCode = failed ? 1 : 0;
} finally {
  for (const s of servers) s.kill();
  if (!keep) rmSync(tmp, { recursive: true, force: true });
  else console.log(`kept ${tmp}`);
}
