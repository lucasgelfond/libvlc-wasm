# Five corpus samples that play in neither desktop VLC nor libvlc-wasm

Investigated 2026-09-27 against VLC master `b119179` (the `build.sh` pin) and the FFmpeg 9.0
contrib in `libvlc-wasm-cache`. Tools used: native ffmpeg/ffprobe 9.0.2, desktop VLC 3.0.24 with
dummy outputs, and `tests/node-play.mjs` (the current wasm build under Node, `--aout=adummy`).
Proposed diffs are in `.scratch/proposed-patches/`. The VLC ones apply with `patch -p1` in
`/cache/vlc` and the libvlc-wasm one with `git apply`. None of them has been built.

| Sample | Root cause | Fixable? | Patch |
|---|---|---|---|
| ms-screen-codec-2-wmv9-screen | EOF is declared while the vout still holds an unshown picture, and the page then drops or clears it | yes | `vout-eof-waits-for-pending-picture.patch` + `libvlc-wasm-keep-last-frame-on-ended.patch` |
| vivo-2-vivoactive | the video is a proprietary H.263 variant; the audio fails only because VLC has no Siren fourcc | audio yes, video no | `avcodec-siren-fourcc.patch` |
| playstation-str-mdec-xa | VLC's avformat probe peeks 2261 bytes, less than one 2352-byte CD sector | yes | `avformat-probe-psxstr.patch` |
| hevc-main10-dolby-vision-p7-in-mkv | the frame *is* displayed; the page wipes it on `stopped` | yes (page side) | `libvlc-wasm-keep-last-frame-on-ended.patch` |
| dvb-subtitles-in-ts | there is no video or audio in the file, only PAT, PMT and one DVB subtitle PID | no picture exists; subtitles-only rendering would be a feature | none |

---

## 1. MS Screen Codec 2 (`mss2_2.wmv`)

**What the file is.** Two MSS2 packets, both keyframes: pts 0 and pts 3.000 s, 11038 bytes each and
identical (ffmpeg framecrc gives the same CRC). The duration is 3.033 s.

**What happens** (wasm log, `tests/node-play.mjs`, `LOGS=1`):

```
0.157 EOF reached / Stream buffering done (200 ms in 0 ms)
0.165 Received first picture          <- forced picture queued to the vout
0.165 buffer deadlock prevented       <- avcodec frame threads still hold pic 1; benign
      stopping reason=1 (ended)       <- about 1 ms later
```

`framesDisplayed` from webframe is 1, but the page's `framesDrawn` is 0. VLC handed the frame to
the display, but the display was closed before the page's next `requestAnimationFrame` could upload it.

**Root cause (VLC).** At EOF, `src/input/input.c:696` waits only for `es_out_IsEmpty()`. That calls
`vlc_input_decoder_IsEmpty()` → `vlc_input_decoder_IsDrainedLocked()` (`src/input/decoder.c:2715`),
which for video is `vout_IsEmpty()` (`src/video_output/video_output.c:282`), and that checks only
`decoder_fifo`. `PreparePicture()` (`video_output.c:1076-1078`) pops a picture from the fifo *before*
`RenderPicture()` waits for its deadline (`video_output.c:1470-1520`). So from the moment the vout
thread picks up the last picture, the input already treats the stream as finished. It sends EOF and
the player tears the vout down. Here that means picture 1, due at 3 s, is never shown, and picture 0
is on screen for about 1 ms.

Desktop VLC 3.0.24 does the same thing ("EOF reached", "Received first picture", "killing decoder",
"destroying useless vout"), so the window never shows the picture.

**Fix.** `vout-eof-waits-for-pending-picture.patch` adds an atomic `render_pending` to the vout. It is
set under the fifo lock at the moment `PreparePicture()` pops a picture, and cleared when the
display step (`DisplayPicture` / `DisplayNextFrame`) returns. `vout_IsEmpty()` returns
`fifo empty && !render_pending`. Because the flag is always cleared on exit from the display step,
it cannot hold EOF open for longer than one picture's wait, so it cannot hang. With the patch the input
signals EOF only once picture 1 is on screen, which gives about 3 s of playback as the file intends.
The page-side patch below is also needed so that the last picture stays visible after `ended`.

