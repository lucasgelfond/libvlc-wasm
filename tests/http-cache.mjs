// An http(s) source must not keep what it has read: plays a ~160 MB file
// through a range server and checks the engine worker's memory stays flat
// (issue #1: Emscripten's lazy files kept every chunk ever fetched).
//   node tests/http-cache.mjs
// Makes its media with ffmpeg into tests/out/ on the first run. Chromium only:
// worker memory is read over CDP.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import { startServer, openHarness, root } from './lib/browser.mjs';

const MiB = 2 ** 20;
const file = `${root}/tests/out/http-cache.mpg`;
if (!existsSync(file)) {
  mkdirSync(`${root}/tests/out`, { recursive: true });
  // Noise, so the stream is incompressible: 80 s of 16 Mbit/s MPEG-2.
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25,noise=alls=60:allf=t',
    '-t', '80', '-c:v', 'mpeg2video', '-b:v', '16M', '-maxrate', '16M', '-bufsize', '4M', '-an', '-f', 'vob', file]);
}
const size = statSync(file).size;

// A plain range server on its own origin, as in the issue: Vite's HEAD
// response has no Accept-Ranges, which would make Emscripten fetch the file whole.
let fetched = 0;
const media = http.createServer((req, res) => {
  const h = {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Accept-Ranges, Content-Range',
    'Cross-Origin-Resource-Policy': 'cross-origin', 'Accept-Ranges': 'bytes',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  if (req.method === 'HEAD') { res.writeHead(200, { ...h, 'Content-Length': size }); return res.end(); }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const a = m ? +m[1] : 0, b = m && m[2] ? +m[2] : size - 1;
  fetched += b - a + 1;
  res.writeHead(m ? 206 : 200, { ...h, 'Content-Length': b - a + 1, ...(m ? { 'Content-Range': `bytes ${a}-${b}/${size}` } : {}) });
  createReadStream(file, { start: a, end: b }).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => media.once('listening', r));
const mediaUrl = `http://127.0.0.1:${media.address().port}/http-cache.mpg`;

const { server, url } = await startServer();
const { browser, page } = await openHarness(url, 'chromium');

// JS heap + ArrayBuffer backing stores of the page's dedicated workers; the
// engine worker is the largest and holds the lazy-file chunks.
const cdp = await page.context().newCDPSession(page);
const workers = new Set();
const pending = new Map();
let seq = 0;
cdp.on('Target.attachedToTarget', (e) => { if (e.targetInfo.type === 'worker') workers.add(e.sessionId); });
cdp.on('Target.receivedMessageFromTarget', (e) => { const m = JSON.parse(e.message); pending.get(m.id)?.(m.result); });
await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
const inWorker = (sessionId, method) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params: {} }) })
    .catch(() => resolve(null));
  setTimeout(() => resolve(null), 3000);
});
// After a forced GC, so dropped chunks not yet collected do not count.
async function workerMemory() {
  let max = 0;
  for (const s of workers) {
    await inWorker(s, 'HeapProfiler.collectGarbage');
    const u = await inWorker(s, 'Runtime.getHeapUsage');
    if (u) max = Math.max(max, u.usedSize + (u.backingStorageSize ?? 0));
  }
  return max;
}

const CACHE = 16 * MiB;
const samples = [];
const sampler = setInterval(async () => samples.push([fetched, await workerMemory()]), 1000);
let ok = false, detail;
try {
  const r = await page.evaluate(async ([src, httpCache]) => {
    const { createVLC } = window.harness;
    const vlc = await createVLC({ httpCache, threads: 8 });
    const p = await vlc.createPlayer({ canvas: document.getElementById('c'), audio: false });
    const ended = p.once('ended');
    await p.open(src);
    p.rate = 8;
    const done = await Promise.race([ended.then(() => true), new Promise((r) => setTimeout(() => r(false), 90000))]);
    const t = p.currentTime;
    await vlc.destroy();
    return { done, t };
  }, [mediaUrl, CACHE]);
  clearInterval(sampler);
  samples.push([fetched, await workerMemory()]);
  // Growth from the first sample taken after 2 cache-fulls were read: a
  // cache that keeps everything grows with every MiB after that.
  const start = samples.find(([f, w]) => f > 2 * CACHE && w > 0);
  const peak = Math.max(...samples.map(([, w]) => w));
  const growth = start ? peak - start[1] : NaN;
  const read = fetched - (start?.[0] ?? 0);
  ok = r.done && fetched > 0.9 * size && growth < 0.25 * read;
  detail = `read ${(fetched / MiB).toFixed(0)} of ${(size / MiB).toFixed(0)} MiB${r.done ? '' : ` (stopped at ${r.t.toFixed(1)} s)`}; ` +
    `worker memory ${(start?.[1] / MiB).toFixed(0)} → peak ${(peak / MiB).toFixed(0)} MiB ` +
    `(+${(growth / MiB).toFixed(0)} MiB while ${(read / MiB).toFixed(0)} MiB more were read; limit ${(0.25 * read / MiB).toFixed(0)})`;
  console.log(`timeline (MiB read → MiB held): ${samples.filter(([, w]) => w).map(([f, w]) => `${(f / MiB).toFixed(0)}→${(w / MiB).toFixed(0)}`).join('  ')}`);
} catch (e) {
  detail = String(e?.message ?? e);
} finally {
  clearInterval(sampler);
  await browser.close();
  await server.close();
  media.close();
}
console.log(`${ok ? 'PASS' : 'FAIL'}  http(s) source memory stays flat with httpCache 16 MiB  ${detail}`);
console.log(`\n[chromium] ${ok ? 1 : 0}/1 passed`);
process.exitCode = ok ? 0 : 1;
