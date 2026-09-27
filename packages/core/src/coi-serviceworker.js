// Cross-origin isolation for hosts that cannot set response headers
// (GitHub Pages, some CDNs). libvlc-wasm needs SharedArrayBuffer, which needs
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Embedder-Policy: require-corp (or credentialless)
// This file is both halves: loaded by the page as a classic <script>, it
// registers itself as a service worker and reloads once; running as that
// service worker, it re-serves every same-origin response with the headers.
//
//   <script src="coi-serviceworker.js"></script>   <!-- first thing in <head> -->
//
// Serve it from your site's root (a service worker only controls pages at or
// below its own path). Prefer real headers when you can: this costs one reload
// on the first visit.
/* eslint-disable no-restricted-globals */
if (typeof window === 'undefined') {
  // --- service worker --------------------------------------------------------
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    event.respondWith((async () => {
      const res = await fetch(req);
      if (res.status === 0) return res; // opaque: cannot be modified
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      // credentialless lets cross-origin images/media load without CORP headers.
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    })().catch(() => fetch(req)));
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && 'serviceWorker' in navigator) {
  // --- page --------------------------------------------------------------------
  const key = 'libvlc-wasm-coi-reloaded';
  navigator.serviceWorker.register(document.currentScript.src).then((reg) => {
    const reload = () => {
      // Only once: if isolation still fails (e.g. an extension strips headers),
      // do not loop.
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      location.reload();
    };
    if (reg.active && !navigator.serviceWorker.controller) reload();
    else reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', (e) => { if (e.target.state === 'activated') reload(); });
    });
  }).catch((e) => console.warn('libvlc-wasm: could not register the isolation service worker', e));
} else if (window.crossOriginIsolated) {
  try { sessionStorage.removeItem('libvlc-wasm-coi-reloaded'); } catch { /* storage blocked */ }
}
