#!/bin/sh
# The DVD in the sample menu (static/samples/design-for-dreaming.iso):
# "Design for Dreaming & other films from the Prelinger Archives", authored
# the way an archival DVD of 1950s industrial films would be --
#   * a main menu over a full-frame motion loop from the film, with the film's
#     own soundtrack under it: Play Film, Scene Selection, a bonus film, Credits
#   * a scene-selection menu with a still from each chapter
#   * the feature: two minutes of Design for Dreaming in three chapters (its
#     opening, the Kitchen of the Future, the highway of the future and its end),
#     with notes as subtitles in English and Spanish
#   * a bonus film (an excerpt of Living Stereo) and a credits title
# All footage and sound are the films' own, both public domain from the
# Prelinger Archives (each item page carries the Public Domain mark):
#   Design for Dreaming (1956)  https://archive.org/details/Designfo1956
#   Living Stereo (1958)        https://archive.org/details/LivingSt1958
# Type: Berkshire Swash (the swash of the film's own title card) and Jost (a
# geometric sans in the Futura manner), both SIL Open Font License, in fonts/.
# Run it in Docker:
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg dvdauthor genisoimage imagemagick python3-fonttools \
#       curl ca-certificates >/dev/null && sh apps/player/scripts/make-dvd.sh'
# SOURCES=<dir> uses Designfo1956.mp4 and LivingSt1958.mp4 from <dir> instead
# of downloading them.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
out="$(cd "$here/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
q="-loglevel error -y"
R=30000/1001
DVD="-target ntsc-dvd -aspect 4:3 -b:a 160k -ac 2"
LOOP=12.012 # one menu loop, 360 frames

if [ -n "${SOURCES:-}" ]; then
  cp "$SOURCES/Designfo1956.mp4" dreaming.mp4
  cp "$SOURCES/LivingSt1958.mp4" stereo.mp4
else
  curl -sSL -o dreaming.mp4 https://archive.org/download/Designfo1956/Designfo1956.mp4
  curl -sSL -o stereo.mp4 https://archive.org/download/LivingSt1958/LivingSt1958.mp4
fi

# -- Type and colour ---------------------------------------------------------
SWASH="$here/fonts/BerkshireSwash-Regular.ttf"
python3 -m fontTools.varLib.instancer -q "$here/fonts/Jost.ttf" wght=500 -o jost-medium.ttf
python3 -m fontTools.varLib.instancer -q "$here/fonts/Jost.ttf" wght=400 -o jost.ttf
# From the film's Technicolor: its night-sky blue, the pale blue of its title
# card, ivory, and the gold of its Motorama trim.
NIGHT='#0b1428'; TITLE='#a9c9ff'; IVORY='#f3ead7'; GOLD='#e2b45a'; CORAL='#e0785a'

# Menus are composed on a 640x480 square-pixel canvas and scaled to DVD's
# 720x480 at the end, so type keeps its proportions on a 4:3 screen. Button
# coordinates are converted with x720 = x640 * 9 / 8.
x720() { echo $(( ($1 * 9 / 8) / 2 * 2 )); }
textw() { # $1 font, $2 size, $3 kerning, $4 text: its width in pixels
  convert -font "$1" -pointsize "$2" -kerning "$3" label:"$4" -format %w info:
}
FINISH="scale=720:480:flags=lanczos,setsar=8/9,format=yuv420p"

# -- Feature: three 40-second chapters of Design for Dreaming ---------------
chapter() { # $1 index, $2 start in the film (s)
  ffmpeg $q -ss "$2" -t 40 -i dreaming.mp4 -filter_complex \
    "[0:v]fps=$R,scale=640:480,fade=in:0:12,fade=out:st=39.5:d=0.5[v];[0:a]aresample=48000,afade=in:d=0.4,afade=t=out:st=39.5:d=0.5[a]" \
    -map "[v]" -map "[a]" -t 40 -c:v ffv1 -c:a pcm_s16le -ac 2 -f nut "ch$1.nut"
  ffmpeg $q -ss 20 -i "ch$1.nut" -frames:v 1 -vf "scale=176:132:flags=lanczos" "still$1.png"
}
chapter 1 0     # the title card, the dream begins
chapter 2 216   # Frigidaire's Kitchen of the Future
chapter 3 516.7 # the highway of the future, and The End
printf "file 'ch1.nut'\nfile 'ch2.nut'\nfile 'ch3.nut'\n" > chapters.txt
ffmpeg $q -f concat -i chapters.txt -vf "$FINISH" -t 120 $DVD -b:v 1250k -maxrate 5000k -bufsize 1835k feature.mpg