One side effect to keep in mind: `EsOutDrainDecoder(..., wait=true)` also polls `vout_IsEmpty`,
so a drain now waits for the in-flight picture as well. That costs at most one frame interval.

**Confidence:** high on the root cause (it matches the code, the wasm log and the VLC 3 log). Medium-high that the two
patches together make the harness pass, since nothing has been built.

## 2. Vivo 2 (`5TH_1.VIV`)

**Container.** The header says `Version:Vivo/2.00`, 320x240, 15.68 fps. The audio is Siren (16 kHz, mono). FFmpeg's `vivo`
demuxer (`libavformat/vivo.c:236-247`) assigns H.263 video only for version 1. For version 2 it
leaves the video codec_id unset, so ffprobe reports `unknown`.

**Is Vivo 2 video H.263?** Partly. Every video packet starts with an H.263 picture start code
(`00 00 80 …`), and TR and PTYPE parse cleanly. The source-format field, however, is `110`, which is
reserved in H.263v1. FFmpeg's `ituh263dec.c:1143` treats format 6 as H.263+ and fails with
"Bad UFEP type (2)/(6)". I built a patched FFmpeg in the scratchpad: the vivo demuxer tags version 2
video as H.263 with tag `VIV2`, and the decoder reads format 6 as "v1 syntax, size taken from the
container". With that change every picture header parses as sensible H.263v1 (I/P types, UMV, QP),
but the **macroblock layer diverges at once**: the first I-frame fails at MB 0 ("I cbpc damaged at 0 0"),
and 1448 of about 1660 frames are corrupt. Skipping 0 to 48 extra header bits does not help. The result
is coloured noise. Vivo 2 video is a proprietary H.263 derivative. Without reverse-engineering its MB/VLC
layer, no codec-tag override or small decoder patch will make it decode. **Not fixable cheaply.**

**What can be fixed: the audio.** In wasm, both tracks show up as `undf`. That is because
`modules/codec/avcodec/fourcc.c` has no mapping for `AV_CODEC_ID_SIREN`. The Siren decoder is in
our FFmpeg build (`CONFIG_SIREN_DECODER 1`), and native ffmpeg decodes the audio (the corpus
reference measures a peak of −41.5 dB). `avcodec-siren-fourcc.patch` adds `VLC_CODEC_SIREN` (`sirn`) to
`vlc_fourcc.h`, `fourcc_list.h` and the avcodec table. Afterwards the sample plays as audio only,
which beats desktop VLC. The test should then change from `expectFail` to an audio-only
expectation. **Confidence:** high for the audio; high that the video is out of reach.

## 3. PlayStation STR (`descent-partial.str`)

**Root cause.** `avformat_ProbeDemux()` (`modules/demux/avformat/demux.c:286`) peeks only
`2048 + 213` bytes. FFmpeg's `str_probe()` returns 0 when `buf_size < RAW_CD_SECTOR_SIZE` (2352),
so libavformat can never recognise psxstr through VLC. Checked with truncated copies: at 2261 bytes
ffprobe fails, and at 37676 bytes it gives `psxstr`, score 50. Desktop VLC logs "avcodec demux:
couldn't guess format" even with `--demux=avformat`, and then falls through to the `ps` demuxer, which
finds a bogus mpga stream. The rest of the chain is already in place: `fourcc.c:106` maps MDEC, `fourcc.c:386`
maps ADPCM_XA, our FFmpeg has the `str` demuxer and both decoders, and the psxstr `.str/.xa/.xai`
extension guard (`demux.c:346`) passes because the wasm MRL keeps the filename. As proof, desktop VLC with
`--avformat-format=psxstr` plays it: MDEC and adpcm_xa decoders start and it runs to EOF.

