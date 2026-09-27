# Public test suites: compatibility summary

Every suite below is measured the same way as the FFmpeg FATE matrix (see [FATE.md](FATE.md) for the criteria):
native FFmpeg, native VLC 3, libvlc-wasm in Chromium, and the browsers' own `<video>`/`<audio>`. **N** is the union of
media files native FFmpeg or native VLC 3 plays; every percentage is of N. A suite is defined by `corpus/suites/<name>.json`
(listed by `corpus/suites/lists.mjs`, fetched by `corpus/suites/fetch.mjs`, measured by `node corpus/compat/suite.mjs --suite=<name>`).
Derived suites re-summarise FATE folders and measure nothing.

| suite | files | media | N | libvlc-wasm | FFmpeg | VLC 3 | Chromium | WebKit | Firefox | wasm fails in N | fixed by :demux=avformat |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| [fate](FATE.md) | 2629 | 2219 | 2183 | 2041 (93%) | 2172 (99%) | 1535 (70%) | 518 (24%) | 546 (25%) | 422 (19%) | 142 | 11 |
| [chromium](suites/chromium.md) | 386 | 376 | 322 | 290 (90%) | 318 (99%) | 250 (78%) | 206 (64%) | 197 (61%) | 211 (66%) | 32 | 7 |
| [dav1d](suites/dav1d.md) | 776 | 754 | 754 | 754 (100%) | 738 (98%) | 753 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 | 0 |
| [flac-test-files](suites/flac-test-files.md) | 86 | 82 | 82 | 76 (93%) | 78 (95%) | 78 (95%) | 75 (91%) | 70 (85%) | 77 (94%) | 6 | 4 |
| [gecko](suites/gecko.md) | 401 | 362 | 301 | 287 (95%) | 292 (97%) | 272 (90%) | 257 (85%) | 216 (72%) | 267 (89%) | 14 | 2 |
| [gstreamer](suites/gstreamer.md) | 101 | 96 | 98 | 97 (99%) | 96 (98%) | 92 (94%) | 46 (47%) | 52 (53%) | 38 (39%) | 1 | 0 |
| [h264-conformance](suites/h264-conformance.md) | 197 | 195 | 192 | 192 (100%) | 192 (100%) | 116 (60%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 | 0 |
| [hevc-conformance](suites/hevc-conformance.md) | 188 | 188 | 186 | 167 (90%) | 186 (100%) | 143 (77%) | 0 (0%) | 0 (0%) | 0 (0%) | 19 | 0 |
| [libaom](suites/libaom.md) | 244 | 244 | 244 | 244 (100%) | 244 (100%) | 244 (100%) | 2 (1%) | 2 (1%) | 2 (1%) | 0 | 0 |
| [libvpx](suites/libvpx.md) | 376 | 376 | 372 | 371 (100%) | 372 (100%) | 368 (99%) | 303 (81%) | 298 (80%) | 243 (65%) | 1 | 0 |
| [matroska-test-files](suites/matroska-test-files.md) | 8 | 8 | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 4 (50%) | 0 | 0 |
| [vlc-samples](suites/vlc-samples.md) | 534 | 455 | 446 | 417 (93%) | 423 (95%) | 395 (89%) | 53 (12%) | 86 (19%) | 43 (10%) | 29 | 4 |
| [vvc-conformance](suites/vvc-conformance.md) | 32 | 32 | 32 | 0 (0%) | 32 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 32 | 0 |
| [wpt](suites/wpt.md) | 88 | 87 | 83 | 83 (100%) | 83 (100%) | 81 (98%) | 80 (96%) | 81 (98%) | 79 (95%) | 0 | 0 |

## What each suite is

- **fate**: FFmpeg FATE suite + curated corpus. Source: https://fate-suite.ffmpeg.org/. Taken: the whole FATE sample suite (rsync of fate-suite.ffmpeg.org) plus corpus/manifest.json
- **chromium**: Chromium media test data (media/test/data). Source: https://github.com/chromium/chromium/tree/9ac9e1044de400849af3353f9a9c87a8df8df455/media/test/data. 80 MB listed. Taken: every audio/video file (images, YUV/raw frame dumps, JSON/HTML and manifests left out).
- **dav1d**: dav1d test data (AV1). Source: https://code.videolan.org/videolan/dav1d-test-data/-/tree/61afa1ceb6029be1a8ea3f6b9c9a9672700f13bb. 50 MB listed. Taken: everything except oss-fuzz/ (sanitizer crash repros, not playable media) and the argon/ entries (pointers into the separately licensed Argon suite).
- **flac-test-files**: IETF CELLAR FLAC decoder test files. Source: https://github.com/ietf-wg-cellar/flac-test-files/tree/aa7b0c6cf32994c106ae517a08134c28a96ff5b2. 310 MB listed. Taken: all of them (about 310 MB).
- **gecko**: Firefox media mochitest files (dom/media/test). Source: https://github.com/mozilla-firefox/firefox/tree/cdc95c93c91b09d3a4c38be355b5ef5bfd631075/dom/media/test. 37 MB listed. Taken: every audio/video file, including crashtests/ and reftest/; left out: dash/ and hls/ (manifest + segment trees), bare .m4s fragments (MSE-only, no init segment) and ^headers^ files.
- **gstreamer**: GStreamer integration test-suite media. Source: https://gstreamer.freedesktop.org/data/media/. 568 MB listed. Taken: every playable file; left out: per-frame reference PNGs and image sequences, HLS/DASH segment trees (bipbop, exMPD_BIP_TC1: need a streaming server), subtitles, scenarios, .media_info, redirect.mp4 and the noise file.
- **h264-conformance**: H.264/AVC conformance bitstreams (JVT). Source: https://fate-suite.ffmpeg.org/h264-conformance/. 140 MB listed. Taken: FATE folders h264-conformance (from the FATE measurements)
- **hevc-conformance**: HEVC/H.265 conformance bitstreams (JCT-VC). Source: https://fate-suite.ffmpeg.org/hevc-conformance/. 84 MB listed. Taken: FATE folders hevc-conformance (from the FATE measurements)
- **libaom**: libaom AV1 decoder test vectors. Source: https://storage.googleapis.com/aom-test-data/. 7 MB listed. Taken: all AV1 decode vectors (about 7 MB); skipped: raw YUV/Y4M encoder inputs (~3.8 GB), fuzzer seed corpora and the invalid-* crash repros. The Argon conformance suite (AOM CWG) is not included: it is ~10 GB of streams behind a separate licence.
- **libvpx**: libvpx VP8/VP9 decoder test vectors. Source: https://storage.googleapis.com/downloads.webmproject.org/test_data/libvpx/. 30 MB listed. Taken: all of them (small: about 30 MB).
- **matroska-test-files**: Matroska test suite (IETF CELLAR). Source: https://github.com/ietf-wg-cellar/matroska-test-files/tree/e6965e5ca666322ed93e2748a10a4f132309e005. 185 MB listed. Taken: all 8 files (about 185 MB).
- **vlc-samples**: VLC samples archive (streams.videolan.org/samples), subset. Source: https://streams.videolan.org/samples/allsamples.txt. 830 MB listed. Taken: the archive is 54 GB and its README asks that bulk fetches over 1 GB be rate-limited, so: one file per codec/format subfolder of V-codecs/, A-codecs/ and game-formats/, and up to 5 files (round-robin over subfolders) from every other top-level folder, and one per archive/container/<format>/ (archive/ is the upload inbox, shown under several views); each the 16 kB-8 MB media file whose size is closest to 512 kB. Left out: fate-suite/ (FFmpeg FATE, measured separately), drivers32/ (codec DLLs), adaptive/ and playlists/ (need a streaming server), RAR volumes/, JPEG-seq/, PNG-seq/, yuv/, raw-video/ (image sequences and headerless frames).
- **vvc-conformance**: VVC/H.266 conformance bitstreams (JVET). Source: https://fate-suite.ffmpeg.org/vvc-conformance/. 4 MB listed. Taken: FATE folders vvc-conformance (from the FATE measurements)
- **wpt**: Web Platform Tests media files. Source: https://github.com/web-platform-tests/wpt/tree/f085a1efc1f58fbe263d384b1e335d656fe58e66. 13 MB listed. Taken: every audio/video file in those three folders (images, captions and manifests left out).

## Biggest libvlc-wasm failure groups per suite

- **fate** (142): no picture (decoder opened, nothing out) (36); decoder produced no picture (buffer deadlock prevented) (21); ES not detected: plays with :demux=<es> (18); avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (17)
- **chromium** (32): no picture (decoder opened, nothing out) (15); demuxer choice: plays with :demux=avformat (7); decoder produced no picture (buffer deadlock prevented) (5); other / no clue in the log (3)
- **flac-test-files** (6): demuxer choice: plays with :demux=avformat (4); missing decoder (codec not in the wasm build) (1); no demuxer accepted the file (1)
- **gecko** (14): decoder produced no picture (buffer deadlock prevented) (5); harness artifact? (audio played, below threshold) (3); demuxer choice: plays with :demux=avformat (2); other / no clue in the log (2)
- **gstreamer** (1): decoder produced no picture (buffer deadlock prevented) (1)
- **hevc-conformance** (19): ES not detected: plays with :demux=<es> (11); decoder produced no picture (buffer deadlock prevented) (4); avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (2); other / no clue in the log (2)
- **libvpx** (1): avcodec get_buffer() failed (pixel format not handled by VLC's avcodec glue) (1)
- **vlc-samples** (29): missing decoder (codec not in the wasm build) (5); decoder produced no picture (buffer deadlock prevented) (5); other / no clue in the log (4); demuxer choice: plays with :demux=avformat (4)
- **vvc-conformance** (32): no picture (decoder opened, nothing out) (32)