# Notes as subtitles, in English and Spanish.
cat > en.srt <<'SRT'
1
00:00:06,000 --> 00:00:11,500
Design for Dreaming (1956): a musical short
made by MPO Productions for General Motors.

2
00:00:14,000 --> 00:00:21,000
A woman dreams her way into GM's Motorama,
the company's show of cars and ideas for the future.

3
00:00:42,000 --> 00:00:48,000
The Kitchen of the Future, by Frigidaire,
then a division of General Motors.

4
00:00:56,000 --> 00:01:03,000
Push-button cooking, as imagined in 1956.

5
00:01:22,000 --> 00:01:28,000
A night drive on the highway of the future.
SRT
cat > es.srt <<'SRT'
1
00:00:06,000 --> 00:00:11,500
Design for Dreaming (1956): un cortometraje musical
de MPO Productions para General Motors.

2
00:00:14,000 --> 00:00:21,000
Una mujer sueña que visita el Motorama de GM,
la exposición de coches e ideas para el futuro.

3
00:00:42,000 --> 00:00:48,000
La Cocina del Futuro, de Frigidaire,
entonces una división de General Motors.

4
00:00:56,000 --> 00:01:03,000
Cocinar apretando botones, tal como se imaginaba en 1956.

5
00:01:22,000 --> 00:01:28,000
Un paseo nocturno por la autopista del futuro.
SRT
mkdir -p "$HOME/.spumux" && cp jost-medium.ttf "$HOME/.spumux/Jost-Medium.ttf"
for i in 0 1; do
  lang=$([ $i = 0 ] && echo en || echo es)
  cat > sub$i.xml <<XML
<subpictures format="NTSC"><stream>
  <textsub filename="$lang.srt" characterset="UTF-8" fontsize="24.0" font="Jost-Medium.ttf"
    horizontal-alignment="center" vertical-alignment="bottom" bottom-margin="36"
    subtitle-fps="29.97" movie-fps="29.97" movie-width="720" movie-height="480" />
</stream></subpictures>
XML
done
spumux -s 0 sub0.xml < feature.mpg > feature_s0.mpg 2>/dev/null
spumux -s 1 sub1.xml < feature_s0.mpg > feature_subs.mpg 2>/dev/null

# -- Bonus film: Living Stereo (1958), its animation of the stereo groove ---
ffmpeg $q -ss 64 -t 30 -i stereo.mp4 -filter_complex \
  "[0:v]fps=$R,scale=640:480,fade=in:0:12,fade=out:st=29.5:d=0.5,$FINISH[v];[0:a]aresample=48000,afade=in:d=0.4,afade=t=out:st=29.5:d=0.5[a]" \
  -map "[v]" -map "[a]" -t 30 $DVD -b:v 1300k -maxrate 5000k -bufsize 1835k bonus.mpg

# -- Menus -------------------------------------------------------------------
# A shade from the left, so the type reads over the footage.
convert \( -size 480x200 xc:"${NIGHT}e0" \) \( -size 480x260 gradient:"${NIGHT}e0"-"${NIGHT}00" \) \
  \( -size 480x180 xc:"${NIGHT}00" \) -append -rotate -90 shade.png
convert -size 640x480 xc:"${NIGHT}b8" dim.png

# Main menu. Button baselines, in 640x480 canvas pixels.
MAIN_LABELS="PLAY FILM|SCENE SELECTION|BONUS FILM: LIVING STEREO|CREDITS"
set -- 262 302 342 382
B1=$1; B2=$2; B3=$3; B4=$4
convert -size 640x480 xc:none \
  \( -size 640x480 xc:none -font "$SWASH" -pointsize 62 -fill '#000000a0' -annotate +47+101 'Design for' -annotate +47+165 'Dreaming' -blur 0x3 \) -composite \
  -font "$SWASH" -pointsize 62 -fill "$TITLE" -annotate +44+98 'Design for' -annotate +44+162 'Dreaming' \
  -font jost-medium.ttf -pointsize 13 -kerning 2.6 -fill "$IVORY" -annotate +47+196 '& OTHER FILMS FROM THE PRELINGER ARCHIVES' \
  -stroke "$GOLD" -strokewidth 1.2 -draw 'line 47,212 196,212' -stroke none \
  -font jost-medium.ttf -pointsize 18 -kerning 2 -fill "$IVORY" \
  -annotate +66+$B1 'PLAY FILM' -annotate +66+$B2 'SCENE SELECTION' \
  -annotate +66+$B3 'BONUS FILM: LIVING STEREO' -annotate +66+$B4 'CREDITS' \
  main_text.png
