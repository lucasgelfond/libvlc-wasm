#!/bin/sh
# An unencrypted DVD-Video image for the DVD tests (corpus/media/gen/t_dvd.iso,
# and the same disc as corpus/media/gen/VIDEO_TS/): a still menu with two
# buttons -- left plays title 1 (6 s, three chapters), right plays title 2
# (3 s) -- NTSC, 16:9, MPEG-2 + AC-3. Needs ffmpeg, dvdauthor (with spumux),
# genisoimage and ImageMagick; or run it in Docker:
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c \
#     'apt-get update -qq && apt-get install -y -qq ffmpeg dvdauthor genisoimage imagemagick >/dev/null && sh tests/make-dvd.sh'
set -eu
# corpus/media is gitignored, so a fresh clone does not have it yet.
mkdir -p "$(dirname "$0")/../corpus/media/gen" && cd "$(dirname "$0")/../corpus/media/gen"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
q="-loglevel error -y"

# Titles.
ffmpeg $q -f lavfi -i testsrc2=size=720x480:rate=30000/1001 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -t 6 -target ntsc-dvd -aspect 16:9 "$tmp/t1.mpg"
ffmpeg $q -f lavfi -i smptebars=size=720x480:rate=30000/1001 -f lavfi -i sine=frequency=660:sample_rate=48000 \
  -t 3 -target ntsc-dvd -aspect 16:9 "$tmp/t2.mpg"

# Menu: a still background with two button boxes (in 720x480 video pixels:
# left x 80-320, right x 400-640, both y 300-380), and the button overlays
# spumux turns into a subpicture: one colour per image, transparent elsewhere.
# The button rectangles are given explicitly: spumux's autooutline="infer"
# silently produced zero-size buttons here.
BOXES="drawbox=x=80:y=300:w=240:h=80:t=fill:c=0x3050a0,drawbox=x=400:y=300:w=240:h=80:t=fill:c=0x3050a0"
ffmpeg $q -f lavfi -i "color=c=0x101828:s=720x480:r=30000/1001,$BOXES" -f lavfi -i anullsrc=r=48000:cl=stereo \
  -t 1 -target ntsc-dvd -aspect 16:9 "$tmp/menu_bg.mpg"
# spumux needs palette-indexed PNGs: it silently drops RGBA ones (empty
# subpicture, invisible highlight), so draw them with ImageMagick as PNG8.
# The normal layer is a faint outline; highlight (hover) yellow; select red.
for kind in normal:'#ffffff40' highlight:yellow select:red; do
  name=${kind%%:*}; colour=${kind#*:}
  convert -size 720x480 xc:none -fill none -stroke "$colour" -strokewidth 6 \
    -draw "rectangle 83,303 317,377" -draw "rectangle 403,303 637,377" PNG8:"$tmp/$name.png"
done
cat > "$tmp/menu.xml" <<'XML'
<subpictures format="NTSC">
  <stream>
    <spu start="00:00:00.00" force="yes" image="normal.png" highlight="highlight.png" select="select.png">
      <button name="left" x0="80" y0="300" x1="320" y1="380" right="right"/>
      <button name="right" x0="400" y0="300" x1="640" y1="380" left="left"/>
    </spu>
  </stream>
</subpictures>
XML
(cd "$tmp" && spumux menu.xml < menu_bg.mpg > menu.mpg)

cat > "$tmp/dvd.xml" <<'XML'
<dvdauthor>
  <vmgm>
    <fpc>jump menu 1;</fpc>
    <menus>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <pgc entry="title">
        <button name="left">jump title 1;</button>
        <button name="right">jump title 2;</button>
        <vob file="menu.mpg" pause="inf"/>
      </pgc>
    </menus>
  </vmgm>
  <titleset>
    <titles>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <pgc><vob file="t1.mpg" chapters="0,0:02,0:04"/><post>call vmgm menu 1;</post></pgc>
      <pgc><vob file="t2.mpg"/><post>call vmgm menu 1;</post></pgc>
    </titles>
  </titleset>
</dvdauthor>
XML
(cd "$tmp" && VIDEO_FORMAT=NTSC dvdauthor -o dvd -x dvd.xml)
genisoimage -quiet -dvd-video -V WASM_DVD -o t_dvd.iso "$tmp/dvd"
rm -rf VIDEO_TS && cp -r "$tmp/dvd/VIDEO_TS" .   # the same disc as a folder
ls -la t_dvd.iso VIDEO_TS
