#!/bin/sh
# The PlayStation sample (static/samples/sintel-psx.str): 28 s of the Sintel
# trailer (Blender Foundation, CC BY 3.0) encoded the way PlayStation games
# stored their cutscenes -- MDEC (BS v2) video at 320x240, 15 fps, interleaved
# with XA-ADPCM audio (37.8 kHz stereo), in raw 2352-byte CD sectors, paced
# for a 1x CD-ROM drive. The encoder is psxavenc (WonderfulToolchain, zlib
# licence), built here from a pinned commit.
# psxavenc fits the picture to the input's aspect ratio but writes the sector
# headers with the size it was asked for, so the input is made exactly 320x240
# first (cropped to 16:9 and letterboxed, as PlayStation cutscenes often were).
# Run it in Docker:
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg git curl ca-certificates build-essential pkg-config meson ninja-build \
#       libavcodec-dev libavformat-dev libswresample-dev libswscale-dev libavutil-dev >/dev/null &&
#     sh apps/player/scripts/make-str.sh'
set -eu
out="$(cd "$(dirname "$0")/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"

git clone -q https://github.com/WonderfulToolchain/psxavenc
git -C psxavenc checkout -q 82f3871c5fe5e82e71016a6636aba25ddddf2ca8
(cd psxavenc && meson setup build >/dev/null && ninja -C build >/dev/null)

curl -sSL -o trailer.mp4 https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4
# From after the Blender Foundation logo to before the title card; the picture
# inside the trailer's letterbox is 848x352 at (4,64).
ffmpeg -loglevel error -y -ss 11.5 -t 28.5 -i trailer.mp4 \
  -vf "crop=624:352:115:64,scale=320:180:flags=lanczos,pad=320:240:0:30,setsar=1" -r 15 \
  -c:v ffv1 -c:a pcm_s16le -ar 37800 -ac 2 cut.mkv
./psxavenc/build/psxavenc -q -t strcd -x 1 -v v2 -f 37800 -b 4 -c 2 -r 15 -s 320x240 cut.mkv "$out/sintel-psx.str"
ls -la "$out/sintel-psx.str"
