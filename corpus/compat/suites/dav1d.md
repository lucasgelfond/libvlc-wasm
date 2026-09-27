# dav1d test data (AV1): compatibility matrix

The AV1 bitstreams dav1d decodes in its test suite (8/10/12-bit: conformance data, features, film grain, quantizer and size sweeps, resize, S-frames, SVC, issue repros), with the MD5 of the decoded output from meson.build where given.

- Source: https://code.videolan.org/videolan/dav1d-test-data/-/tree/61afa1ceb6029be1a8ea3f6b9c9a9672700f13bb (about: https://code.videolan.org/videolan/dav1d-test-data)
- Licence: BSD-2-Clause (dav1d test data; some streams from the AOM test vectors)
- Fetched: GitLab archive tarballs of 8-bit/, 10-bit/, 12-bit/, multi-bit/ from master (then 61afa1ceb6029be1a8ea3f6b9c9a9672700f13bb), extracted into corpus/suites/dav1d/.
- Subset: everything except oss-fuzz/ (sanitizer crash repros, not playable media) and the argon/ entries (pointers into the separately licensed Argon suite).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=dav1d`. Definition: `corpus/suites/dav1d.json`.
Raw per-file results are in `suites/dav1d-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`dav1d-matrix.json`, `dav1d-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 754**: the files that native FFmpeg **or** native VLC 3 plays, out of 754 media files (776 files
in all; 0 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 754 (100%) | 754 |
| FFmpeg (ffmpeg version 9.0.2) | 738 (98%) | 754 |
| VLC 3.0.24 | 753 (100%) | 754 |
| Chromium native | 0 (0%) | 754 |
| WebKit native | 0 (0%) | 754 |
| Firefox native | 0 (0%) | 754 |

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
| **all** | 754 | 738 (98%) | 753 (100%) | 754 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 10-bit/data | 71 | 71 (100%) | 71 (100%) | 71 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 10-bit/features | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 10-bit/film_grain | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 10-bit/issues | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 10-bit/quantizer | 64 | 64 (100%) | 64 (100%) | 64 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 12-bit/data | 46 | 46 (100%) | 46 (100%) | 46 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 12-bit/features | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/cdfupdate | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/data | 336 | 336 (100%) | 336 (100%) | 336 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/features | 10 | 10 (100%) | 9 (90%) | 10 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/film_grain | 7 | 7 (100%) | 7 (100%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/intra | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/issues | 16 | 16 (100%) | 16 (100%) | 16 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/mfmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/mv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/quantizer | 64 | 64 (100%) | 64 (100%) | 64 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/resize | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/sframe | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/size | 100 | 100 (100%) | 100 (100%) | 100 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/svc | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8-bit/vq_suite | 20 | 4 (20%) | 20 (100%) | 20 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (0)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

## Unplayable by all (0, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

