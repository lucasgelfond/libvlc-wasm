// Dev server for tests/ and bench/: cross-origin isolated so SharedArrayBuffer works.
import { defineConfig } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Media under /corpus/media and /bench/media is served as bytes, with Range
// support, and never through Vite's transforms (it would otherwise compile an
// MPEG-TS `.ts` as TypeScript).
function rawMedia(mount) {
  const base = resolve(mount.slice(1));
  return {
    name: `raw-media:${mount}`,
    configureServer(server) {
      server.middlewares.use(mount, (req, res, next) => {
        const path = resolve(base, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
        if (!path.startsWith(base)) return next();
        let st;
        try { st = statSync(path); } catch { return next(); }
        if (!st.isFile()) return next();
        const headers = { ...ISOLATION, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream', 'Cross-Origin-Resource-Policy': 'same-origin' };
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
      });
    },
  };
}

// server.headers does not reach every response Vite sends (its injected worker
// client, for one). Chromium tolerates that; WebKit refuses to start a worker
// whose script lacks COEP. Stamp the headers on everything.
function isolateEverything() {
  return {
    name: 'isolate-everything',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [k, v] of Object.entries(ISOLATION)) res.setHeader(k, v);
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [isolateEverything(), rawMedia('/corpus/media'), rawMedia('/bench/media')],
  server: { port: 5199, headers: ISOLATION, fs: { allow: ['.'] } },
  optimizeDeps: { exclude: ['libvlc-wasm', '@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
});
