#!/bin/sh
# An unencrypted Blu-ray image, authored with tsMuxer: one playlist of H.264 +
# AC-3 with three chapters. By default the test fixture (corpus/media/gen/
# t_bluray.iso, a 9 s test pattern); with SOURCE (a video file or URL) it cuts
# SECONDS from it at START -- the app's sample is a minute of Big Buck Bunny:
#   SOURCE=https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov \
#   START=60 SECONDS=60 OUT=apps/player/static/samples/bluray.iso sh tests/make-bluray.sh
# Run it in Docker (or with ffmpeg, unzip and curl installed, on x86_64 Linux):
#   docker run --rm --platform linux/amd64 -v "$PWD":/w -w /w debian:trixie sh -c \
#     'apt-get update -qq && apt-get install -y -qq ffmpeg curl unzip ca-certificates >/dev/null && sh tests/make-bluray.sh'
set -eu
top="$(cd "$(dirname "$0")/.." && pwd)"
dst="$top/${OUT:-corpus/media/gen/t_bluray.iso}"
mkdir -p "$(dirname "$dst")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
q="-loglevel error -y"

TSMUXER_URL=https://github.com/justdan96/tsMuxer/releases/download/2.7.0/tsMuxer-2.7.0-linux.zip
TSMUXER_SHA256=ceaaa181ab70e201685b1e45260d337d1cbdb0aba1408d4fbc47e232a7e4c987
curl -sSL -o tsmuxer.zip "$TSMUXER_URL"
echo "$TSMUXER_SHA256  tsmuxer.zip" | sha256sum -c - >/dev/null
unzip -q tsmuxer.zip && chmod +x tsMuxeR

# 720p24 is a Blu-ray format; a modest bitrate keeps the image small.
N=${SECONDS:-9}
if [ -n "${SOURCE:-}" ]; then
  V="-ss ${START:-0} -i $SOURCE -vf scale=1280:720,fps=24000/1001"
  A="-ss ${START:-0} -i $SOURCE"
  VB=2500k
else
  V="-f lavfi -i testsrc2=size=1280x720:rate=24000/1001"
  A="-f lavfi -i sine=frequency=440:sample_rate=48000"
  VB=800k
fi
ffmpeg $q $V -t "$N" -an -c:v libx264 -profile:v high -level 4.1 -b:v $VB -maxrate 4M -bufsize 4M \
  -x264-params "bluray-compat=1:keyint=24:open-gop=0" -pix_fmt yuv420p -f h264 video.h264
ffmpeg $q $A -t "$N" -vn -ac 2 -ar 48000 -c:a ac3 -b:a 192k audio.ac3
third=$(awk "BEGIN { printf \"%02d\", $N / 3 }"); two=$(awk "BEGIN { printf \"%02d\", 2 * $N / 3 }")
cat > disc.meta <<META
MUXOPT --blu-ray --custom-chapters=00:00:00.000;00:00:$third.000;00:00:$two.000 --label=LIBVLC_WASM_BD
V_MPEG4/ISO/AVC, "video.h264", fps=23.976
A_AC3, "audio.ac3", lang=eng
META
./tsMuxeR disc.meta "$dst" >/dev/null
ls -la "$dst"
