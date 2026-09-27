# Format compatibility matrix

`compat.json` says, for each of the corpus's files, whether each tool can decode it. It feeds the
player app's "What can it play?" page (`apps/player/src/routes/formats`).

| column | how it is measured |
|---|---|
| `libvlcWasm` | copied from `corpus/results/results.json` (`tests/verify-corpus.mjs`: picture and sound checked in a real browser) |
| `browsers` | same report: whether Chrome, Safari (WebKit) and Firefox play the file with `<video>`/`<audio>` |
| `nativeVlc` | VLC 3.0.24 for macOS, headless: video to its statistics output, audio to a WAV file (`afile`), first 10 s |
| `ffmpeg` | native FFmpeg decoding to the null muxer, first 10 s |
| `ffmpegWasm` | ffmpeg.wasm 0.12 (`@ffmpeg/core`, FFmpeg 5.1) doing the same in Chromium |
| `vlcjs` | copied from `bench/compare/vlcjs-results.json`: addyosmani/vlc.js showed video (video samples only) |

`plain-english.json` (next to the manifest) holds a one-line description of each file.

```sh
node corpus/compat/build.mjs                 # measure everything (a few minutes), write compat.json
node corpus/compat/build.mjs --measure=none  # re-merge after tests/verify-corpus.mjs or the vlc.js run
node corpus/compat/build.mjs --measure=vlc --ids=a,b   # re-measure one tool for some files
```

Raw measurements are kept in `measurements.json`, so a merge never re-runs the tools. Nothing
here plays sound.

Caveats: "decodes" is not "plays well" — the native columns count decoded frames and samples,
while libvlc-wasm's is checked on screen and in the audio output. Several corpus files are
deliberately short or truncated test fixtures (see each sample's `test` note in the manifest), and
ffmpeg.wasm can only convert a file, not play it. `unplayable.md` records why the files that
play nowhere do not.
