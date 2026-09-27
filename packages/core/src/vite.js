// A Vite plugin that makes the dev and preview servers cross-origin isolated,
// which libvlc-wasm needs (SharedArrayBuffer):
//   import coi from 'libvlc-wasm/vite';
//   export default defineConfig({ plugins: [coi()] });
// It sets the headers on every response through a middleware: Vite's
// server.headers/preview.headers options miss some (worker chunks among them),
// and Safari then refuses those workers. Production hosting needs the same two
// headers from your server or CDN.
const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default function crossOriginIsolation() {
  const stamp = (server) => {
    server.middlewares.use((_req, res, next) => {
      for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
      next();
    });
  };
  return {
    name: 'libvlc-wasm:cross-origin-isolation',
    configureServer: stamp,
    configurePreviewServer: stamp,
    // Keep the dependency optimiser away from the engine: its loader has to
    // stay next to its .wasm and start its own threads.
    config: () => ({ optimizeDeps: { exclude: ['libvlc-wasm', 'libvlc-wasm-sout'] }, worker: { format: 'es' } }),
  };
}
