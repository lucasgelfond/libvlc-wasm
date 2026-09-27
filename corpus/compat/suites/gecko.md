# Firefox media mochitest files (dom/media/test): compatibility matrix

The clips Firefox's media stack is tested with: its <video>/<audio> mochitests, including deliberately broken, truncated, odd-channel and unusual-container files. Grouped by extension.

- Source: https://github.com/mozilla-firefox/firefox/tree/cdc95c93c91b09d3a4c38be355b5ef5bfd631075/dom/media/test (about: https://searchfox.org/mozilla-central/source/dom/media/test)
- Licence: MPL-2.0 test tree; clips under their own free licences
- Fetched: GitHub tree listing of dom/media/test at cdc95c93c91b09d3a4c38be355b5ef5bfd631075; raw.githubusercontent.com per file.
- Subset: every audio/video file, including crashtests/ and reftest/; left out: dash/ and hls/ (manifest + segment trees), bare .m4s fragments (MSE-only, no init segment) and ^headers^ files.

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=gecko`. Definition: `corpus/suites/gecko.json`.
Raw per-file results are in `suites/gecko-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`gecko-matrix.json`, `gecko-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 301**: the files that native FFmpeg **or** native VLC 3 plays, out of 362 media files (401 files
in all; 73 media files play in neither and are listed at the end, not counted). 12 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 287 (95%) | 301 |
| FFmpeg (ffmpeg version 9.0.2) | 292 (97%) | 301 |
| VLC 3.0.24 | 272 (90%) | 301 |
| Chromium native | 257 (85%) | 301 |
| WebKit native | 216 (72%) | 301 |
| Firefox native | 267 (89%) | 301 |

14 union files fail in libvlc-wasm; 2 of them play when retried with `:demux=avformat`,
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
| mp4 | 54 | 54 | 51 | 3 |
| webm | 45 | 45 | 44 | 1 |
| ogv | 4 | 4 | 3 | 1 |
| ogg | 23 | 21 | 20 | 1 |
| crashtests | 34 | 29 | 28 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 301 | 292 (97%) | 272 (90%) | 287 (95%) | 257 (85%) | 216 (72%) | 267 (89%) | 73 |
| 3gp | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| aac | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| browser | 0 | — | — | — | — | — | — | 1 |
| crashtests | 34 | 29 (85%) | 29 (85%) | 28 (82%) | 19 (56%) | 19 (56%) | 22 (65%) | 11 |
| flac | 4 | 4 (100%) | 2 (50%) | 4 (100%) | 3 (75%) | 3 (75%) | 3 (75%) | 0 |
| m4a | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| mkv | 21 | 21 (100%) | 21 (100%) | 21 (100%) | 19 (90%) | 5 (24%) | 18 (86%) | 0 |
| mp3 | 20 | 20 (100%) | 20 (100%) | 20 (100%) | 19 (95%) | 20 (100%) | 20 (100%) | 0 |
| mp4 | 54 | 54 (100%) | 47 (87%) | 51 (94%) | 46 (85%) | 41 (76%) | 48 (89%) | 56 |
| ogg | 23 | 21 (91%) | 19 (83%) | 20 (87%) | 18 (78%) | 22 (96%) | 22 (96%) | 0 |
| ogv | 4 | 4 (100%) | 3 (75%) | 3 (75%) | 1 (25%) | 0 (0%) | 1 (25%) | 0 |
| opus | 18 | 18 (100%) | 18 (100%) | 18 (100%) | 18 (100%) | 9 (50%) | 18 (100%) | 0 |
| reftest | 48 | 48 (100%) | 38 (79%) | 48 (100%) | 44 (92%) | 34 (71%) | 46 (96%) | 0 |
| wav | 25 | 25 (100%) | 25 (100%) | 25 (100%) | 24 (96%) | 25 (100%) | 24 (96%) | 0 |
| webm | 45 | 43 (96%) | 45 (100%) | 44 (98%) | 42 (93%) | 33 (73%) | 41 (91%) | 5 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (14)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### decoder produced no picture (buffer deadlock prevented) (5)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/black100x100-aspect3to2.ogv | ogg | theora |  | yes | yes | no | — | error: libvlc decoder: buffer deadlock prevented |
| suites/gecko/bug604067.webm |  |  |  | no | yes | no | — | error: libvlc decoder: this bitstream does not contain Vorbis audio data |
| suites/gecko/crashtests/1393272.webm | matroska,webm | vp8 |  | no | yes | no | — |  |
| suites/gecko/crashtests/1905231.webm | h263 | h263 |  | yes | yes | no | — | error: libvlc demux: No EBML header found |
| suites/gecko/spacestorm-1000Hz-100ms.ogg | ogg |  | vorbis | yes | no | no | — | error: libvlc demux: Unknown option "threads" |

### harness artifact? (audio played, below threshold) (3)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/ambisonics.mp4 | mov,mp4,m4a,3gp,3g2,mj2 |  | aac | yes | yes | no | — | warn: libvlc demux: elst box found |
| suites/gecko/beta-phrasebook.ogg | ogg |  | vorbis | yes | yes | no | — |  |
| suites/gecko/crashtests/1787281.mp4 | mov,mp4,m4a,3gp,3g2,mj2 |  | mp3 | yes | no | no | — | warn: [/cache/vlc/contrib/contrib-emscripten/mpg123/src/libmpg123/parse.c:wetwork():1403] error: not attempting to resync... |

### demuxer choice: plays with :demux=avformat (2)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/TestPatternHDR.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | yes | plays | — | warn: libvlc stream filter: unknown handler type tmcd in stsd |
| suites/gecko/bipbop-clearkey-keyrotation-clear-lead-video.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | no | plays | — | warn: [h264 @ 0x2019070] Error splitting the input into NAL units. |

### other / no clue in the log (2)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/crashtests/1835164.opus |  |  |  | yes | no | no | — | error: libvlc demux: Unknown option "threads" |
| suites/gecko/crashtests/vp9cake_corrupt.webm | matroska,webm |  | vorbis | yes | yes | no | — | error: libvlc demux: cannot load some cues/chapters/tags etc. (broken seekhead or file) |

### avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/crashtests/789075.webm | matroska,webm | vp8 |  | yes | no | no | — | warn: libvlc demux: cannot get block EOF? |

### timeout / hang (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gecko/dirac.ogg | ogg | dirac |  | yes | yes | no | — | page timeout |

## Unplayable by all (73, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **browser** (1): `browser/decode_error_vp9.webm`
- **crashtests** (11): `crashtests/0-timescale.mp4`, `crashtests/1180881.webm`, `crashtests/1530897.webm`, `crashtests/1835118.adts`, `crashtests/1840002.webm`, `crashtests/1859384.mp4`, `crashtests/1860840.mp4`, `crashtests/2035081.mp4`, `crashtests/255ch.wav`, `crashtests/adts-truncated.aac`, `crashtests/noextradata-8ch.wav`
- **mp4** (56): `bear-640x360-a_frag-cenc-key_rotation.mp4`, `bear-640x360-v_frag-cenc-key_rotation.mp4`, `big-buck-bunny-cenc-avc3-init.mp4`, `bipbop-cenc-audioinit.mp4`, `bipbop-cenc-video-10s.mp4`, `bipbop-cenc-videoinit.mp4`, `bipbop_225w_175kbps-cenc-audio-key1-init.mp4`, `bipbop_225w_175kbps-cenc-audio-key2-init.mp4`, `bipbop_225w_175kbps-cenc-video-key1-init.mp4`, `bipbop_225w_175kbps-cenc-video-key2-init.mp4`, `bipbop_300_215kbps-cenc-audio-key1-init.mp4`, `bipbop_300_215kbps-cenc-audio-key2-init.mp4`, `bipbop_300_215kbps-cenc-video-key1-init.mp4`, `bipbop_300_215kbps-cenc-video-key2-init.mp4`, `bipbop_300wp_227kbps-cenc-audio-key1-init.mp4`, `bipbop_300wp_227kbps-cenc-audio-key2-init.mp4`, `bipbop_300wp_227kbps-cenc-video-key1-init.mp4`, `bipbop_300wp_227kbps-cenc-video-key2-init.mp4`, `bipbop_360w_253kbps-cenc-audio-key1-init.mp4`, `bipbop_360w_253kbps-cenc-audio-key2-init.mp4`, `bipbop_360w_253kbps-cenc-video-key1-init.mp4`, `bipbop_360w_253kbps-cenc-video-key2-init.mp4`, `bipbop_480_624kbps-cenc-audio-key1-init.mp4`, `bipbop_480_624kbps-cenc-audio-key2-init.mp4`, `bipbop_480_624kbps-cenc-video-key1-init.mp4`, `bipbop_480_624kbps-cenc-video-key2-init.mp4`, `bipbop_480_959kbps-cenc-audio-key1-init.mp4`, `bipbop_480_959kbps-cenc-audio-key2-init.mp4`, `bipbop_480_959kbps-cenc-video-key1-init.mp4`, `bipbop_480_959kbps-cenc-video-key2-init.mp4`, `bipbop_480wp_1001kbps-cenc-audio-key1-init.mp4`, `bipbop_480wp_1001kbps-cenc-audio-key2-init.mp4`, `bipbop_480wp_1001kbps-cenc-video-key1-init.mp4`, `bipbop_480wp_1001kbps-cenc-video-key2-init.mp4`, `bipbop_480wp_663kbps-cenc-audio-key1-init.mp4`, `bipbop_480wp_663kbps-cenc-audio-key2-init.mp4`, `bipbop_480wp_663kbps-cenc-video-key1-init.mp4`, `bipbop_480wp_663kbps-cenc-video-key2-init.mp4`, `bipbop_cbcs_10_0_audio_init.mp4`, `bipbop_cbcs_10_0_video_init.mp4`, `bipbop_cbcs_1_9_audio_init.mp4`, `bipbop_cbcs_1_9_video_init.mp4`, `bipbop_cbcs_5_5_audio_init.mp4`, `bipbop_cbcs_5_5_video_init.mp4`, `bipbop_cbcs_7_7_audio_init.mp4`, `bipbop_cbcs_7_7_video_init.mp4`, `bipbop_cbcs_9_8_audio_init.mp4`, `bipbop_cbcs_9_8_video_init.mp4`, `flac-sample-cenc.mp4`, `sample-encrypted-sgpdstbl-sbgptraf.mp4`, `short-aac-encrypted-audio.mp4`, `short-audio-fragmented-cenc-without-pssh.mp4`, `short-cenc-pssh-in-moof.mp4`, `short-cenc.mp4`, `short-vp9-encrypted-video.mp4`, `tearsofsteel_1frame_encrypted.mp4`
- **webm** (5): `bipbop-clearkey-video-av1.webm`, `bipbop_360w_253kbps-clearkey-audio.webm`, `bipbop_360w_253kbps-clearkey-video-vp8.webm`, `bipbop_360w_253kbps-clearkey-video-vp9.webm`, `sintel-short-clearkey-subsample-encrypted-video.webm`
