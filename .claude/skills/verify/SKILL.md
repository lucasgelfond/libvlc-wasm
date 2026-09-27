---
name: verify
description: Check that libvlc-wasm still plays everything after a change — a VLC update (new VLC_COMMIT), a patch in build/patches, a change to native/*.c or the SDK. Runs the test suites cheapest-first, drives the player site in a muted browser, and compares format coverage (curated corpus and FFmpeg's FATE suite) against the committed baselines. Use when asked to "verify", "check nothing broke", or "update VLC".
---

# Verify libvlc-wasm

Work cheapest-first and stop at the first real failure: a broken build makes every later
step noise. **Never play sound**: every browser goes through `tests/lib/browser.mjs`
(`launchMuted` / `openHarness`), and nothing may open speakers.

## 0. What changed decides where to start

| change | rebuild | then run |
|---|---|---|
| `packages/core/src`, `apps/player` only | nothing | step 2 (quick), then 3 |
| `native/*.c` | `./build.sh link` and `VARIANT=sout ./build.sh link` | step 2 onwards |
| `build/patches`, `build/build-vlc.sh`, contrib flags | `./build.sh vlc && ./build.sh link` (and `VARIANT=sout`) | everything |
| a new VLC commit | step 1 first | everything |

The link step moves the new wasm into place last, but a page that loads mid-link can still
fail with `Import #0 "env"`: don't run tests while a link runs.

## 1. Updating VLC (new `VLC_COMMIT`)

1. Pick the commit: `git ls-remote https://code.videolan.org/videolan/vlc.git master`.
2. Check every patch still applies before spending an hour on contribs:
   ```sh
   docker run --rm -v "$PWD":/work -v libvlc-wasm-cache:/cache libvlc-wasm-build:latest sh -c '
     git config --global --add safe.directory "*"; cd /cache/vlc &&
     git fetch -q --depth 1 origin <sha> && git worktree add -q -f /tmp/new <sha> && cd /tmp/new &&
     for p in /work/build/patches/*.patch; do git apply --check "$p" && echo "ok $p" || echo "FAIL $p"; done'
   ```
   - A patch that fails: check whether upstream fixed the same bug (then delete the patch
     and renumber) or moved the code (rebase it: apply with `git apply -3`, fix, then
     regenerate it with `git format-patch` keeping the subject and message).
3. Update `VLC_COMMIT` in `build.sh` (and its date comment), then `CLEAN=1 ./build.sh`
   and `CLEAN=1 VARIANT=sout ./build.sh`. Contribs rebuild only when their rules change.
4. Before relinking, keep the old module list: `cp packages/core/wasm/libvlc.modules.c /tmp/before.c`
   (build output is not in git). After, watch the link log for `undefined symbol` (a
   contrib wanting a libc function goes in `native/compat.c`) and
   `diff /tmp/before.c packages/core/wasm/libvlc.modules.c` for modules that vanished.
5. Headers that changed under `native/`: `native/shared.h` has static asserts for every
   index JS hardcodes, so a layout drift fails the build instead of the page.

## 2. Test suites

```sh
pnpm test:quick     # ~2 min: node smoke, features + sout in Chromium, colours, the app end to end
pnpm test           # ~10 min: also WebKit and Firefox, the corpus baseline, the packed npm tarballs
pnpm test -- --only=features,sout --engines=webkit    # one suite, one engine
```

Fixtures first on a fresh machine: `sh tests/make-fixtures.sh`, `sh tests/make-colors.sh`,
`node corpus/fetch.mjs`; the DVD and Blu-ray images need Docker (see the headers of
`tests/make-dvd.sh` and `tests/make-bluray.sh`).

Reading failures:
- **Firefox timing tests** (AB loop, seek, chapters) can flake when the machine is loaded:
  rerun that suite alone before believing it.
- **corpus**: `tests/corpus-baseline.json` lists samples that must play. `FAIL` lines name
  them with their checks; `NEW` lines are samples that started playing — raise the
  baseline with `node tests/corpus-check.mjs --update-baseline` and commit it.
- **package**: packs both tarballs into a fresh Vite app; a failure here usually means a
  file missing from a package's `files`, or the worker/engine URL resolution.

## 3. Drive the site like a visitor

`node tests/app.mjs` covers the start screen, the sample menu (the DVD's menus, by mouse),
`?sample=` links, a picked file and the formats page. For anything visual it cannot
assert, take screenshots with Playwright through `launchMuted` and look at them:

```js
import { launchMuted } from './tests/lib/browser.mjs';
const b = await launchMuted('chromium');
const p = await b.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
await p.goto('http://127.0.0.1:5180/?sample=dvd');   // pnpm dev serves the site on 5180
await p.waitForFunction(() => window.session?.ready && window.session.state === 'playing');
await p.screenshot({ path: 'shot.png' });
```

`window.session` (dev builds only) exposes the app state: `state`, `time`, `duration`,
`tracks`, `inMenu`, `player.renderer.framesDrawn`, `loaded`. Check at least: a DVD menu
renders and a click plays, subtitles show over the picture, the seek bar moves smoothly
(sample `player.currentTime` every animation frame: it must not step backwards).

## 4. Format coverage (FFmpeg FATE suite)

Slow (tens of minutes), so only for VLC updates or decoder/demuxer changes. Needs
`corpus/fate/` (rsync from `rsync://fate-suite.ffmpeg.org/fate-suite/`, 1.3 GB, ignored).

```sh
cp corpus/compat/fate-summary.json /tmp/fate-before.json
node corpus/compat/fate.mjs --tool=wasm,summary --resume --retry=.   # re-measure every file, libvlc-wasm only
```

Compare `corpus/compat/fate-summary.json` with the copy: the overall `wasm` count must not
drop, and no folder may lose files. `corpus/compat/FATE.md` lists every failing file with
its cause and log. Native FFmpeg/VLC columns only need re-measuring when those tools change
(`--tool=ffmpeg,vlc`).

## 5. Report

Say what was rebuilt, each suite's tally, the FATE totals before → after, and every
failure with its cause — or why it is a known flake. Commit updated baselines separately
from code changes.
