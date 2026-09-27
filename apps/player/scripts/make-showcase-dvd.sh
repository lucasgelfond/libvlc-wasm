#!/bin/sh
# The showcase DVD in the sample menu (static/samples/showcase.iso): a disc
# that exercises what DVD playback involves --
#   * a main menu with three buttons: Play, Chapters, Extras
#   * a chapter-select menu (three chapters, and Back)
#   * a 36-second feature in three chapters, with two audio languages
#     (English, Spanish) and two subtitle tracks
#   * an extra as a second title
# Run it in Docker (or with ffmpeg, dvdauthor/spumux, genisoimage, ImageMagick
# and the DejaVu fonts installed):
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg dvdauthor genisoimage imagemagick fonts-dejavu-core >/dev/null &&
#     sh apps/player/scripts/make-showcase-dvd.sh'
set -eu
out="$(cd "$(dirname "$0")/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
BOLD=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
q="-loglevel error -y"
# DVD bitrates are generous; a sample file should stay small.
DVD="-target ntsc-dvd -aspect 16:9 -b:v 1500k -maxrate 2500k -bufsize 1835k -b:a 128k"

# -- Feature: three 12-second chapters, each its own picture ---------------
chapter() { # $1 index, $2 lavfi source, $3 caption
  ffmpeg $q -f lavfi -i "$2,scale=720:480,setsar=32/27,drawtext=fontfile=$BOLD:text='Chapter $1':x=40:y=40:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=12,drawtext=fontfile=$FONT:text='$3':x=40:y=92:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=8" \
    -t 12 -r 30000/1001 -pix_fmt yuv420p -c:v rawvideo -f nut "ch$1.nut"
}
chapter 1 "mandelbrot=size=720x480:rate=30000/1001" "The Mandelbrot set, zooming"
chapter 2 "life=size=180x120:rate=30000/1001:mold=10:ratio=0.35:death_color=#1a1a2e:life_color=#ff7a00" "Conway's Game of Life"
chapter 3 "testsrc2=size=720x480:rate=30000/1001" "A test card"
printf "file 'ch1.nut'\nfile 'ch2.nut'\nfile 'ch3.nut'\n" > chapters.txt
# Two audio languages: a chord in English, a different one in Spanish.
ffmpeg $q -f concat -i chapters.txt \
  -f lavfi -i "aevalsrc=0.2*sin(2*PI*220*t)+0.15*sin(2*PI*277*t)+0.12*sin(2*PI*330*t):s=48000:c=stereo" \
  -f lavfi -i "aevalsrc=0.2*sin(2*PI*196*t)+0.15*sin(2*PI*247*t)+0.12*sin(2*PI*294*t):s=48000:c=stereo" \
  -map 0:v -map 1:a -map 2:a -t 36 $DVD feature.mpg

# Two subtitle tracks, rendered by spumux from text.
cat > en.srt <<'SRT'
1
00:00:01,000 --> 00:00:05,000
Welcome to a DVD playing in your browser.

2
00:00:06,000 --> 00:00:11,000
libvlc-wasm runs VLC's own DVD navigation.

3
00:00:13,000 --> 00:00:22,000
Chapter two: switch the audio or the subtitles in the Tracks tab.

4
00:00:25,000 --> 00:00:35,000
Chapter three. When it ends, the disc returns to its menu.
SRT
cat > es.srt <<'SRT'
1
00:00:01,000 --> 00:00:05,000
Bienvenido a un DVD en tu navegador.

2
00:00:06,000 --> 00:00:11,000
libvlc-wasm usa la navegación de DVD de VLC.

3
00:00:13,000 --> 00:00:22,000
Capítulo dos: cambia el audio o los subtítulos.

4
00:00:25,000 --> 00:00:35,000
Capítulo tres. Al terminar, vuelve al menú.
SRT
mkdir -p "$HOME/.spumux" && cp "$FONT" "$HOME/.spumux/"
for i in 0 1; do
  lang=$([ $i = 0 ] && echo en || echo es)
  cat > sub$i.xml <<XML
<subpictures format="NTSC"><stream>
  <textsub filename="$lang.srt" characterset="UTF-8" fontsize="26.0" font="DejaVuSans.ttf"
    horizontal-alignment="center" vertical-alignment="bottom" bottom-margin="36"
    subtitle-fps="29.97" movie-fps="29.97" movie-width="720" movie-height="480" />
</stream></subpictures>
XML
done
spumux -s 0 sub0.xml < feature.mpg > feature_s0.mpg 2>/dev/null
spumux -s 1 sub1.xml < feature_s0.mpg > feature_subs.mpg 2>/dev/null

# -- Extra: a short second title ---------------------------------------------
ffmpeg $q -f lavfi -i "smptehdbars=size=720x480:rate=30000/1001,setsar=32/27,drawtext=fontfile=$BOLD:text='Extras':x=(w-text_w)/2:y=60:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=14" \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000" -t 8 $DVD extra.mpg

