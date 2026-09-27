# VLC samples archive (streams.videolan.org/samples), subset: compatibility matrix

The VideoLAN / Libav / MPlayer samples collection: the bug-report pile of real-world files in every container and codec VLC has had to deal with, many of them broken or odd on purpose.

- Source: https://streams.videolan.org/samples/allsamples.txt (about: https://streams.videolan.org/samples/)
- Licence: no stated licence: samples collected from bug reports for testing; free to download for testing (00-README)
- Fetched: the file list is allsamples.txt; sizes from each folder's directory listing (one request at a time); files downloaded one at a time.
- Subset: the archive is 54 GB and its README asks that bulk fetches over 1 GB be rate-limited, so: one file per codec/format subfolder of V-codecs/, A-codecs/ and game-formats/, and up to 5 files (round-robin over subfolders) from every other top-level folder, and one per archive/container/<format>/ (archive/ is the upload inbox, shown under several views); each the 16 kB-8 MB media file whose size is closest to 512 kB. Left out: fate-suite/ (FFmpeg FATE, measured separately), drivers32/ (codec DLLs), adaptive/ and playlists/ (need a streaming server), RAR volumes/, JPEG-seq/, PNG-seq/, yuv/, raw-video/ (image sequences and headerless frames).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=vlc-samples`. Definition: `corpus/suites/vlc-samples.json`.
Raw per-file results are in `suites/vlc-samples-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`vlc-samples-matrix.json`, `vlc-samples-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 446**: the files that native FFmpeg **or** native VLC 3 plays, out of 455 media files (534 files
in all; 16 media files play in neither and are listed at the end, not counted). 7 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 417 (93%) | 446 |
| FFmpeg (ffmpeg version 9.0.2) | 423 (95%) | 446 |
| VLC 3.0.24 | 395 (89%) | 446 |
| Chromium native | 53 (12%) | 446 |
| WebKit native | 86 (19%) | 446 |
| Firefox native | 43 (10%) | 446 |

29 union files fail in libvlc-wasm; 4 of them play when retried with `:demux=avformat`,
and 3 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

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
| archive | 22 | 22 | 18 | 4 |
| A-codecs | 57 | 55 | 53 | 2 |
| dvr_ms | 3 | 3 | 1 | 2 |
| DVD-Audio | 4 | 4 | 3 | 1 |
| camera-dvr | 1 | 1 | 0 | 1 |
| mov | 5 | 5 | 4 | 1 |
| ogg | 5 | 5 | 4 | 1 |
| r3d | 1 | 1 | 0 | 1 |

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 446 | 423 (95%) | 395 (89%) | 417 (93%) | 53 (12%) | 86 (19%) | 43 (10%) | 16 |
| 360VR | 3 | 3 (100%) | 1 (33%) | 3 (100%) | 3 (100%) | 3 (100%) | 3 (100%) | 0 |
| 8svx | 5 | 5 (100%) | 0 (0%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| A-codecs | 57 | 55 (96%) | 53 (93%) | 53 (93%) | 16 (28%) | 21 (37%) | 11 (19%) | 3 |
| AIFF | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 5 (100%) | 0 (0%) | 0 |
| AVS | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 1 (50%) | 0 (0%) | 1 (50%) | 0 |
| DV-raw | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| DVD-Audio | 4 | 2 (50%) | 4 (100%) | 3 (75%) | 0 (0%) | 2 (50%) | 0 (0%) | 0 |
| Divx4-bugs | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| FLV | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| HX | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| MPEG-4 | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 4 (80%) | 3 (60%) | 3 (60%) | 0 |
| MPEG-VOB | 4 | 4 (100%) | 3 (75%) | 4 (100%) | 0 (0%) | 3 (75%) | 0 (0%) | 0 |
| MPEG1 | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) | 0 |
| MPEG2 | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 4 (80%) | 0 (0%) | 0 |
| MXF | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| Matroska | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 4 (80%) | 0 (0%) | 4 (80%) | 0 |
| SWF | 5 | 4 (80%) | 4 (80%) | 4 (80%) | 1 (20%) | 0 (0%) | 0 (0%) | 0 |
| TiVo | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| V-codecs | 109 | 98 (90%) | 97 (89%) | 101 (93%) | 2 (2%) | 6 (6%) | 1 (1%) | 7 |
| amv | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| archive | 22 | 22 (100%) | 18 (82%) | 18 (82%) | 4 (18%) | 8 (36%) | 4 (18%) | 1 |
| asf-wmv | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| aspect_samples | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| au | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| avi | 5 | 4 (80%) | 4 (80%) | 4 (80%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| benchmark | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| camera-dvr | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| dvr_ms | 3 | 3 (100%) | 3 (100%) | 1 (33%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| evob | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ffmpeg-bugs | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 1 (20%) | 2 (40%) | 1 (20%) | 0 |
| flac | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 4 (80%) | 0 |
| fli-flc | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| game-formats | 61 | 55 (90%) | 50 (82%) | 57 (93%) | 0 (0%) | 1 (2%) | 0 (0%) | 2 |
| image-samples | 4 | 4 (100%) | 3 (75%) | 4 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| internets | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| k3g | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| karaoke | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mobileVideo_3gp | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 4 (100%) | 0 (0%) | 0 |
| monkeyaudio | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| mov | 5 | 5 (100%) | 4 (80%) | 4 (80%) | 2 (40%) | 4 (80%) | 1 (20%) | 0 |
| mplayer-bugs | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 2 (67%) | 2 (67%) | 2 (67%) | 0 |
| multichannel | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| nsv | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nut | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| nuv | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| ogg | 5 | 5 (100%) | 3 (60%) | 4 (80%) | 4 (80%) | 3 (60%) | 4 (80%) | 0 |
| oma | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| playstation | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| postprocess | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| r3d | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| real | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| sgi | 3 | 3 (100%) | 2 (67%) | 3 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| smv | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 0 (0%) | 4 (100%) | 0 (0%) | 0 |
| sub | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 2 (40%) | 1 (20%) | 2 (40%) | 0 |
| tests | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| testsuite | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vivo | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 3 |
| voc | 5 | 5 (100%) | 3 (60%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| vqf | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| wtv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (29)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### missing decoder (codec not in the wasm build) (5)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/A-codecs/TrueHD/TrueHD.raw | truehd |  | truehd | yes | no | no | — | warn: [rawvideo @ 0x1349ba0] Invalid pixel format. |
| suites/vlc-samples/A-codecs/msnsiren/msnsiren.wav | wav |  | msnsiren | yes | no | no | — | error: libvlc demux: unsupported codec (undf) |
| suites/vlc-samples/V-codecs/MVI2/real-3.avi | avi | unknown | pcm_u8 | no | yes | no | — | warn: libvlc demux: cannot find idx1 chunk, no index defined |
| suites/vlc-samples/V-codecs/Phantom_Cine/phantom_cine2/roll7_FlashCine1.cine | cine | rawvideo |  | yes | no | no | — | warn: libvlc demux: cannot open VMG info |
| suites/vlc-samples/game-formats/sol/lsl7sample.sol | sol |  | sol_dpcm | yes | no | no | — | error: libvlc demux: Playback failure |

### decoder produced no picture (buffer deadlock prevented) (5)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/SWF/962_fws.swf | swf | vp6f | pcm_u8 | yes | no | no | — | error: libvlc demux: Playback failure |
| suites/vlc-samples/avi/dance1.avi | avi | rawvideo |  | yes | no | no | — | warn: libvlc decoder: invalid frame size (38400 < 76800) |
| suites/vlc-samples/game-formats/gdv/iplogo.gdv | gdv | gdv | gremlin_dpcm | yes | no | no | — | error: libvlc demux: Playback failure |
| suites/vlc-samples/ogg/annodex/house_proceeding_04-05-06_3.ogg.ogx | ogg | theora | vorbis | yes | yes | no | — | error: libvlc decoder: buffer deadlock prevented |
| suites/vlc-samples/r3d/build#12_2k-Dark-5600k-1-1.R3D | r3d | jpeg2000 |  | yes | no | no | — | error: libvlc decoder: buffer deadlock prevented |

### other / no clue in the log (4)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/A-codecs/shorten/08 Track 08.shn | shn |  | shorten | yes | no | no | — | error: libvlc demux: Playback failure |
| suites/vlc-samples/V-codecs/h261/h261-raw/cifmad384.p64 | h261 | h261 |  | yes | no | no | — | warn: [mp3float @ 0x137ec80] Header missing |
| suites/vlc-samples/V-codecs/h265/broken_vui_as seen_in_MKV.hevc | hevc | hevc |  | yes | yes | no | no (`:demux=hevc`) | error: libvlc demux packetizer: Failed decoding SPS id 0 |
| suites/vlc-samples/archive/container/shn/shn++shorten++Shorten Choppy.shn | shn |  | shorten | yes | no | no | — | error: libvlc demux: Playback failure |

### demuxer choice: plays with :demux=avformat (4)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/DVD-Audio/audigy2-sample-disc/audio_sv.vob | mpeg | mpeg2video |  | yes | yes | plays | — | warn: libvlc demux: found sync code |
| suites/vlc-samples/V-codecs/ES07/furby3.avi | avi | unknown | gsm_ms | no | yes | plays | — | error: libvlc decoder: Invalid data found when processing input |
| suites/vlc-samples/dvr_ms/SS2.dvr-ms | asf | mpeg2video | ac3 | yes | yes | plays | — | warn: [mpeg2video @ 0x13199a0] Missing picture start code |
| suites/vlc-samples/dvr_ms/fps_sample1.dvr-ms | asf | mpeg2video | mp2 | yes | yes | plays | — | warn: [mpeg2video @ 0x1ef2200] Invalid frame dimensions 0x0. |

### no demuxer accepted the file (3)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/A-codecs/AC3/eac3/csi_miami_5.1_256_spx.eac3 | eac3 |  | eac3 | yes | no | no | — | VLC could not play this media (see the log) \| error: libvlc demux: Playback failure |
| suites/vlc-samples/game-formats/idcin/quake.cin | idcin | idcin |  | yes | no | no | — | VLC could not play this media (see the log) \| error: libvlc demux: Playback failure |
| suites/vlc-samples/mov/mov-demux-infinite-loop.mpg | mpeg | mpeg2video | mp2 | yes | yes | no | — | VLC could not play this media (see the log) \| error: libvlc demux: Playback failure |

### harness artifact? (audio played, below threshold) (3)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/V-codecs/VDOM/vdowave.drv |  |  |  | no | yes | no | — | warn: [/cache/vlc/contrib/contrib-emscripten/mpg123/src/libmpg123/parse.c:wetwork():1403] error: not attempting to resync... |
| suites/vlc-samples/archive/container/mp3/mp3++mp2++audiotest.mp2 | mp3 |  | mp2 | yes | yes | no | — |  |
| suites/vlc-samples/game-formats/novastorm-media/skysd.fa |  |  |  | no | yes | no | — | warn: [/cache/vlc/contrib/contrib-emscripten/mpg123/src/libmpg123/parse.c:wetwork():1403] error: not attempting to resync... |

### ES not detected: plays with :demux=<es> (3)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/V-codecs/WVC1/rtvc1.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | warn: [NULL @ 0x113cb60] Luma scaling is not supported, expect wrong picture |
| suites/vlc-samples/archive/container/vc1/vc1+vc1+++artifacts5.vc1 | vc1 | vc1 |  | yes | no | no | plays (`:demux=vc1`) | error: libvlc decoder: buffer deadlock prevented |
| suites/vlc-samples/camera-dvr/040412-M001.dmskm | m4v | mpeg4 |  | yes | no | no | plays (`:demux=m4v`) | VLC could not play this media (see the log) \| error: libvlc demux: Playback failure |

### timeout / hang (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/V-codecs/Dirac/RL_420p_ffdirac.drc | dirac | dirac |  | yes | no | no | no (`:demux=es`) | page timeout |

### harness artifact? (frames drawn, flat picture) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/vlc-samples/archive/container/swf/swf+mjpeg+++jas_test.swf | swf | rawvideo |  | yes | yes | no | — | warn: [swf @ 0x1153360] pixel format change unsupported |

## Unplayable by all (16, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **A-codecs** (3): `A-codecs/AC4/zAdN.ac4`, `A-codecs/VoxwareRT24-speechCodec/Nick Pope.avi`, `A-codecs/vocaltec-interwave/basthi16.vmf`
- **V-codecs** (7): `V-codecs/LCW2/mcmw.avi`, `V-codecs/LZO/lzo-yuv.avi`, `V-codecs/MWV1/test.avi`, `V-codecs/SCLS/somewins.avi`, `V-codecs/VSSW/wlt-1000.avi`, `V-codecs/VTLP-VGPX/toocool.vgm.avi`, `V-codecs/msud/msud.avi`
- **archive** (1): `archive/container/rpl/rpl+0x0007+0x0001++Launch.rpl`
- **game-formats** (2): `game-formats/bmv/DW3-Loffnote.bmv`, `game-formats/umv/V_END7.UMV`
- **vivo** (3): `vivo/Bud_Weiser_Commercial_-_Lizard_Kills_Frogs_Part_2.viv`, `vivo/South_Park_-_Countdown_to_98.viv`, `vivo/paulvandykforanangel.viv`
