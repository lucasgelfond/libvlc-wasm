#!/bin/sh
# An unencrypted DVD-Video image for the DVD tests (corpus/media/gen/t_dvd.iso,
# and the same disc as corpus/media/gen/VIDEO_TS/):
# two titles, the first with three chapters, NTSC MPEG-2 + AC-3. Needs ffmpeg,
# dvdauthor and genisoimage; or run it in Docker:
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c \
#     'apt-get update -qq && apt-get install -y -qq ffmpeg dvdauthor genisoimage >/dev/null && sh tests/make-dvd.sh'
set -eu
cd "$(dirname "$0")/../corpus/media" && mkdir -p gen && cd gen
tmp=$(mktemp -d)
q="-loglevel error -y"
ffmpeg $q -f lavfi -i testsrc2=size=720x480:rate=30000/1001 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -t 6 -target ntsc-dvd -aspect 16:9 "$tmp/t1.mpg"
ffmpeg $q -f lavfi -i smptebars=size=720x480:rate=30000/1001 -f lavfi -i sine=frequency=660:sample_rate=48000 \
  -t 3 -target ntsc-dvd -aspect 16:9 "$tmp/t2.mpg"
cat > "$tmp/dvd.xml" <<'XML'
<dvdauthor>
  <vmgm><menus><pgc entry="title"><pre>jump title 1;</pre></pgc></menus></vmgm>
  <titleset>
    <titles>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <pgc><vob file="t1.mpg" chapters="0,0:02,0:04"/><post>jump title 2;</post></pgc>
      <pgc><vob file="t2.mpg"/><post>exit;</post></pgc>
    </titles>
  </titleset>
</dvdauthor>
XML
(cd "$tmp" && VIDEO_FORMAT=NTSC dvdauthor -o dvd -x dvd.xml >/dev/null 2>&1)
genisoimage -quiet -dvd-video -V WASM_DVD -o t_dvd.iso "$tmp/dvd"
rm -rf VIDEO_TS && cp -r "$tmp/dvd/VIDEO_TS" .   # the same disc as a folder
rm -rf "$tmp"
ls -la t_dvd.iso
