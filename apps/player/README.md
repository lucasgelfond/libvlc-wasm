# Player

A minimal VLC-in-the-browser player built on `libvlc-wasm`, SvelteKit and
shadcn-svelte: drop a file and it plays, with speed, subtitles (tracks, external
files, delay), audio track, equalizer, aspect ratio and deinterlacing in one
settings menu, plus volume, seeking, snapshots, fullscreen and keyboard shortcuts.

```sh
pnpm install
pnpm --filter player dev        # http://localhost:5173
pnpm --filter player build      # static site in apps/player/build
```

Deploy `build/` anywhere that can send the two cross-origin isolation headers
(`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy:
require-corp`); `vite.config.ts` sets them for dev and preview. Append
`?webcodecs=0` to the URL to force software decoding.

- `src/lib/session.svelte.ts` — a reactive wrapper over one libvlc-wasm Player
- `src/routes/+page.svelte` — the page: drop zone, stage, control bar
- `src/lib/components/SettingsMenu.svelte` — the settings popover

## Deploying (libvlc.lucasgelfond.online)

The site is a static build (`adapter-static`) served by Cloudflare as Worker static
assets; `wrangler.jsonc` is the whole configuration.

```sh
pnpm --filter player build          # also copies the samples (scripts/samples.mjs)
cd apps/player && npx wrangler deploy
```

Then attach the custom domain `libvlc.lucasgelfond.online` to the `libvlc-wasm-site`
Worker (Settings > Domains & Routes); the zone is already on Cloudflare.

- `static/_headers` sets COOP/COEP on every response. Without them there is no
  `SharedArrayBuffer`, and VLC cannot start.
- Cloudflare serves at most 25 MiB per file. The core `libvlc.wasm` is linked without
  function names to fit (about 24.5 MiB); the transcoding engine (35 MB) is not part of
  the site. If the wasm outgrows the limit, serve it from R2 or a CDN and pass
  `createVLC({ wasmUrl })`, with `Cross-Origin-Resource-Policy: cross-origin` on it.
- To deploy from CI, add a `CLOUDFLARE_API_TOKEN` secret (Workers Scripts: Edit) and run
  the two commands above after the build job.
