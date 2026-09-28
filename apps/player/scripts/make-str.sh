#!/bin/sh
# The PlayStation sample (static/samples/a-is-for-atom.str): 30 seconds of
# A Is for Atom (1953, John Sutherland Productions for General Electric;
# Prelinger Archives, public domain) encoded the way PlayStation games stored
# their cutscenes -- MDEC (BS v2) video at 320x240, 15 fps, interleaved with
# XA-ADPCM audio (37.8 kHz stereo), in raw 2352-byte CD sectors, paced for a
# 1x CD-ROM drive. The encoder is psxavenc (WonderfulToolchain, zlib licence),
# built here from a pinned commit.
# psxavenc fits the picture to the input's aspect ratio but writes the sector
# headers with the size it was asked for, so the input is made exactly 320x240
# first (the film is 4:3, so this is only a scale).
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

# https://archive.org/details/isforAto1953 (the item's licence: Public Domain)
curl -sSL -o atom.mp4 https://archive.org/download/isforAto1953/isforAto1953.mp4
# 7:00 to 7:30: splitting the atom, and E = mc².
ffmpeg -loglevel error -y -ss 420 -t 30 -i atom.mp4 \
  -vf "scale=320:240:flags=lanczos,setsar=1,fade=in:0:8,fade=out:st=29.5:d=0.5" -af "afade=in:d=0.3,afade=t=out:st=29.5:d=0.5" \
  -r 15 -c:v ffv1 -c:a pcm_s16le -ar 37800 -ac 2 cut.mkv
./psxavenc/build/psxavenc -q -t strcd -x 1 -v v2 -f 37800 -b 4 -c 2 -r 15 -s 320x240 cut.mkv "$out/a-is-for-atom.str"
ls -la "$out/a-is-for-atom.str"
