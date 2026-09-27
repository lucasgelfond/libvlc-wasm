# Benchmarks

2026-09-27T05:27:26.542Z · Apple M5 (10 cores, 16 GB) · macOS 26.6.2 · Chrome 153.0.8010.53 (headless)

## Download size

| binary | raw | gzip -9 | brotli -11 |
|---|---|---|---|
| libvlc-wasm (libvlc.wasm) | 24.7 MB | 9.9 MB | 7.6 MB |
| ffmpeg.wasm core-mt 0.12.10 | 31.2 MB | 9.8 MB | 7.0 MB |

## Startup (createVLC() to ready, median of 3)

cold (empty cache): **108 ms** · warm: **102 ms**

## Decode throughput, 1080p30, 5 s (frames per second, higher is better)

The VLC columns run the whole player at 32x with frame dropping off, counting frames as the video output shows them:
demux, decode, frame copy and (wasm) the WebGL upload, so they include player overhead and top out near the
vout's pacing ceiling (~550 fps). The FFmpeg and ffmpeg.wasm columns are decode only (`-f null`).
Native VLC 3 is forced to software decoding (`--codec=avcodec|dav1d`). WebCodecs is the browser's decoder
(VideoToolbox on this Mac) driven through VLC. The last column compares like with like — the same player,
native vs wasm, both in software; † marks results at the pacing ceiling, where the decoder is not the limit.

| clip | threads | native FFmpeg | native VLC 3 | libvlc-wasm (software) | libvlc-wasm + WebCodecs | ffmpeg.wasm | native VLC ÷ libvlc-wasm |
|---|---|---|---|---|---|---|---|
| av1_1080p.mkv | 1 | 273.2 | 240.1 | 89.4 | 482.1 | — | 2.69× |
| av1_1080p.mkv | 4 | 638.3 | 558.5 | 248.6 | 495.3 | — | 2.25× |
| h264_1080p.mkv | 1 | 125.4 | 117.6 | 74.6 | 509.9 | 66.9 | 1.58× |
| h264_1080p.mkv | 4 | 340.9 | 310.8 | 214.1 | 614.0 | 200.0 | 1.45× |
| hevc_1080p.mkv | 1 | 289.6 | 249.9 | 197.0 | 517.3 | 125.4 | 1.27× |
| hevc_1080p.mkv | 4 | 669.6 | 570.6 | 423.4 | 511.0 | 297.8 | 1.35× |
| mjpeg_1080p.avi | 1 | 704.2 | 583.9 | 198.9 | — | 284.0 | 2.94× |
| mjpeg_1080p.avi | 4 | 714.3 | 578.0 | 202.3 | — | 286.4 | 2.86× |
| mpeg2_1080p.mpg | 1 | 1250.0 | 562.0 | 469.4 | — | 592.9 | 1.20× † |
| mpeg2_1080p.mpg | 4 | 3061.2 | 571.4 | 497.0 | — | 1363.1 | 1.15× † |
| mpeg2_1280x720.mpg | 1 | 2343.8 | 538.9 | 508.1 | — | 1049.4 | 1.06× † |
| mpeg2_1280x720.mpg | 4 | 5555.6 | 536.8 | 459.4 | — | 2143.3 | 1.17× † |
| mpeg2_640x360.mpg | 1 | 2631.6 | 552.8 | 584.0 | — | 1102.7 | 0.95× † |
| mpeg2_640x360.mpg | 4 | 7142.9 | 557.4 | 538.7 | — | 2485.1 | 1.03× † |
| mpeg4asp_1080p.avi | 1 | 877.2 | 570.1 | 341.0 | — | 450.3 | 1.67× |
| mpeg4asp_1080p.avi | 4 | 2459.0 | 572.1 | 342.6 | — | 1185.8 | 1.67× |
| msmpeg4_1080p.avi | 1 | 819.7 | 575.5 | 280.2 | — | 413.4 | 2.05× |
| msmpeg4_1080p.avi | 4 | 819.7 | 577.0 | 343.0 | — | 418.4 | 1.68× |
| vp9_1080p.webm | 1 | 335.6 | 295.7 | 160.8 | 583.5 | 149.5 | 1.84× |
| vp9_1080p.webm | 4 | 547.4 | 370.3 | 294.5 | 585.6 | 321.9 | 1.26× |

## Time to first frame for a file the browser can't play

RealVideo 4 + Cook (`.rmvb`, 2 MB). libvlc-wasm plays it directly; with ffmpeg.wasm it must first be
transcoded to H.264/AAC MP4 (`-preset ultrafast`, 4 threads) and handed to `<video>`.

| path | time to first frame |
|---|---|
| libvlc-wasm `player.open(file)` | **21 ms** |
| ffmpeg.wasm load (once per page) | 205 ms |
| ffmpeg.wasm transcode first 10 s → `<video>` | 667 ms |
| ffmpeg.wasm transcode whole file → `<video>` | 971 ms |

## Probe and thumbnail (libvlc-wasm)

| clip | probe | thumbnail |
|---|---|---|
| av1_1080p.mkv | 5 ms | 24 ms |
| h264_1080p.mkv | 7 ms | 54 ms |
| hevc_1080p.mkv | 3 ms | 41 ms |
| mjpeg_1080p.avi | 3 ms | 14 ms |
| mpeg2_1080p.mpg | 2 ms | 43 ms |
| mpeg2_1280x720.mpg | 3 ms | 29 ms |
| mpeg2_640x360.mpg | 2 ms | 16 ms |
| mpeg4asp_1080p.avi | 2 ms | 16 ms |
| msmpeg4_1080p.avi | 3 ms | 15 ms |
| vp9_1080p.webm | 5 ms | 45 ms |
