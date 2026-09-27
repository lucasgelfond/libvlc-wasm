import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// libvlc-wasm needs SharedArrayBuffer, so the page must be cross-origin isolated.
// Set the same two headers wherever you deploy (see the package README).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Vite's server.headers misses some responses (its worker client script);
// Safari will not start a worker without COEP on it, so set them everywhere.
// A block body on purpose: a hook that returns a function is run as a post-hook.
const stamp = (server) => {
  server.middlewares.use((_req, res, next) => {
    for (const [k, v] of Object.entries(isolation)) res.setHeader(k, v);
    next();
  });
};
const isolateEverything = { name: 'isolate-everything', configureServer: stamp, configurePreviewServer: stamp };

export default defineConfig({
  plugins: [isolateEverything, svelte()],
  server: { headers: isolation },
  preview: { headers: isolation },
  // Keep Vite's dependency optimiser away from the Emscripten output: it has
  // to stay next to libvlc.wasm and spawn itself as pthread workers.
  optimizeDeps: { exclude: ['libvlc-wasm'] },
  worker: { format: 'es' },
});