# -- Menus: a still background with labelled boxes, buttons from spumux -----
# box geometry in 720x480 video pixels
menu_bg() { # $1 name, $2 title, $3 subtitle, then label:x0:y0 triples
  name=$1; title=$2; sub=$3; shift 3
  draw=""
  for b in "$@"; do
    label=${b%%:*}; rest=${b#*:}; x=${rest%%:*}; y=${rest#*:}
    draw="$draw,drawbox=x=$x:y=$y:w=180:h=64:t=fill:c=0x2a2f45,drawtext=fontfile=$BOLD:text='$label':x=$x+(180-text_w)/2:y=$y+(64-text_h)/2:fontsize=26:fontcolor=white"
  done
  ffmpeg $q -f lavfi -i "color=c=0x14161f:s=720x480:r=30000/1001,drawbox=x=0:y=0:w=720:h=8:t=fill:c=0xff7a00,drawtext=fontfile=$BOLD:text='$title':x=60:y=110:fontsize=54:fontcolor=white,drawtext=fontfile=$FONT:text='$sub':x=62:y=180:fontsize=24:fontcolor=0xb8bccb$draw" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" -t 1 $DVD "${name}_bg.mpg"
  for kind in normal:'#ffffff30' highlight:'#ff7a00' select:'#ffd08a'; do
    k=${kind%%:*}; colour=${kind#*:}
    args=""
    for b in "$@"; do
      rest=${b#*:}; x=${rest%%:*}; y=${rest#*:}
      args="$args -draw \"rectangle $((x+3)),$((y+3)) $((x+177)),$((y+61))\""
    done
    eval convert -size 720x480 xc:none -fill none -stroke "'$colour'" -strokewidth 5 $args PNG8:"${name}_$k.png"
  done
}
menu_bg main "libvlc-wasm" "A DVD, playing in your browser" "Play:60:320" "Chapters:270:320" "Extras:480:320"
menu_bg chapters "Chapters" "Pick a scene" "Mandelbrot:60:260" "Life:270:260" "Test card:480:260" "Back:270:360"

cat > main.xml <<'XML'
<subpictures format="NTSC"><stream>
  <spu start="00:00:00.00" force="yes" image="main_normal.png" highlight="main_highlight.png" select="main_select.png">
    <button name="play" x0="60" y0="320" x1="240" y1="384" right="chapters"/>
    <button name="chapters" x0="270" y0="320" x1="450" y1="384" left="play" right="extras"/>
    <button name="extras" x0="480" y0="320" x1="660" y1="384" left="chapters"/>
  </spu>
</stream></subpictures>
XML
cat > chapters.xml <<'XML'
<subpictures format="NTSC"><stream>
  <spu start="00:00:00.00" force="yes" image="chapters_normal.png" highlight="chapters_highlight.png" select="chapters_select.png">
    <button name="c1" x0="60" y0="260" x1="240" y1="324" right="c2" down="back"/>
    <button name="c2" x0="270" y0="260" x1="450" y1="324" left="c1" right="c3" down="back"/>
    <button name="c3" x0="480" y0="260" x1="660" y1="324" left="c2" down="back"/>
    <button name="back" x0="270" y0="360" x1="450" y1="424" up="c2"/>
  </spu>
</stream></subpictures>
XML
spumux main.xml < main_bg.mpg > main.mpg 2>/dev/null
spumux chapters.xml < chapters_bg.mpg > chaptersmenu.mpg 2>/dev/null

cat > dvd.xml <<'XML'
<dvdauthor>
  <vmgm>
    <fpc>jump menu 1;</fpc>
    <menus>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <pgc entry="title">
        <button name="play">jump title 1;</button>
        <button name="chapters">jump titleset 1 menu;</button>
        <button name="extras">jump title 2;</button>
        <vob file="main.mpg" pause="inf"/>
      </pgc>
    </menus>
  </vmgm>
  <titleset>
    <!-- Chapter jumps are only allowed from a titleset's own menus. -->
    <menus>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <pgc entry="root">
        <button name="c1">jump title 1 chapter 1;</button>
        <button name="c2">jump title 1 chapter 2;</button>
        <button name="c3">jump title 1 chapter 3;</button>
        <button name="back">jump vmgm menu 1;</button>
        <vob file="chaptersmenu.mpg" pause="inf"/>
      </pgc>
    </menus>
    <titles>
      <video format="ntsc" aspect="16:9" widescreen="nopanscan"/>
      <audio lang="en"/>
      <audio lang="es"/>
      <subpicture lang="en"/>
      <subpicture lang="es"/>
      <pgc>
        <vob file="feature_subs.mpg" chapters="0,0:12,0:24"/>
        <post>call vmgm menu 1;</post>
      </pgc>
      <pgc>
        <vob file="extra.mpg"/>
        <post>call vmgm menu 1;</post>
      </pgc>
    </titles>
  </titleset>
</dvdauthor>
XML
VIDEO_FORMAT=NTSC dvdauthor -o dvd -x dvd.xml 2>&1 | grep -E '^ERR' || true
genisoimage -quiet -dvd-video -V LIBVLC_WASM -o "$out/showcase.iso" dvd
ls -la "$out/showcase.iso"
