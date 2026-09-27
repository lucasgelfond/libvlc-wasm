# HEVC/H.265 conformance bitstreams (JCT-VC): compatibility matrix

The ITU-T H.265.1 / JCT-VC conformance bitstreams (Main, Main 10, RExt, 4:2:2/4:4:4, tiles, WPP, SAO, PCM, scaling lists, ...), as FFmpeg's FATE suite carries them: raw Annex B .bit elementary streams.

- Source: https://fate-suite.ffmpeg.org/hevc-conformance/ (about: https://www.itu.int/wftp3/av-arch/jctvc-site/bitstream_exchange/draft_conformance/)
- Licence: ITU-T conformance material, redistributed in FATE for testing
- Derived from the FATE measurements (`fate-*.json`), folders `hevc-conformance`: nothing is re-measured.

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=hevc-conformance`. Definition: `corpus/suites/hevc-conformance.json`.
Rows and counts come from the FATE caches.


## Headline

**N = 186**: the files that native FFmpeg **or** native VLC 3 plays, out of 188 media files (188 files
in all; 2 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 167 (90%) | 186 |
| FFmpeg (ffmpeg version 9.0.2) | 186 (100%) | 186 |
| VLC 3.0.24 | 143 (77%) | 186 |
| Chromium native | 0 (0%) | 186 |
| WebKit native | 0 (0%) | 186 |
| Firefox native | 0 (0%) | 186 |

19 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
and 11 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

## How each column is measured

A file is **media** when `ffprobe` finds a video or audio stream (checksums, reference text and headerless raw dumps
are not). A tool **plays** a file when it has video and a picture came out, or it has audio and sound came out:

- **FFmpeg**: `ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -`; frames > 0 or samples > 0.
- **VLC 3** (VLC.app): headless, `--vout=stats --aout=afile` (to a WAV file), `--run-time=4`; a picture reached the vout ("VOUT got") or audio was written. Retried with `--codec=avcodec,none` when a video file shows nothing.
- **libvlc-wasm** (libvlc-wasm 4.0.0-dev Otto Chriek in Chromium, 2 s per file): `window.harness.playCase` in muted headless Chromium; video = a frame drawn with content (variance > 2 or > 1 distinct frame), audio = audible output (peak > 0.003, or any output when FFmpeg found the start near-silent). Same criteria as `tests/verify-corpus.mjs`. Each failure is retried once with `:demux=avformat`, and a raw elementary stream also with its ES demuxer (`:demux=h264`, `hevc`, `vc1`, `m4v`, `es`); those results are reported, not counted.
- **chromium / webkit / firefox**: the harness `nativeCheck`: `<video>`/`<audio>` reaches `loadeddata` within 4 s (muted).

Caveats: FATE is a decoder conformance suite, not a playback corpus. Many files are deliberately broken, truncated,
single-frame or headerless bitstreams, and a still image counts as media. "Plays" is only "something came out", not a bit-exact decode.
Native VLC 3 is run on the file as given, so it shares libvlc-wasm's blind spot for raw `.264`/`.bit`/`.jsv` streams
(it falls back to the MPEG-PS demuxer), and it cannot decode most still-image formats FFmpeg can.

## Where libvlc-wasm trails native

| folder | N | best of FFmpeg/VLC | libvlc-wasm | gap |
|---|--:|--:|--:|--:|
| hevc-conformance | 186 | 186 | 167 | 19 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 186 | 186 (100%) | 143 (77%) | 167 (90%) | 0 (0%) | 0 (0%) | 0 (0%) | 2 |
| hevc-conformance | 186 | 186 (100%) | 143 (77%) | 167 (90%) | 0 (0%) | 0 (0%) | 0 (0%) | 2 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (19)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### ES not detected: plays with :demux=<es> (11)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/hevc-conformance/CONFWIN_A_Sony_1.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/DBLK_A_SONY_3.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/DBLK_B_SONY_3.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/DBLK_C_SONY_3.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/DELTAQP_A_BRCM_4.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | warn: libvlc decoder: Fixing broken HDTV stream (display_height=1088) |
| fate/hevc-conformance/DELTAQP_B_SONY_3.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/DELTAQP_C_SONY_3.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/FILLER_A_Sony_1.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/INITQP_A_Sony_1.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/INITQP_B_Sony_1.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc-conformance/PPS_A_qualcomm_7.bit | hevc | hevc |  | yes | no | no | plays (`:demux=hevc`) | error: libvlc demux: Playback failure |

### decoder produced no picture (buffer deadlock prevented) (4)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/hevc-conformance/CIP_A_Panasonic_3.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/CIP_C_Panasonic_2.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/MAXBINS_C_TI_4.bit | hevc | hevc |  | yes | yes | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/SDH_A_Orange_3.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |

### avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (2)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/hevc-conformance/PICSIZE_A_Bossen_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | warn: [hevc @ 0x1eed990] thread_get_buffer() failed |
| fate/hevc-conformance/PICSIZE_B_Bossen_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | warn: [hevc @ 0x1d608d0] thread_get_buffer() failed |

### other / no clue in the log (2)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/hevc-conformance/VPSID_A_VIDYO_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) |  |
| fate/hevc-conformance/VPSID_A_VIDYO_2.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) |  |

## Unplayable by all (2, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **hevc-conformance** (2): `EXT_A_ericsson_3.bit`, `TSUNEQBD_A_MAIN10_Technicolor_2.bit`
