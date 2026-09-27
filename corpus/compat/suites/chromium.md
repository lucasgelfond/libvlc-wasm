# Chromium media test data (media/test/data): compatibility matrix

The files Chromium's media pipeline unit and browser tests decode: containers, codecs, raw elementary streams (h264/hevc/vvc/av1/ivf), odd sample rates, encrypted and broken files. Grouped by extension or subfolder.

- Source: https://github.com/chromium/chromium/tree/9ac9e1044de400849af3353f9a9c87a8df8df455/media/test/data (about: https://source.chromium.org/chromium/chromium/src/+/main:media/test/data/)
- Licence: BSD-3-Clause (Chromium); clips under their own free licences (see media/test/data/README.md)
- Fetched: GitHub tree listing of media/test/data (the chromium/chromium mirror) at 9ac9e1044de400849af3353f9a9c87a8df8df455; raw.githubusercontent.com per file.
- Subset: every audio/video file (images, YUV/raw frame dumps, JSON/HTML and manifests left out).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=chromium`. Definition: `corpus/suites/chromium.json`.
Raw per-file results are in `suites/chromium-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`chromium-matrix.json`, `chromium-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 322**: the files that native FFmpeg **or** native VLC 3 plays, out of 376 media files (386 files
in all; 55 media files play in neither and are listed at the end, not counted). 1 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 290 (90%) | 322 |
| FFmpeg (ffmpeg version 9.0.2) | 318 (99%) | 322 |
| VLC 3.0.24 | 250 (78%) | 322 |
| Chromium native | 206 (64%) | 322 |
| WebKit native | 197 (61%) | 322 |
| Firefox native | 211 (66%) | 322 |

32 union files fail in libvlc-wasm; 7 of them play when retried with `:demux=avformat`,
and 1 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

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
| vvc | 15 | 15 | 0 | 15 |
| wav | 16 | 16 | 13 | 3 |
| mp4 | 122 | 120 | 117 | 3 |
| hevc | 6 | 6 | 3 | 3 |
| ogg | 10 | 10 | 8 | 2 |
| m4a | 3 | 3 | 2 | 1 |
| ivf | 14 | 14 | 13 | 1 |
| mp3 | 14 | 14 | 13 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 322 | 318 (99%) | 250 (78%) | 290 (90%) | 206 (64%) | 197 (61%) | 211 (66%) | 55 |
| 3gp | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 |
| aac | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 4 (100%) | 4 (100%) | 4 (100%) | 0 |
| ac3 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| ac4 | 0 | — | — | — | — | — | — | 3 |
| adts | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 2 (67%) | 0 |
| avi | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| eac3 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| flac | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 1 |
| h264 | 8 | 8 (100%) | 5 (63%) | 8 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 9 |
| hevc | 6 | 6 (100%) | 3 (50%) | 3 (50%) | 0 (0%) | 0 (0%) | 0 (0%) | 9 |
| hls | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 4 (100%) | 0 (0%) | 1 |
| ivf | 14 | 13 (93%) | 14 (100%) | 13 (93%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| m4a | 3 | 3 (100%) | 1 (33%) | 2 (67%) | 2 (67%) | 3 (100%) | 3 (100%) | 0 |
| mkv | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 1 (50%) | 0 |
| mov | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 |
| mp2 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| mp3 | 14 | 14 (100%) | 14 (100%) | 13 (93%) | 12 (86%) | 14 (100%) | 12 (86%) | 0 |
| mp4 | 122 | 120 (98%) | 81 (66%) | 117 (96%) | 83 (68%) | 80 (66%) | 93 (76%) | 20 |
| ogg | 10 | 10 (100%) | 6 (60%) | 8 (80%) | 10 (100%) | 7 (70%) | 10 (100%) | 0 |
| ogv | 12 | 12 (100%) | 11 (92%) | 12 (100%) | 8 (67%) | 0 (0%) | 7 (58%) | 0 |
| opus | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| ts | 9 | 9 (100%) | 8 (89%) | 9 (100%) | 0 (0%) | 6 (67%) | 0 (0%) | 0 |
| vvc | 15 | 15 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wav | 16 | 16 (100%) | 15 (94%) | 13 (81%) | 15 (94%) | 16 (100%) | 16 (100%) | 0 |
| webm | 69 | 68 (99%) | 68 (99%) | 68 (99%) | 60 (87%) | 50 (72%) | 59 (86%) | 12 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (32)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### no picture (decoder opened, nothing out) (15)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/basketball_2_layers.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_15tiles_15slices.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_2_subpictures_8_slices.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_360p.vvc | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| suites/chromium/bbb_9tiles.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_9tiles_18slices.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_chroma_qp_offset_lists.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_poc_gop8.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_poc_msb.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_rpl_in_ph_nut.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_rpl_in_slice.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_scaling_lists.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bbb_slice_with_entrypoints.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/chromium/bear_180p.vvc | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| suites/chromium/vvc_frames_with_ltr.vvc | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |

### demuxer choice: plays with :demux=avformat (7)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/bear-640x360-v_frag-cenc-mdat.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | no | plays | — | warn: [h264 @ 0x11bceb0] number of reference frames (0+5) exceeds max (4; probably corrupt input), discarding one |
| suites/chromium/iamf_alternating_sine_waves_714.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 | opus | yes | yes | plays | — | warn: libvlc stream: unknown box type iacb (incompletely loaded) |
| suites/chromium/iamf_alternating_sine_waves_714_flac_96khz.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 | flac | yes | yes | plays | — | warn: libvlc stream: unknown box type iacb (incompletely loaded) |
| suites/chromium/iamf_alternating_sine_waves_stereo.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 | opus | yes | yes | plays | — | warn: libvlc stream: unknown box type iacb (incompletely loaded) |
| suites/chromium/iamf_alternating_sine_waves_stereo_flac_96khz.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 | flac | yes | yes | plays | — | warn: libvlc stream: unknown box type iacb (incompletely loaded) |
| suites/chromium/sfx_s16le.wav | wav |  | pcm_s16le | yes | yes | plays | — | warn: libvlc demux: unknown chunk 'LIST' of size: 46 |
| suites/chromium/sfx_s24le.wav | wav |  | pcm_s24le | yes | yes | plays | — | warn: libvlc demux: unknown chunk 'LIST' of size: 46 |

### decoder produced no picture (buffer deadlock prevented) (5)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/9ch.ogg | ogg |  | vorbis | yes | no | no | — | error: libvlc decoder: invalid number of channels (1-9): 9 |
| suites/chromium/bear-320x180-10bit-frame-0.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| suites/chromium/bear_3kHz.wav | wav |  | pcm_s16le | yes | no | no | — | error: libvlc decoder: buffer deadlock prevented |
| suites/chromium/blackwhite_yuv444p-frame.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| suites/chromium/double-sfx.ogg | ogg |  | vorbis | yes | no | no | — | error: libvlc decoder: buffer deadlock prevented |

### other / no clue in the log (3)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/sfx-opus-441.webm | matroska,webm |  | opus | yes | yes | no | — | warn: libvlc demux: cannot get block EOF? |
| suites/chromium/sfx.m4a | mov,mp4,m4a,3gp,3g2,mj2 |  | aac | yes | yes | no | — | warn: libvlc demux: elst box found |
| suites/chromium/sfx.mp3 | mp3 |  | mp3 | yes | yes | no | — |  |

### ES not detected: plays with :demux=<es> (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/bear-1280x720-hevc-10bit-hdr10.hevc | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |

### harness artifact? (frames drawn, flat picture) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/chromium/reference-frame-scaling-test.ivf | ivf | av1 |  | yes | yes | no | — | warn: libvlc demux: cannot open VMG info |

## Unplayable by all (55, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **ac4** (3): `ac4-ajoc.ac4`, `ac4-channel-based-coding.ac4`, `ac4-ims.ac4`
- **flac** (1): `negative_ts.flac`
- **h264** (9): `bear-320x180-10bit-frame-1.h264`, `bear-320x180-10bit-frame-2.h264`, `bear-320x180-10bit-frame-3.h264`, `bear-320x192-baseline-frame-1.h264`, `bear-320x192-baseline-frame-2.h264`, `bear-320x192-baseline-frame-3.h264`, `bear-320x192-high-frame-1.h264`, `bear-320x192-high-frame-2.h264`, `bear-320x192-high-frame-3.h264`
- **hevc** (9): `bear-320x180-10bit-frame-2.hevc`, `bear-320x180-10bit-frame-3.hevc`, `bear-frame0.hevc`, `bear-frame1.hevc`, `bear-frame2.hevc`, `bear-frame3.hevc`, `bear-frame4.hevc`, `bear-frame5.hevc`, `bear-sps-pps.hevc`
- **hls** (1): `hls/init_0.mp4`
- **mp4** (20): `ac4-only-ajoc-frag.mp4`, `ac4-only-channel-based-coding-frag.mp4`, `ac4-only-ims-frag.mp4`, `agtm-metadata-track-frag.mp4`, `bear-1280x720-a_frag-cenc-key_rotation.mp4`, `bear-1280x720-a_frag-cenc.mp4`, `bear-1280x720-a_frag-cenc_missing-saiz-saio.mp4`, `bear-1280x720-av_frag-initsegment-mvhd_version_0-mvhd_duration_bits_all_set.mp4`, `bear-1280x720-v_frag-cenc-key_rotation.mp4`, `bear-1280x720-v_frag-cenc.mp4`, `bear-640x360-a_frag-cbcs.mp4`, `bear-640x360-a_frag-cenc-key_rotation.mp4`, `bear-640x360-a_frag-cenc.mp4`, `bear-640x360-v_frag-cenc-key_rotation.mp4`, `bear-640x360-v_frag-cenc-senc-no-saiz-saio.mp4`, `bear-640x360-v_frag-cenc-senc.mp4`, `bear_dtsc.mp4`, `bear_dtse.mp4`, `bear_dtsx.mp4`, `vp9-hdr-init-segment.mp4`
- **webm** (12): `bear-320x240-16x9-aspect-av_enc-av.webm`, `bear-320x240-av_enc-av.webm`, `bear-320x240-v-vp9_fullsample_enc-v.webm`, `bear-320x240-v-vp9_profile2_subsample_cenc-v.webm`, `bear-320x240-v-vp9_subsample_enc-v.webm`, `bear-320x240-v_enc-v.webm`, `bear-640x360-av_enc-av.webm`, `bear-a_enc-a.webm`, `bear-av1-320x180-10bit-cenc.webm`, `bear-av1-cenc.webm`, `colour.webm`, `colour_unspecified_range.webm`
