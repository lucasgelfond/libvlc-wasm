# Examples

Every way to use libvlc-wasm, smallest first. All pages need cross-origin isolation;
the servers used below set it for you.

| example | shows | run |
|---|---|---|
| [`vanilla/element.html`](vanilla/element.html) | `<vlc-player>`: a drop-in for `<video>` with controls, in plain HTML | `node examples/vanilla/serve.mjs` |
| [`vanilla/minimal.html`](vanilla/minimal.html) | `createVLC()` → `createPlayer()` → `open(file)` in 20 lines | same |
| [`vanilla/inspector.html`](vanilla/inspector.html) | `probe()` and `thumbnail()`: tracks, codecs, metadata, a contact sheet, without playing | same |
| [`vanilla/power.html`](vanilla/power.html) | AB loop, frame stepping, marquee/logo overlays, crop, stereo modes, teletext, programs, gapless queue, snapshots | same |
| [`vanilla/audio.html`](vanilla/audio.html) | VLC's output as a node in your Web Audio graph; trackers, chiptunes, MIDI with a SoundFont; EQ | same |
| [`vanilla/wall.html`](vanilla/wall.html) | several players on one engine | same |
| [`vanilla/url.html`](vanilla/url.html) | playing an http(s) URL through range requests | same |
| [`svelte-player/`](svelte-player/) | a reusable Svelte `<VlcPlayer>` component and a playlist app with every option | `pnpm --filter svelte-player dev` |
| [`../apps/player/`](../apps/player/) | a polished minimal player on SvelteKit + shadcn-svelte | `pnpm --filter player dev` |
| [`node/probe.mjs`](node/probe.mjs) | headless probing and thumbnails under Node (`libvlc-wasm/node`) | `node examples/node/probe.mjs file.rm --thumbs=out` |

Frameworks: `<vlc-player>` is a standard custom element, so it works as-is in React
(`<vlc-player src={url} controls />`), Vue, Solid or Angular; for full control use the
`Player` API the way `svelte-player/src/lib/VlcPlayer.svelte` does.

Hosting where you cannot set headers (GitHub Pages): load
`libvlc-wasm/coi-serviceworker.js` first in `<head>`; it adds the isolation headers
from a service worker (one reload on the first visit).
