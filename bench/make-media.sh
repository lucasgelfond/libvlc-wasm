#!/bin/sh
# Regenerates bench/media: 5 s of 1080p30 per codec. Temporal noise keeps the
# bitrate (and so the decode work) close to real footage; a clean test pattern
# would compress to almost nothing and flatter every decoder.
set -eu
cd "$(dirname "$0")" && mkdir -p media && cd media
SRC="testsrc2=size=1920x1080:rate=30,noise=alls=10:allf=t+u,format=yuv420p"
enc() { out=$1; shift; [ -s "$out" ] || ffmpeg -loglevel error -y -f lavfi -i "$SRC" -t 5 "$@" "$out"; }
enc h264_1080p.mkv     -c:v libx264 -preset medium -crf 20
enc hevc_1080p.mkv     -c:v libx265 -preset fast -crf 24 -x265-params log-level=error
enc vp9_1080p.webm     -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -deadline good -cpu-used 4
enc av1_1080p.mkv      -c:v libsvtav1 -preset 8 -crf 35 -svtav1-params enable-stat-report=0
enc mpeg2_1080p.mpg    -c:v mpeg2video -b:v 15M -maxrate 20M -bufsize 10M
enc mpeg4asp_1080p.avi -c:v mpeg4 -vtag XVID -q:v 4
enc msmpeg4_1080p.avi  -c:v msmpeg4 -q:v 4
enc mjpeg_1080p.avi    -c:v mjpeg -q:v 5
ls -la