ffmpeg $q -ss 516.7 -t $LOOP -i dreaming.mp4 -loop 1 -r $R -i shade.png -loop 1 -r $R -i main_text.png -filter_complex \
  "[0:v]fps=$R,scale=640:480,eq=brightness=0.04:saturation=1.1[bg];[bg][1:v]overlay[a];[a][2:v]overlay,fade=in:0:15,fade=out:st=11.5:d=0.5,$FINISH[v];\
   [0:a]aresample=48000,afade=in:d=0.5,afade=t=out:st=11.5:d=0.5[au]" \
  -map "[v]" -map "[au]" -t $LOOP $DVD -b:v 2800k -maxrate 7000k -bufsize 1835k main_bg.mpg

# Scene selection: the Motorama, dimmed, under a still of each chapter.
convert -size 640x480 xc:none \
  -font "$SWASH" -pointsize 46 -fill "$TITLE" -annotate +44+84 'Scene Selection' \
  -stroke "$GOLD" -strokewidth 1.2 -draw 'line 47,104 196,104' -stroke none \
  -fill none -stroke "$IVORY" -strokewidth 2 -draw 'rectangle 39,149 216,282' -draw 'rectangle 231,149 408,282' -draw 'rectangle 423,149 600,282' -stroke none \
  still1.png -geometry +40+150 -composite still2.png -geometry +232+150 -composite still3.png -geometry +424+150 -composite \
  scenes_text.png
cap() { # $1 centre x, $2 text
  w=$(textw jost.ttf 14 1 "$2")
  convert scenes_text.png -font jost.ttf -pointsize 14 -kerning 1 -fill "$IVORY" -annotate +$(($1 - w / 2))+306 "$2" scenes_text.png
}
cap 128 '1  The Dream'
cap 320 '2  Kitchen of the Future'
cap 512 '3  Highway of the Future'
convert scenes_text.png -font jost-medium.ttf -pointsize 18 -kerning 2 -fill "$IVORY" -annotate +66+402 'MAIN MENU' scenes_text.png
ffmpeg $q -ss 60 -t $LOOP -i dreaming.mp4 -loop 1 -r $R -i dim.png -loop 1 -r $R -i scenes_text.png -filter_complex \
  "[0:v]fps=$R,scale=640:480,gblur=sigma=2[bg];[bg][1:v]overlay[a];[a][2:v]overlay,fade=in:0:15,fade=out:st=11.5:d=0.5,$FINISH[v];\
   [0:a]aresample=48000,volume=0.7,afade=in:d=0.5,afade=t=out:st=11.5:d=0.5[au]" \
  -map "[v]" -map "[au]" -t $LOOP $DVD -b:v 2200k -maxrate 7000k -bufsize 1835k scenes_bg.mpg

