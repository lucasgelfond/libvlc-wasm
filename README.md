# libvlc-wasm

libvlc-wasm compiles VLC 4's engine to WebAssembly and offers it as a JavaScript SDK. The package, in doing so, lets developers play media files that browsers [cannot handle natively](https://libvlc.lucasgelfond.online/formats). This includes some wacky stuff like playing DVD menus in the browser:

![A DVD's menus, clicked through in the browser](docs/demo.gif)

It handles a pretty baffling number of formats and is quite performant, making use of fast web technologies like WebGL for the video player and WebCodecs for native-speed decoding. It does not load whole videos into memory, but rather uses file seeks; memory use stays flat with large files. It's very fast; it can play native-codec supported files through at >600fps on my Mac, and even the slowest cases are several multiples better than realtime. It's also much more performant than simply transcoding something with ffmpeg.wasm and playing it in the browser.

## Comparisons to other work

libvlc-wasm exceeds native VLC 3 compatibility and is near parity with VLC 4. There's a full comparison between it, native VLC, other in-browser VLC and VLC-like libraries, and built-in browser support on the site, at [libvlc.lucasgelfond.online/formats](https://libvlc.lucasgelfond.online/formats).

You can also look at its pass rate on [a ton](https://libvlc.lucasgelfond.online/formats#test-suites) of test suites versus other similar packages, and how it performs against several speed benchmarks [here](https://libvlc.lucasgelfond.online/benchmarks).

There's some [prior](https://code.videolan.org/jbk/vlc.js) [art](https://github.com/addyosmani/vlc.js) [here](https://github.com/Krowemoh/vlc.js) but most efforts at "VLC in the browser" use an older, prebuilt WASM bundle. Inspired by [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm), which I co-maintain, libvlc-wasm includes the tooling to easily rebuild from source on top of VLC source code. This package also includes a pretty extensive testing harness that makes it easy to make changes or bump the source commit without lots of manual checks.

## A note on LLMs

I used LLMs, particularly Claude Opus 5.5, very heavily in development here. In essence: I pointed Claude at the libvlc source, a set of obscure-format files to test with, some reference implementations from the internet, and some existing C-library-to-WASM ports like [@uswriting/exiftool](https://github.com/6over3/exiftool), [neslinesli93/qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm), and [dlemstra/magick-wasm](https://github.com/dlemstra/magick-wasm). I steered a bunch throughout re what to include/leave out, how to implement patching / benchmarking / testing. I also built the demo interface, did manual QA, and wrote the words in this README and on the site.

In essence, this is to say: I am greatly indebted to the work that precedes this, particularly the existing libvlc source; little of this is truly "original." I think it remains valuable to publish packages like this because they are composable, reusable, and abstract complexity for other developers. For example, rather than spending a few days wrangling WASM, spending a ton of tokens, and wrangling Claude, other developers can just install the SDK. In any case though: this is very much glue work on top of [lots of phenomenal prior art](https://x.com/garrytan/status/1909255029372203090) (including other vlc.js-in-the-browser implementations).

[AGENTS.md](AGENTS.md) includes a much more verbose description of how the package was constructed, and also how to install / use its API.

### Using this package

```sh
npm install libvlc-wasm          # playback, probing, thumbnails
npm install libvlc-wasm-sout     # optional: transcoding, remuxing, recording
```

**HTML**: a drop-in for `<video>` ([examples/vanilla/element.html](examples/vanilla/element.html)):

```html
<script type="module">import 'libvlc-wasm/element';</script>
<vlc-player src="old-trailer.rm" controls autoplay></vlc-player>
```

**JS**: the full player API ([examples/vanilla/minimal.html](examples/vanilla/minimal.html)):

```js
import { createVLC } from 'libvlc-wasm';

const vlc = await createVLC();                     // one engine per page
const player = await vlc.createPlayer({ canvas }); // draws into a <canvas>
await player.open(fileInput.files[0]);             // File, Blob, bytes or URL
player.on('timeupdate', (t) => console.log(t, player.duration));

console.log(await vlc.probe(file));                // tracks and metadata, no playback
```

**React**: `<vlc-player>` is a standard custom element, so it works as-is; reach for the
`Player` through `el.player` when you need more:

```jsx
import 'libvlc-wasm/element';

export function Video({ src }) {
  return <vlc-player src={src} controls style={{ width: '100%', aspectRatio: '16 / 9' }} />;
}
```

**Svelte**: the same element, or the API in an effect
([apps/player/src/lib/session.svelte.ts](apps/player/src/lib/session.svelte.ts) is the whole demo site's player):

```svelte
<script>
  import { createVLC } from 'libvlc-wasm';
  let { file } = $props();
  let canvas;
  $effect(() => {
    let player;
    createVLC().then(async (vlc) => {
      player = await vlc.createPlayer({ canvas });
      await player.open(file);
    });
    return () => player?.destroy();
  });
</script>

<canvas bind:this={canvas}></canvas>
```

Note that in any case, pages must be cross-origin isolated so that they can use `SharedArrayBuffer`. Set these two headers on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **Vite / SvelteKit**: `import vlc from 'libvlc-wasm/vite'` and add `vlc()` to `plugins` (dev and preview).
- **Cloudflare / Netlify**: a `_headers` file, like [apps/player/static/_headers](apps/player/static/_headers).
- **Hosts without headers** (GitHub Pages): load `libvlc-wasm/coi-serviceworker.js` first in `<head>`.

The SDK's JavaScript is about 40 KB; the engine is one ~25 MB wasm (~8 MB brotli), fetched by the first `createVLC()`. `await import('libvlc-wasm')` keeps it off pages until it's needed.

## Building from source

The build fetches VLC, builds its dependencies (FFmpeg, dav1d, libass, etc). It takes about 20 minutes on my M5 MacBook Pro, probably an hour or so on a CI runner. It needs Docker.

```sh
./build.sh                    # toolchain image, VLC for wasm, link → packages/core/wasm/
./build.sh link               # relink only (a minute or two): after changing native/
PROFILE=debug ./build.sh      # assertions and symbols
VARIANT=sout ./build.sh       # the stream-output build (libvlc-sout.wasm), its own build tree
VLC_COMMIT=<sha> ./build.sh   # try another VLC master commit
WITH_DVDCSS=1 ./build.sh      # your own engine with libdvdcss → build/engines/dvdcss/
```

VLC's source is pinned in `build.sh`; changes to it live in [build/patches](build/patches), one `git format-patch` file per fix with a message saying why.

Passing the argument `WITH_DVDCSS=1` will bundle CSS-encrypted DVD processing into your binary. This is disabled in the default build because [distributing libdvdcss has questionable legal status](https://en.wikipedia.org/wiki/Libdvdcss). The engine it builds is never packaged or published; serve its two files yourself and load them with `createVLC({ engine: { moduleUrl, wasmUrl } })`.

## Testing / Benchmarking

**Test media.** Nothing large is in git; manifests, hashes and results are.

```sh
node corpus/fetch.mjs                     # the curated corpus (corpus/manifest.json), from its original hosts
rsync -a rsync://fate-suite.ffmpeg.org/fate-suite/ corpus/fate/   # FFmpeg's FATE suite (1.3 GB)
node corpus/suites/fetch.mjs <name>       # another suite (corpus/suites/<name>.json: libvpx, dav1d, wpt…)
node corpus/r2-sync.mjs pull              # or all of the above at once, from the project's R2 bucket
sh tests/make-fixtures.sh && sh tests/make-colors.sh   # generated fixtures (ffmpeg); DVD/Blu-ray ones via
                                                       # tests/make-dvd.sh, make-bluray*.sh (Docker)
```

**Tests.** Every browser the tests launch is muted.

```sh
pnpm install
pnpm test:quick   # ~2 min: node smoke, features + transcoding in Chromium, colours, the demo site
pnpm test         # ~15 min: Chrome, Safari and Firefox, the corpus baseline, npm tarballs, bundle sizes
```

Checking a VLC update or a native change, cheapest first: [.claude/skills/verify/SKILL.md](.claude/skills/verify/SKILL.md).

**Regenerating the numbers on the site.** Each script writes JSON the site renders:

```sh
node tests/verify-corpus.mjs --engines=chromium,webkit,firefox   # libvlc-wasm + browsers on the curated corpus
node corpus/compat/build.mjs                  # native VLC, native FFmpeg and ffmpeg.wasm on the corpus
node corpus/compat/suite.mjs --suite=fate     # a test suite with every tool (--suite=libvpx, wpt, …)
sh bench/make-media.sh && node bench/run.mjs  # decode speed, startup, size (needs FFmpeg and VLC.app)
node bench/compare/vlcjs.mjs --engine=webkit  # the other web VLC ports: vlcjs, jbk, krowemoh, webvlc.mjs,
node bench/compare/ports-matrix.mjs           # each per engine, then merged into ports × browsers
node bench/wasi/run.mjs                       # WebAssembly runtimes
pnpm dev                                      # then open /formats and /benchmarks
```

## License

A ton of the dependencies rely on the GPL. I love free software but also you should use this package however you want. **The code in this repository — the SDK, the patches, the build scripts, bridge, tests, benchmarks, player app — are all [licensed under MIT](LICENSE).**

The compiled engine / binary this ships, however, is based on libvlc which is LGPL-2.1+, and links to many GPL modules. As such, the whole binary is [GPL](COPYING).
