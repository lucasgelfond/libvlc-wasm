# libvpx VP8/VP9 decoder test vectors: compatibility matrix

The VP8 and VP9 conformance/decode test vectors libvpx runs in test/test_vectors.cc (vp80 = VP8; vp90 = VP9 profile 0; vp91/92/93 = profiles 1-3: 4:4:4, 10/12-bit). Each ships a .md5 with the MD5 of every decoded frame.

- Source: https://storage.googleapis.com/downloads.webmproject.org/test_data/libvpx/ (about: https://chromium.googlesource.com/webm/libvpx/+/refs/heads/main/test/test_vectors.cc)
- Licence: BSD-3-Clause (WebM project test data)
- Fetched: names from libvpx test/test_vectors.cc (main), sizes from the GCS bucket listing; every file downloaded from the bucket.
- Subset: all of them (small: about 30 MB).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=libvpx`. Definition: `corpus/suites/libvpx.json`.
Raw per-file results are in `suites/libvpx-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`libvpx-matrix.json`, `libvpx-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 372**: the files that native FFmpeg **or** native VLC 3 plays, out of 376 media files (376 files
in all; 4 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 371 (100%) | 372 |
| FFmpeg (ffmpeg version 9.0.2) | 372 (100%) | 372 |
| VLC 3.0.24 | 368 (99%) | 372 |
| Chromium native | 303 (81%) | 372 |
| WebKit native | 298 (80%) | 372 |
| Firefox native | 243 (65%) | 372 |

1 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
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
| vp90-2-13-largescaling | 1 | 1 | 0 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 372 | 372 (100%) | 368 (99%) | 371 (100%) | 303 (81%) | 298 (80%) | 243 (65%) | 4 |
| vp80-00-comprehensive | 18 | 18 (100%) | 18 (100%) | 18 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp80-01-intra | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp80-02-inter | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp80-03-segmentation | 18 | 18 (100%) | 18 (100%) | 18 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 4 |
| vp80-04-partitions | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp80-05-sharpness | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp80-06-smallsize | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-00-quantizer | 64 | 64 (100%) | 64 (100%) | 64 (100%) | 64 (100%) | 64 (100%) | 64 (100%) | 0 |
| vp90-2-01-sharpness | 7 | 7 (100%) | 7 (100%) | 7 (100%) | 7 (100%) | 7 (100%) | 7 (100%) | 0 |
| vp90-2-02-size | 71 | 71 (100%) | 71 (100%) | 71 (100%) | 71 (100%) | 71 (100%) | 11 (15%) | 0 |
| vp90-2-03-deltaq | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-03-size | 65 | 65 (100%) | 65 (100%) | 65 (100%) | 65 (100%) | 65 (100%) | 65 (100%) | 0 |
| vp90-2-05-resize | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-06-bilinear | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-07-frame | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-08-tile | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 0 |
| vp90-2-09-aq2 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-09-lf | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-09-subpixel | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-10-show | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| vp90-2-11-size | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 0 |
| vp90-2-12-droppable | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-13-largescaling | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-14-resize | 36 | 36 (100%) | 35 (97%) | 36 (100%) | 36 (100%) | 36 (100%) | 36 (100%) | 0 |
| vp90-2-15-segkey | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 1 (50%) | 2 (100%) | 0 |
| vp90-2-16-intra | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 |
| vp90-2-17-show | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp90-2-18-resize | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp90-2-19-skip | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 0 |
| vp90-2-20-big | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| vp90-2-21-resize | 24 | 24 (100%) | 24 (100%) | 24 (100%) | 24 (100%) | 24 (100%) | 24 (100%) | 0 |
| vp90-2-22-svc | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 1 (50%) | 1 (50%) | 1 (50%) | 0 |
| vp91-2-04-yuv422 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp91-2-04-yuv440 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp91-2-04-yuv444 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 |
| vp92-2-20-10bit | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp92-2-20-12bit | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp93-2-20-10bit | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 2 (67%) | 1 (33%) | 2 (67%) | 0 |
| vp93-2-20-12bit | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 2 (67%) | 1 (33%) | 2 (67%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (1)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/libvpx/vp90/vp90-2-13-largescaling.webm | matroska,webm | vp9 |  | yes | no | no | — | warn: libvlc demux: cannot get block EOF? |

## Unplayable by all (4, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **vp80-03-segmentation** (4): `vp80/vp80-03-segmentation-01.ivf`, `vp80/vp80-03-segmentation-02.ivf`, `vp80/vp80-03-segmentation-03.ivf`, `vp80/vp80-03-segmentation-04.ivf`