# Highlights (the subpicture layer): a gold arrow and underline on the chosen
# item, a gold frame on the chosen still; coral while it is being pressed.
# Entries: item:x:baseline:width (canvas pixels) or frame:x0:y0:x1:y1.
highlight() { # $1 output, $2 colour, then entries
  o=$1; c=$2; shift 2
  args=""
  for b in "$@"; do
    set -- $(echo "$b" | tr ':' ' ')
    case $1 in
      frame)
        a=$(x720 $(($2 - 4))); b2=$(x720 $(($4 + 4)))
        args="$args -draw \"rectangle $a,$(($3 - 4)) $b2,$(($3 - 1))\" -draw \"rectangle $a,$(($5 + 1)) $b2,$(($5 + 4))\""
        args="$args -draw \"rectangle $a,$(($3 - 4)) $((a + 3)),$(($5 + 4))\" -draw \"rectangle $((b2 - 3)),$(($3 - 4)) $b2,$(($5 + 4))\"" ;;
      item)
        ax=$(x720 $(($2 - 18))); ux0=$(x720 $2); ux1=$(x720 $(($2 + $4)))
        args="$args -draw \"polygon $ax,$(($3 - 14)) $((ax + 10)),$(($3 - 8)) $ax,$(($3 - 2))\" -draw \"rectangle $ux0,$(($3 + 6)) $ux1,$(($3 + 7))\"" ;;
    esac
  done
  eval convert -size 720x480 xc:none +antialias -fill "'$c'" -stroke none $args PNG8:"$o"
}
w() { textw jost-medium.ttf 18 2 "$1"; }
MAIN_ITEMS="item:66:$B1:$(w 'PLAY FILM') item:66:$B2:$(w 'SCENE SELECTION') item:66:$B3:$(w 'BONUS FILM: LIVING STEREO') item:66:$B4:$(w 'CREDITS')"
SCENE_ITEMS="frame:40:150:216:282 frame:232:150:408:282 frame:424:150:600:282 item:66:402:$(w 'MAIN MENU')"
highlight main_highlight.png "$GOLD" $MAIN_ITEMS
highlight main_select.png "$CORAL" $MAIN_ITEMS
highlight scenes_highlight.png "$GOLD" $SCENE_ITEMS
highlight scenes_select.png "$CORAL" $SCENE_ITEMS
convert -size 720x480 xc:none PNG8:blank.png

# Button rectangles in 720x480 picture pixels.
btn() { # name, baseline, width (canvas): the row from the arrow to the end of the label
  echo "    <button name=\"$1\" x0=\"$(x720 44)\" y0=\"$(($2 - 24))\" x1=\"$(x720 $((66 + $3 + 12)))\" y1=\"$(($2 + 12))\" $4/>"
}
{
  echo '<subpictures format="NTSC"><stream>'
  echo '  <spu start="00:00:00.00" force="yes" image="blank.png" highlight="main_highlight.png" select="main_select.png">'
  btn play $B1 "$(w 'PLAY FILM')" 'down="scenes"'
  btn scenes $B2 "$(w 'SCENE SELECTION')" 'up="play" down="bonus"'
  btn bonus $B3 "$(w 'BONUS FILM: LIVING STEREO')" 'up="scenes" down="credits"'
  btn credits $B4 "$(w 'CREDITS')" 'up="bonus"'
  echo '  </spu></stream></subpictures>'
} > main.xml
{
  echo '<subpictures format="NTSC"><stream>'
  echo '  <spu start="00:00:00.00" force="yes" image="blank.png" highlight="scenes_highlight.png" select="scenes_select.png">'
  echo "    <button name=\"c1\" x0=\"$(x720 32)\" y0=\"142\" x1=\"$(x720 224)\" y1=\"314\" right=\"c2\" down=\"back\"/>"
  echo "    <button name=\"c2\" x0=\"$(x720 224)\" y0=\"142\" x1=\"$(x720 416)\" y1=\"314\" left=\"c1\" right=\"c3\" down=\"back\"/>"
  echo "    <button name=\"c3\" x0=\"$(x720 416)\" y0=\"142\" x1=\"$(x720 608)\" y1=\"314\" left=\"c2\" down=\"back\"/>"
  btn back 402 "$(w 'MAIN MENU')" 'up="c1"'
  echo '  </spu></stream></subpictures>'
} > scenes.xml
spumux main.xml < main_bg.mpg > main.mpg 2>/dev/null
spumux scenes.xml < scenes_bg.mpg > scenesmenu.mpg 2>/dev/null