**Fix.** `avformat-probe-psxstr.patch`: when the 2 KiB probe finds nothing, peek
16 sectors + 44 bytes (37676) once and retry with `av_probe_input_format2()`, accepting only a score above
`AVPROBE_SCORE_RETRY` (25). That keeps low-confidence guesses from taking files away from VLC's own
lower-priority demuxers. **Workaround with no rebuild:** open the media with the option
`:avformat-format=psxstr`. **Confidence:** high.

## 4. HEVC Main10 Dolby Vision P7 in MKV (`dovi-p7-hvce.mkv`)

**The known-issue note is wrong: the frame is not dropped.** In the corpus result `framesDrawn` is 1,
and under Node, webframe's `framesDisplayed` is 1 with no "picture is too late" warning. What happens:
the demuxer hits EOF at once, and buffering ends before the 4K frame decodes ("buffer deadlock
prevented"). As a result the picture is not the forced first picture, but it still goes through
`RenderPicture()` and reaches `Display`. Then the player reaches `ended` → `stopped`, and
`packages/core/src/player.js:553` calls `renderer.clear()` on every `stopped`. The harness polls every 100 ms
and only ever sees the cleared canvas (`maxVariance: 0`, a black snapshot). Native ffmpeg decodes the
frame fine; it is the base layer, BT.2020/PQ, with real picture content. Desktop VLC 3 fails in the same
way: it closes the video window at stop.

**Fix (libvlc-wasm, not VLC).** `libvlc-wasm-keep-last-frame-on-ended.patch`:
- `player.js`: record the stop reason, and do not clear the canvas when playback `ended` by itself, as
  `<video>` does. A user stop still clears it.
- `webframe.c` `Close()`: before unpublishing and freeing the buffers, wait up to 100 ms for the page to
  upload the frame it has not seen yet. The unused `locked` field (slot 23) becomes `drawn`, which
  `renderer.js` sets after each upload. Without this, a clip that ends within one animation frame of its
  last picture can lose it, which is exactly what happened to MSS2 in the browser.

The vout patch from sample 1 makes this safe regardless of timing. **Confidence:** high.

## 5. DVB subtitles in TS (`dvbsubtest_filter.ts`)

**What the file is.** 420 TS packets: PID 0 (PAT) ×56, PID 0x10 (PMT) ×56, PID 0x19B1 (DVB
subtitles) ×308, forming 46 PES packets. The PMT declares MPEG-2 video on 0x1901 (also the PCR PID) and MP3 on
0x19A1, but **neither PID carries a single packet**. The file is FFmpeg's fixture for the dvbsub
filter test, with everything except the subtitle PID stripped. There is no IDR or keyframe, no PCR,
and no picture data at all, so no amount of error concealment can recover a picture (ffmpeg finds
0 video packets). The subtitles themselves are valid. `ffmpeg -filter_complex "color=black:s=720x576[c];[c][0:s]overlay"`
renders about 20 distinct subtitle bitmaps over 31.9 s.

**In VLC.** The TS demuxer creates mpgv, mpga and dvbs ES from the PMT and then logs "No PCR received …
workaround using pid 8191". The dvbs track is not selected by default, and even if it were, VLC 4
only renders SPUs onto the vout of a video ES. No video ES decodes, so no vout ever exists.

**What would be needed.** This is a feature: "render subtitles without video". Options, from smallest up:
- (page) select the dvbs track and give the page a subtitle-only surface. There is no hook for it today,
  because SPUs are blended in the vout.
- (VLC) in `src/input/decoder.c`, when an SPU decoder finds no vout, create one from the subtitle's
  display definition (720x576 here) and feed it black frames on the SPU clock. That is roughly 150 lines,
  touches clock and vout lifetime, and carries medium-low confidence.

Recommendation: reclassify the corpus entry. It is a subtitle-only fragment, not a video, so
`expectFail` should say "no video/audio payload; only the subtitle PID is present" rather than blaming the
fragment's size. **Confidence:** high on the diagnosis.
