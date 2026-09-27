// The npm packages as a stranger gets them: pack both tarballs, install them
// into a fresh Vite app, build it, and play and transcode in a real page.
// Catches files missing from "files", broken exports, the worker failing
// under a bundler's hashed names, and the isolation headers.  Muted.
//   node tests/package.mjs [--engine=webkit]
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { root, launchMuted } from './lib/browser.mjs';

const engine = process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
const tmp = mkdtempSync(join(tmpdir(), 'libvlc-wasm-pkg-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let server;
try {
  for (const p of ['core', 'sout']) run('pnpm', ['pack', '--pack-destination', tmp], resolve(root, 'packages', p));
  const tgz = (prefix) => readdirSync(tmp).find((f) => f.startsWith(prefix) && f.endsWith('.tgz'));
  const core = tgz('libvlc-wasm-0'), sout = tgz('libvlc-wasm-sout-');
  const app = join(tmp, 'app');
  mkdirSync(join(app, 'public'), { recursive: true });
  copyFileSync(resolve(root, 'corpus/media/gen/t_wmv2.wmv'), join(app, 'public/t.wmv'));
  writeFileSync(join(app, 'package.json'), JSON.stringify({
    name: 'consumer', private: true, type: 'module',
    dependencies: { 'libvlc-wasm': `file:../${core}`, 'libvlc-wasm-sout': `file:../${sout}` },
    devDependencies: { vite: '^7.1.0' },
  }, null, 2));
  writeFileSync(join(app, 'vite.config.js'), "import vlc from 'libvlc-wasm/vite';\nexport default { plugins: [vlc()] };\n");
  writeFileSync(join(app, 'index.html'), '<!doctype html><canvas width="320" height="240"></canvas><script type="module" src="/main.js"></script>\n');
  writeFileSync(join(app, 'main.js'), `import { createVLC } from 'libvlc-wasm';
import sout from 'libvlc-wasm-sout';
window.play = async () => {
  const vlc = await createVLC();
  const p = await vlc.createPlayer({ canvas: document.querySelector('canvas'), audio: false });
  await p.open('/t.wmv');
  await new Promise((r) => setTimeout(r, 1500));
  const n = p.renderer.framesDrawn;
  await vlc.destroy();
  return { isolated: crossOriginIsolated, version: vlc.version.version, frames: n };
};
window.convert = async () => {
  const vlc = await createVLC({ engine: sout });
  const input = new File([await (await fetch('/t.wmv')).blob()], 't.wmv');
  const out = await vlc.transcode(input, { to: 'mp4' });
  const info = await vlc.probe(out);
  await vlc.destroy();
  return { bytes: out.size, codecs: info.tracks.map((t) => t.codec.trim()).join('+') };
};
`);
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], app);
  run('npx', ['vite', 'build', '--logLevel', 'error'], app);
  const port = 5800 + Math.floor(Math.random() * 500);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('vite preview did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); ok(); } });
  });
  const browser = await launchMuted(engine);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.play);
  const played = await page.evaluate(() => window.play());
  const converted = await page.evaluate(() => window.convert());
  await browser.close();
  const ok = played.isolated && played.frames > 5 && converted.bytes > 1000 && /h264/.test(converted.codecs);
  console.log(`${ok ? 'PASS' : 'FAIL'}  packed ${core} + ${sout}, built with Vite: ` +
    `isolated=${played.isolated}, VLC ${played.version}, ${played.frames} frames; transcode → ${converted.bytes} B ${converted.codecs}`);
  console.log(`\n[${engine}] ${ok ? 1 : 0}/1 passed`);
  process.exitCode = ok ? 0 : 1;
} finally {
  server?.kill();
  rmSync(tmp, { recursive: true, force: true });
}
