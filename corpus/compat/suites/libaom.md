# libaom AV1 decoder test vectors: compatibility matrix

The AV1 decode test vectors libaom runs (av1-1-b8-* 8-bit and av1-1-b10-* 10-bit: sizes, quantizers, intra-only, film grain, SVC, annexb/section5 OBU streams), each with a .md5 of the decoded output.

- Source: https://storage.googleapis.com/aom-test-data/ (about: https://aomedia.googlesource.com/aom/+/refs/heads/main/test/test_vectors.cc)
- Licence: BSD-2-Clause + AOM patent license (AOMedia test data)
- Fetched: the aom-test-data GCS bucket listing, filtered to av1-1-b8-*/av1-1-b10-* bitstreams and their .md5.
- Subset: all AV1 decode vectors (about 7 MB); skipped: raw YUV/Y4M encoder inputs (~3.8 GB), fuzzer seed corpora and the invalid-* crash repros. The Argon conformance suite (AOM CWG) is not included: it is ~10 GB of streams behind a separate licence.

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=libaom`. Definition: `corpus/suites/libaom.json`.
Raw per-file results are in `suites/libaom-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`libaom-matrix.json`, `libaom-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 244**: the files that native FFmpeg **or** native VLC 3 plays, out of 244 media files (244 files
in all; 0 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 244 (100%) | 244 |
| FFmpeg (ffmpeg version 9.0.2) | 244 (100%) | 244 |
| VLC 3.0.24 | 244 (100%) | 244 |
| Chromium native | 2 (1%) | 244 |
| WebKit native | 2 (1%) | 244 |
| Firefox native | 2 (1%) | 244 |

0 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
and 0 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

## How each column is measured

A file is **media** when `ffprobe` finds a video or audio stream (checksums, reference text and headerless raw dumps
are not). A tool **plays** a file when it has video and a picture came out, or it has audio and sound came out:

- **FFmpeg**: `ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -`; frames > 0 or samples > 0.
- **VLC 3** (VLC.app): headless, `--vout=stats --aout=afile` (to a WAV file), `--run-time=4`; a picture reached the vout ("VOUT got") or audio was written. Retried with `--codec=avcodec,none` when a video file shows nothing.
- **libvlc-wasm** (libvlc-wasm 4.0.0-dev Otto Chriek in Chromium, 2 s per file): `window.harness.playCase` in muted headless Chromium; video = a frame drawn with content (variance > 2 or > 1 distinct frame), audio = audible output (peak > 0.003, or any output when FFmpeg found the start near-silent). Same criteria as `tests/verify-corpus.mjs`. Each failure is retried once with `:demux=avformat`, and a raw elementary stream also with its ES demuxer (`:demux=h264`, `hevc`, `vc1`, `m4v`, `es`); those results are reported, not counted.
- **chromium / webkit / firefox**: the harness `nativeCheck`: `<video>`/`<audio>` reaches `loadeddata` within 4 s (muted).

Caveats: many suite files are deliberately broken, truncated,
single-frame or headerless bitstreams, and a still image counts as media. "Plays" is only "something came out", not a bit-exact decode.
Native VLC 3 is run on the file as given, so it shares libvlc-wasm's blind spot for raw `.264`/`.bit`/`.jsv` streams
(it falls back to the MPEG-PS demuxer), and it cannot decode most still-image formats FFmpeg can.

## Where libvlc-wasm trails native

| folder | N | best of FFmpeg/VLC | libvlc-wasm | gap |
|---|--:|--:|--:|--:|

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 244 | 244 (100%) | 244 (100%) | 244 (100%) | 2 (1%) | 2 (1%) | 2 (1%) | 0 |
| av1-1-b10-00-quantizer | 64 | 64 (100%) | 64 (100%) | 64 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b10-23-film | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b10-24-monochrome | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-00-quantizer | 64 | 64 (100%) | 64 (100%) | 64 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-01-size | 100 | 100 (100%) | 100 (100%) | 100 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-02-allintra | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-03-sizedown | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| av1-1-b8-03-sizeup | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| av1-1-b8-04-cdfupdate | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-05-mv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-06-mfmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-16-intra | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-22-svc | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-23-film | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-1-b8-24-monochrome | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (0)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

## Unplayable by all (0, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

