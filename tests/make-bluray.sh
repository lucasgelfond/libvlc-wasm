#!/bin/sh
# An unencrypted Blu-ray image for the tests (corpus/media/gen/t_bluray.iso):
# one playlist of H.264 + AC-3 with three chapters, authored with tsMuxer.
# Run it in Docker (or with ffmpeg, unzip and curl installed, on x86_64 Linux):
#   docker run --rm --platform linux/amd64 -v "$PWD":/w -w /w debian:trixie sh -c \
#     'apt-get update -qq && apt-get install -y -qq ffmpeg curl unzip ca-certificates >/dev/null && sh tests/make-bluray.sh'
set -eu
out="$(cd "$(dirname "$0")/.." && pwd)/corpus/media/gen"
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
q="-loglevel error -y"

TSMUXER_URL=https://github.com/justdan96/tsMuxer/releases/download/2.7.0/tsMuxer-2.7.0-linux.zip
TSMUXER_SHA256=ceaaa181ab70e201685b1e45260d337d1cbdb0aba1408d4fbc47e232a7e4c987
curl -sSL -o tsmuxer.zip "$TSMUXER_URL"
echo "$TSMUXER_SHA256  tsmuxer.zip" | sha256sum -c - >/dev/null
unzip -q tsmuxer.zip && chmod +x tsMuxeR

# 720p24 is a Blu-ray format; a low bitrate keeps the image small.
ffmpeg $q -f lavfi -i "testsrc2=size=1280x720:rate=24000/1001" -t 9 \
  -c:v libx264 -profile:v high -level 4.1 -b:v 800k -maxrate 2M -bufsize 2M \
  -x264-params "bluray-compat=1:keyint=24:open-gop=0" -pix_fmt yuv420p -f h264 video.h264
ffmpeg $q -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 9 -ac 2 -c:a ac3 -b:a 192k audio.ac3
cat > disc.meta <<META
MUXOPT --blu-ray --custom-chapters=00:00:00.000;00:00:03.000;00:00:06.000 --label=LIBVLC_WASM_BD
V_MPEG4/ISO/AVC, "video.h264", fps=23.976
A_AC3, "audio.ac3", lang=eng
META
./tsMuxeR disc.meta "$out/t_bluray.iso" >/dev/null
ls -la "$out/t_bluray.iso"
