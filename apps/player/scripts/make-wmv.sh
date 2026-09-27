#!/bin/sh
# The Windows Media sample (static/samples/elephants-dream.wmv): 30 s of
# Elephants Dream (Blender Foundation / Netherlands Media Art Institute, 2006,
# CC BY 2.5) as Windows Media Player 7/8 made it around 2001 -- WMV2 (Windows
# Media Video 8) and WMA2 in an ASF file, at a dial-up-to-broadband size.
# Run it anywhere ffmpeg is installed (or in Docker):
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg curl ca-certificates >/dev/null && sh apps/player/scripts/make-wmv.sh'
set -eu
out="$(cd "$(dirname "$0")/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
curl -sSL -o ed.mov https://download.blender.org/ED/elephantsdream-480-h264-st-aac.mov
ffmpeg -loglevel error -y -ss 7:00 -t 30 -i ed.mov \
  -vf "scale=480:270:flags=bicubic,setsar=1" -r 24 -c:v wmv2 -b:v 600k -g 120 \
  -c:a wmav2 -b:a 64k -ar 44100 -ac 2 \
  -metadata title="Elephants Dream (excerpt)" \
  -metadata artist="Blender Foundation / Netherlands Media Art Institute" \
  -metadata copyright="(c) 2006 Blender Foundation / Netherlands Media Art Institute / www.elephantsdream.org, CC BY 2.5" \
  "$out/elephants-dream.wmv"
ls -la "$out/elephants-dream.wmv"
