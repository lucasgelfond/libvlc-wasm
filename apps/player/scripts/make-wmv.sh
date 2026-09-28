#!/bin/sh
# The Windows Media sample (static/samples/story-of-television.wmv): 30
# seconds of The Story of Television (1956, William J. Ganz Co. for RCA;
# Prelinger Archives, public domain) as Windows Media Player 7/8 made clips
# around 2001 -- WMV2 (Windows Media Video 8) and WMA2 in an ASF file, at
# 320x240, a broadband-era size.
# Run it anywhere ffmpeg is installed (or in Docker):
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg curl ca-certificates >/dev/null && sh apps/player/scripts/make-wmv.sh'
set -eu
out="$(cd "$(dirname "$0")/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
# https://archive.org/details/StoryofT1956 (the item's licence: Public Domain)
curl -sSL -o tv.mp4 https://archive.org/download/StoryofT1956/StoryofT1956.mp4
# 5:50 to 6:20: how the picture tube and the camera tube work.
ffmpeg -loglevel error -y -ss 350 -t 30 -i tv.mp4 \
  -vf "scale=320:240:flags=bicubic,setsar=1,fade=in:0:8,fade=out:st=29.5:d=0.5" -af "afade=in:d=0.3,afade=t=out:st=29.5:d=0.5" \
  -r 30000/1001 -c:v wmv2 -b:v 450k -g 150 -c:a wmav2 -b:a 64k -ar 44100 -ac 2 \
  -metadata title="The Story of Television (1956), excerpt" \
  -metadata artist="William J. Ganz Co. for RCA" \
  -metadata copyright="Public domain (Prelinger Archives, archive.org/details/StoryofT1956)" \
  "$out/story-of-television.wmv"
ls -la "$out/story-of-television.wmv"
