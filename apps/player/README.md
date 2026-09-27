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
