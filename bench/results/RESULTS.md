# Benchmarks

2026-09-27T18:17:13.668Z · Apple M5 (10 cores, 16 GB) · macOS 26.6.2 · Chrome 153.0.8010.53 (headless)

## Download size

| binary | raw | gzip -9 | brotli -11 |
|---|---|---|---|
| libvlc-wasm (libvlc.wasm) | 25.4 MB | 10.1 MB | 7.8 MB |
| ffmpeg.wasm core-mt 0.12.10 | 31.2 MB | 9.8 MB | 7.0 MB |

## Startup (createVLC() to ready, median of 3)

cold (empty cache): **232 ms** · warm: **211 ms**

## Decode throughput, 1080p30, 5 s (frames per second, higher is better)

The VLC columns run the whole player at 32x with frame dropping off, counting frames as the video output shows them:
demux, decode, frame copy and (wasm) the WebGL upload, so they include player overhead and top out near the
vout's pacing ceiling (~550 fps). The FFmpeg and ffmpeg.wasm columns are decode only (`-f null`).
Native VLC 3 is forced to software decoding (`--codec=avcodec|dav1d`). WebCodecs is the browser's decoder
(VideoToolbox on this Mac) driven through VLC. The last column compares like with like — the same player,
native vs wasm, both in software; † marks results at the pacing ceiling, where the decoder is not the limit.

| clip | threads | native FFmpeg | native VLC 3 | libvlc-wasm (software) | libvlc-wasm + WebCodecs | ffmpeg.wasm | native VLC ÷ libvlc-wasm |
|---|---|---|---|---|---|---|---|
| av1_1080p.mkv | 1 | 198.9 | 146.3 | 69.9 | 497.9 | — | 2.09× |
| av1_1080p.mkv | 4 | 297.6 | 313.8 | 156.6 | 499.3 | — | 2.00× |
| h264_1080p.mkv | 1 | 88.8 | 98.9 | 64.7 | 546.7 | 56.6 | 1.53× |
| h264_1080p.mkv | 4 | 272.7 | 246.0 | 164.5 | 583.3 | 153.3 | 1.50× |
| hevc10_1080p.mkv | 1 | 138.7 | 142.7 | 112.5 | 147.4 | 102.2 | 1.27× |
| hevc10_1080p.mkv | 4 | 234.4 | 269.7 | 210.0 | 384.6 | 265.9 | 1.28× |
| hevc_1080p.mkv | 1 | 191.3 | 177.4 | 109.9 | 550.5 | 89.3 | 1.61× |
| hevc_1080p.mkv | 4 | 297.6 | 322.5 | 283.0 | 621.3 | 238.3 | 1.14× |
| mjpeg_1080p.avi | 1 | 549.5 | 413.5 | 172.0 | — | 243.3 | 2.40× |
| mjpeg_1080p.avi | 4 | 590.6 | 415.6 | 191.3 | — | 252.2 | 2.17× |
| mpeg2_1080p.mpg | 1 | 1034.5 | 567.1 | 357.7 | — | 537.7 | 1.59× |
| mpeg2_1080p.mpg | 4 | 2027.0 | 579.6 | 416.3 | — | 1114.7 | 1.39× |
| mpeg2_1280x720.mpg | 1 | 2054.8 | 553.8 | 455.0 | — | 1080.5 | 1.22× † |
| mpeg2_1280x720.mpg | 4 | 3947.4 | 554.6 | 464.7 | — | 2038.7 | 1.19× † |
| mpeg2_640x360.mpg | 1 | 2381.0 | 567.5 | 519.5 | — | 1154.2 | 1.09× † |
| mpeg2_640x360.mpg | 4 | 4838.7 | 559.7 | 519.8 | — | 2353.7 | 1.08× † |
| mpeg4asp_1080p.avi | 1 | 697.7 | 553.8 | 281.8 | — | 396.0 | 1.97× |
| mpeg4asp_1080p.avi | 4 | 1973.7 | 535.4 | 231.1 | — | 957.0 | 2.32× |
| msmpeg4_1080p.avi | 1 | 663.7 | 579.8 | 273.1 | — | 365.9 | 2.12× |
| msmpeg4_1080p.avi | 4 | 655.0 | 452.8 | 197.1 | — | 291.7 | 2.30× |
| vp9_1080p.webm | 1 | 254.7 | 242.3 | 136.0 | 409.0 | 128.3 | 1.78× |
| vp9_1080p.webm | 4 | 438.6 | 369.3 | 294.3 | 360.3 | 274.7 | 1.25× |
| yuv444_1080p.mkv | 1 | 172.4 | 151.9 | 121.2 | — | 112.3 | 1.25× |
| yuv444_1080p.mkv | 4 | 517.2 | 442.5 | 313.3 | — | 335.9 | 1.41× |

## Time to first frame for a file the browser can't play

RealVideo 4 + Cook (`.rmvb`, 2 MB). libvlc-wasm plays it directly; with ffmpeg.wasm it must first be
transcoded to H.264/AAC MP4 (`-preset ultrafast`, 4 threads) and handed to `<video>`.

| path | time to first frame |
|---|---|
| libvlc-wasm `player.open(file)` | **42 ms** |
| ffmpeg.wasm load (once per page) | 277 ms |
| ffmpeg.wasm transcode first 10 s → `<video>` | 909 ms |
| ffmpeg.wasm transcode whole file → `<video>` | 1.1 s |

## Probe and thumbnail (libvlc-wasm)

| clip | probe | thumbnail |
|---|---|---|
| av1_1080p.mkv | 10 ms | 36 ms |
| h264_1080p.mkv | 12 ms | 116 ms |
| hevc10_1080p.mkv | 3 ms | 40 ms |
| hevc_1080p.mkv | 6 ms | 47 ms |
| mjpeg_1080p.avi | 4 ms | 21 ms |
| mpeg2_1080p.mpg | 2 ms | 49 ms |
| mpeg2_1280x720.mpg | 2 ms | 32 ms |
| mpeg2_640x360.mpg | 10 ms | 26 ms |
| mpeg4asp_1080p.avi | 3 ms | 20 ms |
| msmpeg4_1080p.avi | 5 ms | 22 ms |
| vp9_1080p.webm | 9 ms | 53 ms |
| yuv444_1080p.mkv | 5 ms | 39 ms |