# -- Credits: two cards over the film's fireworks, with its music -----------
card() { # $1 output, then lines as size:text ('' for a gap)
  o=$1; shift
  args=""; y=0
  for l in "$@"; do
    s=${l%%:*}; t=${l#*:}
    [ -z "$t" ] && { y=$((y + 14)); continue; }
    font=jost.ttf; [ "$s" = T ] && { font=$SWASH; s=40; }
    y=$((y + s + 12))
    cw=$(textw "$font" "$s" 1 "$t")
    args="$args -font '$font' -pointsize $s -kerning 1 -annotate +$((320 - cw / 2))+$y '$t'"
  done
  top=$(((480 - y) / 2))
  eval convert -size 640x480 xc:none -fill "'$IVORY'" $args -page +0+$top -background none -flatten "$o"
}
card credits1.png 'T:Design for Dreaming' '15:1956 · MPO Productions for General Motors' ':' \
  'T:Living Stereo' '15:1958 · The Jam Handy Organization for RCA Victor' ':' \
  '15:From the Prelinger Archives · public domain' '15:archive.org/details/prelinger'
card credits2.png 'T:This Disc' '15:Authored for libvlc-wasm, 2026, and released under CC0' ':' \
  '15:Type: Berkshire Swash and Jost' '15:SIL Open Font License'
ffmpeg $q -ss 396 -t 20 -i dreaming.mp4 -loop 1 -r $R -t 20 -i dim.png -loop 1 -r $R -t 20 -i credits1.png -loop 1 -r $R -t 20 -i credits2.png -filter_complex \
  "[0:v]fps=$R,scale=640:480[bg];[bg][1:v]overlay[a];\
   [2:v]format=rgba,fade=in:st=0.5:d=1:alpha=1,fade=out:st=9:d=1:alpha=1[p1];[3:v]format=rgba,fade=in:st=10.5:d=1:alpha=1,fade=out:st=18.5:d=1:alpha=1[p2];\
   [a][p1]overlay[b];[b][p2]overlay,fade=in:0:15,fade=out:st=19.5:d=0.5,$FINISH[v];\
   [0:a]aresample=48000,afade=in:d=0.5,afade=t=out:st=19.5:d=0.5[au]" \
  -map "[v]" -map "[au]" -t 20 $DVD -b:v 1200k -maxrate 5000k -bufsize 1835k credits.mpg

printf '000000\nffffff\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n808080\n' > subs.rgb
cat > dvd.xml <<'XML'
<dvdauthor>
  <vmgm>
    <fpc>jump menu 1;</fpc>
    <menus>
      <video format="ntsc" aspect="4:3"/>
      <pgc entry="title">
        <button name="play">jump title 1;</button>
        <button name="scenes">jump titleset 1 menu;</button>
        <button name="bonus">jump title 2;</button>
        <button name="credits">jump title 3;</button>
        <vob file="main.mpg"/>
        <!-- A motion menu: the loop plays again until a button is chosen. -->
        <post>jump cell 1;</post>
      </pgc>
    </menus>
  </vmgm>
  <titleset>
    <!-- Chapter jumps are only allowed from a titleset's own menus. -->
    <menus>
      <video format="ntsc" aspect="4:3"/>
      <pgc entry="root">
        <button name="c1">jump title 1 chapter 1;</button>
        <button name="c2">jump title 1 chapter 2;</button>
        <button name="c3">jump title 1 chapter 3;</button>
        <button name="back">jump vmgm menu 1;</button>
        <vob file="scenesmenu.mpg"/>
        <post>jump cell 1;</post>
      </pgc>
    </menus>
    <titles>
      <video format="ntsc" aspect="4:3"/>
      <audio lang="en"/>
      <subpicture lang="en"/>
      <subpicture lang="es"/>
      <!-- Subtitles start shown (SPRM2 = 0x40 | stream 0): a hidden stream
           plays as forced-only in VLC, so choosing it later showed nothing.
           The palette makes spumux's text white (index 1) edged black (0). -->
      <pgc palette="subs.rgb">
        <pre>subtitle=64;</pre>
        <vob file="feature_subs.mpg" chapters="0,0:40,1:20"/>
        <post>call vmgm menu 1;</post>
      </pgc>
      <pgc>
        <vob file="bonus.mpg"/>
        <post>call vmgm menu 1;</post>
      </pgc>
      <pgc>
        <vob file="credits.mpg"/>
        <post>call vmgm menu 1;</post>
      </pgc>
    </titles>
  </titleset>
</dvdauthor>
XML
VIDEO_FORMAT=NTSC dvdauthor -o dvd -x dvd.xml 2>&1 | grep -E '^ERR' || true
genisoimage -quiet -dvd-video -V DESIGN_FOR_DREAMING -o "$out/design-for-dreaming.iso" dvd
ls -la "$out/design-for-dreaming.iso"
