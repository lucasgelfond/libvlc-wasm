# FFmpeg FATE suite + curated corpus: compatibility matrix

Generated 2026-09-27 by `node corpus/compat/fate.mjs` (`pnpm fate`). Raw per-file results are in
`fate-inventory.json`, `fate-ffmpeg.json`, `fate-vlc.json`, `fate-wasm.json` and `fate-native.json` (keyed by path under
`corpus/`); `fate-matrix.json`, `fate-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 2183**: the files that native FFmpeg **or** native VLC 3 plays, out of 2219 media files (2629 files
in all; 45 media files play in neither and are listed at the end, not counted). 9 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 2041 (93%) | 2183 |
| FFmpeg (ffmpeg version 9.0.2) | 2172 (99%) | 2183 |
| VLC 3.0.24 | 1535 (70%) | 2183 |
| Chromium native | 518 (24%) | 2183 |
| WebKit native | 546 (25%) | 2183 |
| Firefox native | 422 (19%) | 2183 |

142 union files fail in libvlc-wasm; 11 of them play when retried with `:demux=avformat`,
and 18 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

## How each column is measured

A file is **media** when `ffprobe` finds a video or audio stream (checksums, reference text and headerless raw dumps
are not). A tool **plays** a file when it has video and a picture came out, or it has audio and sound came out:

- **FFmpeg**: `ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -`; frames > 0 or samples > 0.
- **VLC 3** (VLC.app): headless, `--vout=stats --aout=afile` (to a WAV file), `--run-time=4`; a picture reached the vout ("VOUT got") or audio was written. Retried with `--codec=avcodec,none` when a video file shows nothing.
- **libvlc-wasm** (libvlc-wasm 4.0.0-dev Otto Chriek in Chromium, 2 s per file): `window.harness.playCase` in muted headless Chromium; video = a frame drawn with content (variance > 2 or > 1 distinct frame), audio = audible output (peak > 0.003, or any output when FFmpeg found the start near-silent). Same criteria as `tests/verify-corpus.mjs`. Each failure is retried once with `:demux=avformat`, and a raw elementary stream also with its ES demuxer (`:demux=h264`, `hevc`, `vc1`, `m4v`, `es`); those results are reported, not counted.
- **chromium / webkit / firefox**: the harness `nativeCheck`: `<video>`/`<audio>` reaches `loadeddata` within 4 s (muted).

Caveats: FATE is a decoder conformance suite, not a playback corpus. Many files are deliberately broken, truncated,
single-frame or headerless bitstreams, and a still image counts as media. "Plays" is only "something came out".
Native VLC 3 is run on the file as given, so it shares libvlc-wasm's blind spot for raw `.264`/`.bit`/`.jsv` streams
(it falls back to the MPEG-PS demuxer), and it cannot decode most still-image formats FFmpeg can.

## Where libvlc-wasm trails native

| folder | N | best of FFmpeg/VLC | libvlc-wasm | gap |
|---|--:|--:|--:|--:|
| vvc-conformance | 32 | 32 | 0 | 32 |
| hevc-conformance | 186 | 186 | 167 | 19 |
| mov | 41 | 41 | 31 | 10 |
| vc1 | 8 | 8 | 1 | 7 |
| hevc | 17 | 17 | 12 | 5 |
| CCITT_fax | 4 | 4 | 0 | 4 |
| lossless-audio | 37 | 37 | 33 | 4 |
| vvc | 4 | 4 | 0 | 4 |
| webp | 9 | 9 | 5 | 4 |
| sanyo | 3 | 3 | 0 | 3 |
| tiff | 6 | 6 | 3 | 3 |
| avif | 2 | 2 | 0 | 2 |
| dirac | 2 | 2 | 0 | 2 |
| duck | 9 | 9 | 7 | 2 |
| exr | 58 | 58 | 56 | 2 |
| gdv | 2 | 2 | 0 | 2 |
| h264 | 39 | 39 | 37 | 2 |
| iff | 5 | 5 | 3 | 2 |
| jpeg2000 | 57 | 57 | 55 | 2 |
| mkv | 14 | 14 | 12 | 2 |
| sunraster | 7 | 7 | 5 | 2 |
| xbm | 2 | 2 | 0 | 2 |
| cine | 1 | 1 | 0 | 1 |
| dds | 48 | 48 | 47 | 1 |
| dolby_e | 1 | 1 | 0 | 1 |
| dts | 22 | 22 | 21 | 1 |
| eac3 | 6 | 6 | 5 | 1 |
| fits | 4 | 4 | 3 | 1 |
| idcin | 1 | 1 | 0 | 1 |
| mlv | 1 | 1 | 0 | 1 |
| mpegaudio | 2 | 2 | 1 | 1 |
| mpegts | 5 | 5 | 4 | 1 |
| msnsiren | 1 | 1 | 0 | 1 |
| msrle | 2 | 2 | 1 | 1 |
| ogg-vorbis | 2 | 2 | 1 | 1 |
| oma | 1 | 1 | 0 | 1 |
| pcm-dvda | 1 | 1 | 0 | 1 |
| probe-format | 8 | 8 | 7 | 1 |
| psd | 16 | 16 | 15 | 1 |
| rscc | 5 | 5 | 4 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 2183 | 2172 (99%) | 1535 (70%) | 2041 (93%) | 518 (24%) | 546 (25%) | 422 (19%) | 45 |
| 012v | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 4xm | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| 8bps | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 |
| CCITT_fax | 4 | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| CSCD | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| KMVC | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| SIFF | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| VMnc | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aa | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aac | 54 | 54 (100%) | 50 (93%) | 54 (100%) | 51 (94%) | 46 (85%) | 33 (61%) | 0 |
| aasc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ac3 | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 1 (20%) | 4 (80%) | 1 (20%) | 0 |
| act | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| adp | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aea | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aic | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 1 (50%) | 0 (0%) | 0 (0%) | 0 |
| alg-mm | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aliaspix | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| alp | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| amrnb | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 8 (100%) | 0 (0%) | 0 |
| amrwb | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| amv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ansi | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| apm | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| apng | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| apv | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| argo-asf | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| asf | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ast | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| atrac1 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| atrac3 | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| atrac3p | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| audio-reference | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 0 |
| audiomatch | 57 | 57 (100%) | 57 (100%) | 57 (100%) | 57 (100%) | 57 (100%) | 57 (100%) | 0 |
| auravision | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1 | 7 | 7 (100%) | 6 (86%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| av1-test-vectors | 11 | 11 (100%) | 11 (100%) | 11 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| avid | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| avif | 2 | 2 (100%) | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 |
| bethsoft-vid | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| bfi | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| bfstm | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| bink | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| bmp | 16 | 16 (100%) | 16 (100%) | 16 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| bmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| brenderpix | 5 | 5 (100%) | 0 (0%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| brstm | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| caf | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 3 (100%) | 0 (0%) | 0 |
| canopus | 5 | 5 (100%) | 4 (80%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cavs | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 1 (50%) | 0 (0%) | 0 |
| cdgraphics | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cdxl | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cfhd | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| chronomaster-dfa | 11 | 11 (100%) | 11 (100%) | 11 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cine | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cineform | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 |
| cljr | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cllc | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cover_art | 5 | 5 (100%) | 4 (80%) | 5 (100%) | 2 (40%) | 3 (60%) | 3 (60%) | 3 |
| cram | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| creative | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| creatureshock-avs | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cryo-apc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| curated/avi-era-codecs | 8 | 8 (100%) | 8 (100%) | 7 (88%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| curated/everyday | 15 | 15 (100%) | 15 (100%) | 15 (100%) | 14 (93%) | 13 (87%) | 13 (87%) | 0 |
| curated/flash | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| curated/game-and-oddball-video | 7 | 7 (100%) | 6 (86%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 |
| curated/modern-codecs | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 1 (100%) | 0 |
| curated/mpeg-ps-ts | 4 | 4 (100%) | 3 (75%) | 4 (100%) | 0 (0%) | 3 (75%) | 0 (0%) | 0 |
| curated/quicktime-and-3gp | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 1 (10%) | 3 (30%) | 0 (0%) | 0 |
| curated/rare-and-surround-audio | 11 | 11 (100%) | 10 (91%) | 10 (91%) | 0 (0%) | 3 (27%) | 0 (0%) | 0 |
| curated/realmedia | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| curated/subtitles-and-captions | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 2 (50%) | 2 (50%) | 2 (50%) | 1 |
| curated/windows-media | 7 | 7 (100%) | 7 (100%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cvid | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 1 (33%) | 0 (0%) | 0 (0%) | 0 |
| cyberia-c93 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| cyuv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| d-cinema | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dds | 48 | 48 (100%) | 0 (0%) | 47 (98%) | 1 (2%) | 0 (0%) | 0 (0%) | 0 |
| delphine-cin | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| deluxepaint-anm | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dirac | 2 | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dnxhd | 9 | 9 (100%) | 9 (100%) | 9 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dnxuc | 0 | — | — | — | — | — | — | 16 |
| dolby_e | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dpx | 3 | 3 (100%) | 0 (0%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dss | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dst | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dts | 22 | 22 (100%) | 21 (95%) | 21 (95%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| duck | 9 | 9 (100%) | 6 (67%) | 7 (78%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dv | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dxa | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dxtory | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dxv | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-cdata | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-cmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-dct | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-mad | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-mpc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-tgq | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-tgv | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-vp6 | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ea-wve | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| eac3 | 6 | 6 (100%) | 5 (83%) | 5 (83%) | 0 (0%) | 5 (83%) | 0 (0%) | 0 |
| evc | 0 | — | — | — | — | — | — | 1 |
| exif | 4 | 4 (100%) | 3 (75%) | 4 (100%) | 1 (25%) | 1 (25%) | 1 (25%) | 0 |
| exr | 58 | 58 (100%) | 0 (0%) | 56 (97%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ffmpeg-synthetic | 101 | 101 (100%) | 1 (1%) | 101 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| fic | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| film | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| filter | 17 | 17 (100%) | 17 (100%) | 17 (100%) | 12 (71%) | 11 (65%) | 11 (65%) | 0 |
| fits | 4 | 4 (100%) | 0 (0%) | 3 (75%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| flash-vp6 | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| fli | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| flv | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| fmvc | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| fraps | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| frwu | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| funcom-iss | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| g2m | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| g722 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| g723_1 | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| g728 | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| gapless | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 0 |
| gdv | 2 | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| gif | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| gsm | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 |
| h264 | 39 | 39 (100%) | 31 (79%) | 37 (95%) | 14 (36%) | 15 (38%) | 13 (33%) | 0 |
| h264-444 | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| h264-conformance | 192 | 192 (100%) | 116 (60%) | 192 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 3 |
| h264-high-depth | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 1 (25%) | 0 (0%) | 1 (25%) | 0 |
| hap | 9 | 9 (100%) | 4 (44%) | 9 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| heif | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| heif-conformance | 6 | 6 (100%) | 0 (0%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| hevc | 17 | 17 (100%) | 9 (53%) | 12 (71%) | 2 (12%) | 6 (35%) | 4 (24%) | 0 |
| hevc-conformance | 186 | 186 (100%) | 143 (77%) | 167 (90%) | 0 (0%) | 0 (0%) | 0 (0%) | 2 |
| hxvs | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iamf | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| id3v2 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| idcin | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| idroq | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iff | 5 | 5 (100%) | 1 (20%) | 3 (60%) | 1 (20%) | 1 (20%) | 1 (20%) | 0 |
| iff-anim | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| imc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| imf | 3 | 3 (100%) | 1 (33%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| interplay-mve | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| isom | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iv32 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iv41 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iv50 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| iv8 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| jpeg2000 | 57 | 57 (100%) | 47 (82%) | 55 (96%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| jpegls | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| jpg | 12 | 12 (100%) | 11 (92%) | 12 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| jv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| jxl | 0 | — | — | — | — | — | — | 6 |
| jxs | 0 | — | — | — | — | — | — | 1 |
| kega | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| kvag | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lagarith | 6 | 6 (100%) | 5 (83%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lcevc | 7 | 7 (100%) | 5 (71%) | 7 (100%) | 1 (14%) | 3 (43%) | 1 (14%) | 0 |
| lcl | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lead | 4 | 4 (100%) | 0 (0%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lena.pnm | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lmlm4 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| loco | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| lossless-audio | 37 | 37 (100%) | 32 (86%) | 33 (89%) | 0 (0%) | 1 (3%) | 0 (0%) | 0 |
| lscr | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| magy | 7 | 7 (100%) | 0 (0%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| maxis-xa | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mimic | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mjpeg | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mjpegb | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mkv | 14 | 14 (100%) | 9 (64%) | 12 (86%) | 8 (57%) | 3 (21%) | 7 (50%) | 0 |
| mlv | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| motion-pixels | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mov | 41 | 41 (100%) | 32 (78%) | 31 (76%) | 27 (66%) | 26 (63%) | 28 (68%) | 5 |
| mp3-conformance | 11 | 10 (91%) | 11 (100%) | 11 (100%) | 9 (82%) | 0 (0%) | 9 (82%) | 0 |
| mpeg2 | 9 | 9 (100%) | 9 (100%) | 9 (100%) | 0 (0%) | 6 (67%) | 0 (0%) | 0 |
| mpeg4 | 9 | 9 (100%) | 3 (33%) | 9 (100%) | 1 (11%) | 1 (11%) | 1 (11%) | 0 |
| mpegaudio | 2 | 2 (100%) | 2 (100%) | 1 (50%) | 1 (50%) | 1 (50%) | 2 (100%) | 0 |
| mpegh3da | 0 | — | — | — | — | — | — | 1 |
| mpegps | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| mpegts | 5 | 5 (100%) | 3 (60%) | 4 (80%) | 0 (0%) | 3 (60%) | 0 (0%) | 0 |
| msmpeg4v1 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| msnsiren | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| msrle | 2 | 2 (100%) | 2 (100%) | 1 (50%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mss1 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mss2 | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mts2 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mtv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| musepack | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mv | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mxf | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mxpeg | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nc-camera | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nellymoser | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nistsphere | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nsv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nuv | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ogg | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 3 (75%) | 1 (25%) | 2 (50%) | 0 |
| ogg-flac | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| ogg-opus | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| ogg-vorbis | 2 | 2 (100%) | 1 (50%) | 1 (50%) | 2 (100%) | 2 (100%) | 2 (100%) | 0 |
| oki | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| oma | 1 | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| opus | 16 | 16 (100%) | 16 (100%) | 16 (100%) | 15 (94%) | 14 (88%) | 15 (94%) | 0 |
| paf | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pcm-dvd | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| pcm-dvda | 1 | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pictor | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pixlet | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pmp | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| png1 | 12 | 12 (100%) | 12 (100%) | 12 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pp_bnk | 7 | 7 (100%) | 0 (0%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| probe-format | 8 | 8 (100%) | 7 (88%) | 7 (88%) | 4 (50%) | 4 (50%) | 4 (50%) | 1 |
| prores | 7 | 7 (100%) | 2 (29%) | 7 (100%) | 2 (29%) | 7 (100%) | 1 (14%) | 0 |
| psd | 16 | 16 (100%) | 0 (0%) | 15 (94%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| psx-str | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ptx | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| pva | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| qcp | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| qoa | 3 | 3 (100%) | 0 (0%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| qpeg | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| qt-surge-suite | 17 | 17 (100%) | 17 (100%) | 17 (100%) | 8 (47%) | 12 (71%) | 0 (0%) | 0 |
| qtrle | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 1 (13%) | 0 (0%) | 0 (0%) | 0 |
| quickdraw | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| r210 | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| r3d | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| real | 6 | 6 (100%) | 6 (100%) | 6 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| realaudio | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| redspark | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rhetorex | 0 | — | — | — | — | — | — | 1 |
| rl2 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rpl | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rpza | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rscc | 5 | 5 (100%) | 0 (0%) | 4 (80%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rsd | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rt21 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| rv60 | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sanyo | 3 | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sgi | 23 | 23 (100%) | 16 (70%) | 23 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sipr | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smacker | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smjpeg | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smush | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| sol | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sp5x | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| spv1 | 4 | 4 (100%) | 0 (0%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sub | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 1 |
| sunraster | 7 | 7 (100%) | 0 (0%) | 5 (71%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| svq1 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 1 (50%) | 0 (0%) | 0 (0%) | 0 |
| svq3 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 |
| targa | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| targa-conformance | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| tdsc | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| thp | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| tiertex-seq | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| tiff | 6 | 6 (100%) | 0 (0%) | 3 (50%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| tmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| truehd | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| truespeech | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| tscc | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| txd | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ulti | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| utvideo | 22 | 22 (100%) | 0 (0%) | 22 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| v210 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| v410 | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| vble | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vc1 | 8 | 8 (100%) | 1 (13%) | 1 (13%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vcr1 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vcr2 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vixl | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vmd | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vorbis | 21 | 21 (100%) | 21 (100%) | 21 (100%) | 21 (100%) | 21 (100%) | 21 (100%) | 0 |
| vp3 | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp4 | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp5 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp6 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp7 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp8 | 10 | 10 (100%) | 10 (100%) | 10 (100%) | 9 (90%) | 9 (90%) | 9 (90%) | 0 |
| vp8-test-vectors-r1 | 17 | 17 (100%) | 17 (100%) | 17 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vp8_alpha | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| vp9-test-vectors | 226 | 226 (100%) | 224 (99%) | 226 (100%) | 222 (98%) | 218 (96%) | 162 (72%) | 0 |
| vqa | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vqc | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vqf | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vvc | 4 | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 |
| vvc-conformance | 32 | 32 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| w64 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| wav | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 2 (67%) | 2 (67%) | 2 (67%) | 0 |
| wavpack | 27 | 27 (100%) | 27 (100%) | 26 (96%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wc3movie | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wc4-xan | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| webp | 9 | 9 (100%) | 1 (11%) | 5 (56%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| westwood-aud | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wmapro | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wmavoice | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wmv8 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wnv1 | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wtv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| xbm | 2 | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| xface | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| xmv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| xwma | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| yop | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| zerocodec | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| zmbv | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (142)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in fate.mjs).

### no picture (decoder opened, nothing out) (36)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/vvc-conformance/10b422_L_5.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/ACT_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/APSALF_A_2.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/APSLMCS_D_1.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/APSMULT_A_4.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/AUD_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/BOUNDARY_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/BUMP_A_2.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/CROP_B_4.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/CodingToolsSets_A_2.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/DCI_A_3.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/FIELD_A_4.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/HRD_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/IBC_B_Tencent_2.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/OPI_B_3.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/PHSH_B_1.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/POC_A_1.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/PPS_B_1.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/RAP_A_1.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/RPR_A_4.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/SAO_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/SCALING_A_1.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/SLICES_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/SPS_B_1.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/STILL_B_1.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/SUBPIC_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/SUBPIC_C_ERICSSON_1.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/TILE_A_2.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/VPS_A_3.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/WPP_A_3.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc-conformance/WP_A_3.bit | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc-conformance/WRAP_A_4.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc/Hierarchical.bit | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc/curr-ltrp-alias.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/vvc/vvc_frames_with_ltr.vvc | vvc | vvc |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/vvc/wpp-single-slice-pic.vvc | vvc | vvc |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |

### decoder produced no picture (buffer deadlock prevented) (21)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/exr/rgb_scanline_half_zip_dw_outside.exr | exr_pipe | exr |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/exr/rgb_tile_half_zip_dw_outside.exr | exr_pipe | exr |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/fits/x0cj010ct_d0h.fit | fits | fits |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/gdv/chptr1.gdv | gdv | gdv | gremlin_dpcm | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/h264/intra_refresh.h264 | h264 | h264 |  | yes | no | no | no (`:demux=h264`) | error: libvlc demux: this doesn't look like a h264 ES stream, continuing anyway |
| fate/hevc-conformance/CIP_A_Panasonic_3.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/CIP_C_Panasonic_2.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/MAXBINS_C_TI_4.bit | hevc | hevc |  | yes | yes | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc-conformance/SDH_A_Orange_3.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc/food.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc/hdr_vivid_h265_sample.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/hevc/hevc-monochrome.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc decoder: buffer deadlock prevented |
| fate/hevc/paired_fields.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | error: libvlc demux: Playback failure |
| fate/idcin/idlog-2MB.cin | idcin | idcin | pcm_s16le | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/jpeg2000/itu-iso/codestreams_profile0/p0_11.j2k | j2k_pipe | jpeg2000 |  | yes | yes | no | — | warn: libvlc demux: cannot open VMG info |
| fate/jpeg2000/itu-iso/htj2k_bsets_profile0/p0_11_bset/ds0_ht_11_b10.j2k | j2k_pipe | jpeg2000 |  | yes | yes | no | — | warn: libvlc demux: cannot open VMG info |
| fate/lossless-audio/als_09_512ch2k16b.mp4 | mov,mp4,m4a,3gp,3g2,mj2 |  | mp4als | yes | no | no | — | warn: libvlc decoder: invalid audio properties channels count 512, sample rate 2000 |
| fate/mkv/prores_bz2.mkv | matroska,webm | prores |  | yes | yes | no | — | error: libvlc demux: Track Compression method 1 not supported |
| fate/ogg-vorbis/chained-meta.ogg | ogg |  | vorbis | yes | no | no | — | error: libvlc decoder: buffer deadlock prevented |
| fate/webp/dual_transform.webp | webp_pipe | webp |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| media/avi-era-codecs/divx-5-mp3.avi | avi | mpeg4 | mp3 | yes | yes | no | — | warn: libvlc demux: cannot find idx1 chunk, no index defined |

### ES not detected: plays with :demux=<es> (18)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/h264/crew_cif.nal | h264 | h264 |  | yes | no | no | plays (`:demux=h264`) | warn: libvlc decoder: non-dated video buffer received |
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
| fate/vc1/SA00040.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |
| fate/vc1/SA00050.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |
| fate/vc1/SA10091.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |
| fate/vc1/SA10143.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |
| fate/vc1/SA20021.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | page timeout |
| fate/vc1/ilaced_twomv.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |

### avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (17)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/CCITT_fax/G31D.TIF | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1eeffd0] get_buffer() failed |
| fate/CCITT_fax/G31DS.TIF | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1eeff00] get_buffer() failed |
| fate/CCITT_fax/G4.TIF | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1eeff00] get_buffer() failed |
| fate/CCITT_fax/G4S.TIF | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1eeff00] get_buffer() failed |
| fate/dds/fate_monob.dds | dds_pipe | dds |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/hevc-conformance/PICSIZE_A_Bossen_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | warn: [hevc @ 0x1eed990] thread_get_buffer() failed |
| fate/hevc-conformance/PICSIZE_B_Bossen_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | warn: [hevc @ 0x1d608d0] thread_get_buffer() failed |
| fate/hevc/paramchange_yuv420p_yuv420p10.hevc | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) | warn: [hevc @ 0x17e94b0] thread_get_buffer() failed |
| fate/psd/lena-bitmap.psd | psd_pipe | psd |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/sunraster/lena-1bit-raw.sun | sunrast_pipe | sunrast |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/sunraster/lena-1bit-rle.sun | sunrast_pipe | sunrast |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/tiff/lzw_rgbaf32le.tif | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1fb95d0] get_buffer() failed |
| fate/tiff/uncompressed_rgbaf32le.tif | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x15b6ee0] get_buffer() failed |
| fate/tiff/zip_rgbaf32le.tif | tiff_pipe | tiff |  | yes | no | no | — | warn: [tiff @ 0x1fb8ed0] get_buffer() failed |
| fate/xbm/lbw.xbm | xbm_pipe | xbm |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/xbm/xl.xbm | xbm_pipe | xbm |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/xface/lena.xface | image2 | xface |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |

### missing decoder (codec not in the wasm build) (12)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/cine/bayer_gbrg8.cine | cine | rawvideo |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/iff/ASH.LBM | iff | iff_ilbm |  | yes | no | no | — | error: libvlc image decoder: no suitable decoder module for fourcc `LBM '. VLC probably does not support this image format. |
| fate/iff/lms-matriks.ilbm | iff | iff_ilbm |  | yes | no | no | — | error: libvlc image decoder: no suitable decoder module for fourcc `LBM '. VLC probably does not support this image format. |
| fate/lossless-audio/truehd_5.1.raw | truehd |  | truehd | yes | no | no | — | warn: [rawvideo @ 0x13007b0] Invalid pixel format. |
| fate/mlv/M19-0333-cut.MLV | mlv | rawvideo |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| fate/msnsiren/msnsiren2.wav | wav |  | msnsiren | yes | no | no | — | error: libvlc demux: unsupported codec (undf) |
| fate/rscc/8bpp.avi | avi | rscc |  | yes | no | no | — | error: libvlc decoder: Codec `RSCC' (No description for this codec) is not supported. |
| fate/sanyo/sanyo-mono-3bit-8000.wav | wav |  | adpcm_sanyo | yes | no | no | — | error: libvlc demux: unsupported codec (undf) |
| fate/sanyo/sanyo-mono-4bit-8000.wav | wav |  | adpcm_sanyo | yes | no | no | — | error: libvlc demux: unsupported codec (undf) |
| fate/sanyo/sanyo-mono-5bit-8000.wav | wav |  | adpcm_sanyo | yes | no | no | — | error: libvlc demux: unsupported codec (undf) |
| fate/sol/lsl7sample.sol | sol |  | sol_dpcm | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/v410/lenav410.mov | mov,mp4,m4a,3gp,3g2,mj2 | rawvideo |  | yes | no | no | — | error: libvlc decoder: Codec `v410' (No description for this codec) is not supported. |

### demuxer choice: plays with :demux=avformat (11)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/avif/still_image.avif | mov,mp4,m4a,3gp,3g2,mj2 | av1 |  | yes | yes | plays | — | warn: libvlc stream filter: unknown box type pixi (incompletely loaded) |
| fate/avif/still_image_exif.avif | mov,mp4,m4a,3gp,3g2,mj2 | av1 |  | yes | yes | plays | — | warn: libvlc stream filter: unknown box type pixi (incompletely loaded) |
| fate/duck/salsa-audio-only.avi | avi |  | adpcm_ima_dk4 | yes | yes | plays | — | error: libvlc decoder: buffer deadlock prevented |
| fate/duck/sop-audio-only.avi | avi |  | adpcm_ima_dk3 | yes | yes | plays | — | error: libvlc decoder: buffer deadlock prevented |
| fate/mkv/spherical.mkv | matroska,webm | h264 |  | yes | yes | plays | — | warn: webcodecs: copyTo(I444): Invalid typed array length: 6220800 |
| fate/mov/test_iibbibb.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | yes | plays | — | error: libvlc decoder: buffer deadlock prevented |
| fate/mov/test_iibbibb_neg_ctts.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | yes | plays | — | error: libvlc decoder: buffer deadlock prevented |
| fate/mov/vfr-7-12-1-sequence.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | no | plays | — | error: libvlc decoder: buffer deadlock prevented |
| fate/msrle/clock.avi | avi | msrle | truespeech | yes | yes | plays | — | error: libvlc decoder: Argument list too long |
| fate/probe-format/mpegts-png-prefix | mpegts | h264 |  | yes | no | plays | — |  |
| fate/webp/anim.webp | webp_anim | webp_anim |  | yes | no | plays | — | page timeout |

### harness artifact? (frames drawn, flat picture) (8)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/gdv/ace.gdv | gdv | gdv |  | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/mov/dovi-p5.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | hevc |  | yes | yes | no | — | warn: libvlc demux: elst box found |
| fate/mov/dovi-p7.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | hevc |  | yes | yes | no | — | warn: libvlc demux: elst box found |
| fate/mov/dovi-p81.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | hevc |  | yes | yes | no | — | warn: libvlc demux: elst box found |
| fate/mov/fake-gp-media-with-real-gpmf.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | yes | no | — | warn: libvlc stream filter: unknown box type gmin (incompletely loaded) |
| fate/mov/mov-piff-cenc-hybrid.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | no | no | — | warn: [h264 @ 0x1925820] error while decoding MB 33 8, bytestream 1087 |
| fate/mov/mov-piff-encrypted.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | h264 |  | yes | no | no | — | warn: [h264 @ 0x130a510] error while decoding MB 33 8, bytestream 1087 |
| fate/mpegts/dovi-p7.ts | mpegts | hevc |  | yes | yes | no | — |  |

### other / no clue in the log (7)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/hevc-conformance/VPSID_A_VIDYO_1.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) |  |
| fate/hevc-conformance/VPSID_A_VIDYO_2.bit | hevc | hevc |  | yes | no | no | no (`:demux=hevc`) |  |
| fate/lossless-audio/luckynight-partial.osq | osq |  | osq | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/lossless-audio/luckynight-partial.shn | shn |  | shorten | yes | no | no | — | error: libvlc demux: Playback failure |
| fate/mov/dovi-p7-hvce.mp4 | mov,mp4,m4a,3gp,3g2,mj2 | hevc |  | yes | no | no | — | warn: libvlc stream: unknown box type hvcE (incompletely loaded) |
| fate/vc1/SMM0005.rcv | vc1test | wmv3 |  | yes | no | no | — | error: libvlc demux: Playback failure |
| media/rare-and-surround-audio/shorten.shn | shn |  | shorten | yes | no | no | — | error: libvlc demux: Playback failure |

### harness artifact? (audio played, below threshold) (6)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/dts/master_audio_7.1_24bit.dts | dts |  | dts | yes | yes | no | — | warn: libvlc decoder: 2 channels are dropped |
| fate/mpegaudio/packed_maindata.mp3.mp4 | mov,mp4,m4a,3gp,3g2,mj2 |  | mp3 | yes | yes | no | — | warn: [/cache/vlc/contrib/contrib-emscripten/mpg123/src/libmpg123/parse.c:wetwork():1403] error: not attempting to resync... |
| fate/oma/01-Untitled-partial.oma | oma |  | atrac3 | yes | yes | no | — | error: libvlc demux: Playback failure |
| fate/pcm-dvda/pcm_dvda-96k24bit.aob | mpeg |  | mlp | no | yes | no | — |  |
| fate/wavpack/num_channels/edward_4.0_16bit-partial.wv | wv |  | wavpack | yes | yes | no | — | error: libvlc demux: Playback failure |
| media/chiptune-tracker-midi/openmpt-test-xm.xm |  |  |  | no | yes | no | — |  |

### timeout / hang (4)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/dirac/vts.profile-main.drc | dirac | dirac |  | yes | no | no | no (`:demux=es`) | page timeout |
| fate/dirac/vts.profile-vc2-low-delay.drc | dirac | dirac |  | yes | no | no | no (`:demux=es`) | page timeout |
| fate/webp/anim_rgb_yuv.webp | webp_anim | webp_anim |  | yes | no | no | — | page timeout |
| fate/webp/anim_yuv_rgb.webp | webp_anim | webp_anim |  | yes | no | no | — | page timeout |

### no demuxer accepted the file (2)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| fate/dolby_e/16-11 | s337m |  | dolby_e | yes | no | no | — | VLC could not play this media (see the log) \| warn: libvlc demux: cannot open VMG info |
| fate/eac3/csi_miami_stereo_128_spx.eac3 | eac3 |  | eac3 | yes | no | no | — | VLC could not play this media (see the log) \| error: libvlc demux: Playback failure |

## Unplayable by all (45, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **cover_art** (3): `luckynight_cover.ape`, `luckynight_cover.wv`, `wma_with_metadata_library_object_tag_trimmed.wma`
- **curated/game-and-oddball-video** (1): `game-and-oddball-video/vivo-2-vivoactive.viv`
- **curated/subtitles-and-captions** (1): `subtitles-and-captions/dvb-subtitles-in-ts.ts`
- **dnxuc** (16): `cb_rgb_10.mxf`, `cb_rgb_12.mxf`, `cb_rgb_8.mxf`, `cb_rgb_float.mxf`, `cb_rgb_half.mxf`, `cb_yuv422_10.mxf`, `cb_yuv422_12.mxf`, `cb_yuv422_8.mxf`, `ramp_rgb_10.mxf`, `ramp_rgb_12.mxf`, `ramp_rgb_8.mxf`, `ramp_rgb_float.mxf`, `ramp_rgb_half.mxf`, `ramp_yuv422_10.mxf`, `ramp_yuv422_12.mxf`, `ramp_yuv422_8.mxf`
- **evc** (1): `akiyo_cif.evc`
- **h264-conformance** (3): `FM1_BT_B.h264`, `FM2_SVA_B.264`, `FM2_SVA_C.264`
- **hevc-conformance** (2): `EXT_A_ericsson_3.bit`, `TSUNEQBD_A_MAIN10_Technicolor_2.bit`
- **jxl** (6): `belgium.jxl`, `icos4d.jxl`, `l.jxl`, `lenna-256.jxl`, `newton.jxl`, `orange.jxl`
- **jxs** (1): `lena.jxs`
- **mov** (5): `faststart-4gb-overflow.mov`, `mov-3elist-encrypted.mov`, `mov-tenc-only-encrypted.mp4`, `mp4-with-mov-in24-ver.mp4`, `mpegh_layout16.mp4`
- **mpegh3da** (1): `mpegh_config_change_cicp_2_14_6_lc_baseline_compatible_32kbps.mp4`
- **probe-format** (1): `tiff-not-mpegts`
- **rhetorex** (1): `rhetorex-mono-4bit-8000.wav`
- **sub** (1): `dvbsubtest_filter.ts`
- **svq3** (1): `svq3_decoding_regression.mov`
- **vvc** (1): `vvc-16bit-mc.vvc`
