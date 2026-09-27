#!/usr/bin/env node
// A zero-dependency static server for the vanilla examples. The two headers are
// the only thing libvlc-wasm needs from a host: they make the page
// cross-origin isolated, which is what unlocks SharedArrayBuffer (threads).
//   node examples/vanilla/serve.mjs      then open http://localhost:8080/examples/vanilla/
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = +(process.env.PORT ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.sf2': 'application/octet-stream', '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  let st;
  try {
    st = statSync(path);
    if (st.isDirectory()) { path = join(path, 'index.html'); st = statSync(path); }
  } catch { res.writeHead(404).end('not found'); return; }

  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (m) {
    const start = m[1] ? +m[1] : st.size - +m[2];
    const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    createReadStream(path).pipe(res);
  }
}).listen(port, () => console.log(`http://localhost:${port}/examples/vanilla/`));
