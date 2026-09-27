# IETF CELLAR FLAC decoder test files: compatibility matrix

The FLAC conformance files of the IETF CELLAR working group: subset/ (streamable-subset files every decoder must play), uncommon/ (legal but unusual: odd sample rates, bit depths, block sizes, channel counts), faulty/ (invalid; a decoder should reject or recover).

- Source: https://github.com/ietf-wg-cellar/flac-test-files/tree/aa7b0c6cf32994c106ae517a08134c28a96ff5b2 (about: https://github.com/ietf-wg-cellar/flac-test-files)
- Licence: CC0 / public domain (see LICENSE.txt in the repo)
- Fetched: GitHub tree listing at aa7b0c6cf32994c106ae517a08134c28a96ff5b2; raw.githubusercontent.com per file.
- Subset: all of them (about 310 MB).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=flac-test-files`. Definition: `corpus/suites/flac-test-files.json`.
Raw per-file results are in `suites/flac-test-files-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`flac-test-files-matrix.json`, `flac-test-files-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 82**: the files that native FFmpeg **or** native VLC 3 plays, out of 82 media files (86 files
in all; 2 media files play in neither and are listed at the end, not counted). 2 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 76 (93%) | 82 |
| FFmpeg (ffmpeg version 9.0.2) | 78 (95%) | 82 |
| VLC 3.0.24 | 78 (95%) | 82 |
| Chromium native | 75 (91%) | 82 |
| WebKit native | 70 (85%) | 82 |
| Firefox native | 77 (94%) | 82 |

6 union files fail in libvlc-wasm; 4 of them play when retried with `:demux=avformat`,
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
| subset | 64 | 64 | 61 | 3 |
| faulty | 7 | 6 | 5 | 1 |
| uncommon | 11 | 11 | 10 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 82 | 78 (95%) | 78 (95%) | 76 (93%) | 75 (91%) | 70 (85%) | 77 (94%) | 2 |
| faulty | 7 | 5 (71%) | 6 (86%) | 5 (71%) | 3 (43%) | 6 (86%) | 5 (71%) | 2 |
| subset | 64 | 62 (97%) | 64 (100%) | 61 (95%) | 64 (100%) | 57 (89%) | 64 (100%) | 0 |
| uncommon | 11 | 11 (100%) | 8 (73%) | 10 (91%) | 8 (73%) | 7 (64%) | 8 (73%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (6)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### demuxer choice: plays with :demux=avformat (4)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/flac-test-files/faulty/02 - wrong maximum framesize.flac | flac |  | flac | yes | yes | plays | — | warn: libvlc demux packetizer: discarding bytes as we're over framesize 654, 7662 |
| suites/flac-test-files/subset/49 - Extremely large PADDING.flac | flac |  | flac | yes | yes | plays | — |  |
| suites/flac-test-files/subset/52 - Extremely large APPLICATION.flac | flac |  | flac | yes | yes | plays | — |  |
| suites/flac-test-files/subset/55 - file 48-53 combined.flac | flac | mjpeg | flac | no | yes | plays | — |  |

### missing decoder (codec not in the wasm build) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/flac-test-files/faulty/09 - blocksize 1.flac |  |  |  | no | yes | no | — | error: libvlc decoder: cannot start codec (flac) |

### no demuxer accepted the file (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/flac-test-files/uncommon/11 - file starting with unparsable data.flac | flac |  | flac | yes | no | no | — | VLC could not play this media (see the log) \| error: libvlc demux: this doesn't look like a flac stream, continuing anyway |

## Unplayable by all (2, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **faulty** (2): `faulty/03 - wrong bit depth.flac`, `faulty/11 - incorrect metadata block length.flac`
