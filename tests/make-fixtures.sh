#!/bin/sh
# Small generated files the smoke tests use (corpus/media/gen). Needs ffmpeg
# with libx264, libopus and libmp3lame.
set -eu
cd "$(dirname "$0")/../corpus/media" && mkdir -p gen && cd gen
q="-loglevel error -y"
cat > subs.ass <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,36,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.50,0:00:04.00,Default,,0,0,0,,{\an8}Hello from {\c&H00FF00&}libass{\c} in wasm
ASS
V="-f lavfi -i testsrc2=size=640x360:rate=25"
ffmpeg $q $V -f lavfi -i sine=frequency=440:sample_rate=48000 -t 5 -c:v mpeg2video -b:v 2M -c:a ac3 -f mpegts t_mpeg2_ac3.ts
ffmpeg $q $V -f lavfi -i sine=frequency=330 -i subs.ass -t 5 -map 0 -map 1 -map 2 -c:v libx264 -c:a libopus -c:s ass t_h264_opus_ass.mkv
ffmpeg $q -f lavfi -i testsrc2=size=320x240:rate=15 -f lavfi -i sine=frequency=550:sample_rate=22050 -t 5 -c:v wmv2 -c:a wmav2 t_wmv2.wmv
ffmpeg $q -f lavfi -i testsrc2=size=320x240:rate=25 -f lavfi -i sine=frequency=500:sample_rate=44100 -t 5 -c:v mpeg4 -vtag XVID -c:a libmp3lame -b:a 128k t_xvid_mp3.avi
ffmpeg $q $V -frames:v 3 -c:v libx264 t_3frames.mkv
ffmpeg $q $V -frames:v 1 -c:v libx264 t_1frame.mkv
ls -la
cat > chapters.txt <<'CH'
;FFMETADATA1
title=Chapter test
[CHAPTER]
TIMEBASE=1/1000
START=0
END=2000
title=Opening
[CHAPTER]
TIMEBASE=1/1000
START=2000
END=4000
title=Middle
[CHAPTER]
TIMEBASE=1/1000
START=4000
END=6000
title=End
CH
ffmpeg $q $V -f lavfi -i sine=frequency=660 -i chapters.txt -t 6 -map 0 -map 1 -map_metadata 2 -c:v libx264 -c:a libopus t_chapters.mkv
