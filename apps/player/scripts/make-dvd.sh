#!/bin/sh
# The showcase DVD in the sample menu (static/samples/showcase.iso), "Tomorrow
# Vision": a small disc that exercises what DVD playback involves, dressed as
# a late-80s VHS / early-CGI / infomercial dream --
#   * a motion main menu (12 s loop): 1956 footage run at half speed through a
#     VHS treatment (chroma smear and shift, noise, a rolling tracking band,
#     scanlines), chrome type, a turning chrome sphere, VCR on-screen display,
#     over a synth pad; three buttons: Play, Scenes, Credits
#   * a motion scene-select menu (three chapters, and Back)
#   * a 48-second feature in three chapters, with two audio tracks (the
#     films' own soundtrack, and a synth score) and subtitles in English and
#     Spanish
#   * the credits as a second title
# The footage is public domain, from the Prelinger Archives:
#   Design for Dreaming (1956)  https://archive.org/details/Designfo1956
#   Living Stereo (1958)        https://archive.org/details/LivingSt1958
# Everything else -- pictures, sphere, music -- is generated here and in
# make-showcase-dvd.py; the fonts are DejaVu.
# Run it in Docker:
#   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
#     apt-get install -y -qq ffmpeg dvdauthor genisoimage imagemagick sox python3 python3-numpy \
#       fonts-dejavu-core fonts-dejavu-extra curl ca-certificates >/dev/null &&
#     sh apps/player/scripts/make-showcase-dvd.sh'
# SOURCES=<dir> uses Designfo1956_512kb.mp4 and LivingSt1958_512kb.mp4 from
# <dir> instead of downloading them.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
out="$(cd "$here/../static/samples" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
MONO=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
q="-loglevel error -y"
R=30000/1001
# 4:3, like the tapes it imitates.
DVD="-target ntsc-dvd -aspect 4:3 -b:a 192k"
LOOP=12.012 # one menu loop: 360 frames

if [ -n "${SOURCES:-}" ]; then cp "$SOURCES"/Designfo1956_512kb.mp4 dreaming.mp4; cp "$SOURCES"/LivingSt1958_512kb.mp4 stereo.mp4; else
  curl -sSL -o dreaming.mp4 https://archive.org/download/Designfo1956/Designfo1956_512kb.mp4
  curl -sSL -o stereo.mp4 https://archive.org/download/LivingSt1958/LivingSt1958_512kb.mp4
fi

# -- Generated pictures and music ------------------------------------------
python3 "$here/make-showcase-dvd.py" .
# Space and a little chorus on the synths; the loops keep their middle cycle.
fx="chorus 0.6 0.9 55 0.4 0.25 2 -t reverb 70 50 100 100 20 0"
sox menu.wav menu_fx.wav $fx trim $LOOP $LOOP
sox scenes.wav scenes_fx.wav $fx trim $LOOP $LOOP
sox score.wav score_fx.wav $fx
sox credits.wav credits_fx.wav $fx

# Chrome type: a sky-to-horizon gradient cut out by the letters, with a dark
# outline and a magenta glow.
chrome() { # $1 text, $2 point size, $3 output
  convert -background none -fill white -font DejaVu-Sans-Bold-Oblique -pointsize "$2" label:"$1" \
    -trim +repage -bordercolor none -border 16 mask.png
  w=$(identify -format %w mask.png); h=$(identify -format %h mask.png)
  top=$((h * 52 / 100))
  convert -size "${w}x$top" gradient:'#6fc8ff'-'#ffffff' -size "${w}x$((h - top))" gradient:'#2a1650'-'#ffb36b' -append grad.png
  convert grad.png mask.png -compose CopyOpacity -composite fill.png
  convert mask.png -morphology Dilate Disk:3 -fill '#12072e' -colorize 100 outline.png
  convert mask.png -morphology Dilate Disk:7 -blur 0x7 -fill '#ff4fd8' -colorize 100 glow.png
  convert glow.png outline.png -composite fill.png -composite "$3"
}
chrome "TOMORROW" 86 title1.png
chrome "VISION" 86 title2.png
chrome "SCENES" 64 scenes_title.png
chrome "CREDITS" 64 credits_title.png
# A four-point lens sparkle.
convert -size 90x90 xc:none -stroke white -strokewidth 2 -draw "line 45,4 45,86" -draw "line 4,45 86,45" \
  -blur 0x1.2 \( -size 90x90 radial-gradient:'#ffffffff'-'#ffffff00' \) -compose Screen -composite sparkle.png
# Scanlines: every other line darkened.
convert -size 720x2 xc:none -fill '#00000060' -draw "line 0,1 719,1" -write mpr:l +delete -size 720x480 tile:mpr:l scanlines.png

# The VHS look, as a filter: soft horizontal detail, chroma bleeding sideways,
# a grade ($1), noise.
vhs() {
  echo "scale=260:480,scale=720:480:flags=bicubic,$1,rgbashift=rh=-4:bh=4:edge=smear,noise=alls=9:allf=t,format=yuv420p"
}
# A rolling tracking band, drawn over the picture.
band="color=c=0x9a9aa8:s=720x22:r=$R,noise=alls=100:allf=t,format=rgba,colorchannelmixer=aa=0.35"

# -- Feature: three 16-second chapters -------------------------------------
chapter() { # $1 index, $2 source, $3 start, $4 on-screen title
  ffmpeg $q -ss "$3" -t 16.016 -i "$2" -i scanlines.png -filter_complex \
    "[0:v]fps=$R,scale=720:480:flags=bicubic,rgbashift=rh=-2:bh=2:edge=smear,noise=alls=3:allf=t[v];\
     [v][1:v]overlay,format=yuv420p,\
     drawtext=fontfile=$MONO:text='PLAY ▶':x=44:y=36:fontsize=26:fontcolor=0xd8ffd8:shadowx=2:shadowy=2:enable='lt(t,3)',\
     drawtext=fontfile=$MONO:text='$4':x=44:y=74:fontsize=22:fontcolor=white:shadowx=2:shadowy=2:enable='between(t,0.5,4.5)'[out]" \
    -map "[out]" -map 0:a -c:v ffv1 -c:a pcm_s16le -ar 48000 -ac 2 -f nut "ch$1.nut"
  ffmpeg $q -ss 8 -i "ch$1.nut" -frames:v 1 -vf "scale=176:132" "thumb$1.png"
}
chapter 1 dreaming.mp4 216 'CH.1  KITCHEN OF TOMORROW  1956'
chapter 2 stereo.mp4 204 'CH.2  LIVING STEREO  1958'
chapter 3 dreaming.mp4 500 'CH.3  HIGHWAY OF TOMORROW  1956'
printf "file 'ch1.nut'\nfile 'ch2.nut'\nfile 'ch3.nut'\n" > chapters.txt
ffmpeg $q -f concat -i chapters.txt -i score_fx.wav \
  -map 0:v -map 0:a -map 1:a -t 48.048 $DVD -b:v 1900k -maxrate 5000k -bufsize 1835k feature.mpg

# Two subtitle tracks, rendered by spumux from text.
cat > en.srt <<'SRT'
1
00:00:01,000 --> 00:00:06,000
1956. A kitchen that cooks by itself.

2
00:00:08,000 --> 00:00:14,500
From Design for Dreaming, General Motors'
film of its Motorama show.

3
00:00:17,000 --> 00:00:22,500
1958. RCA explains the stereo record groove.

4
00:00:24,000 --> 00:00:30,500
Switch the audio: the films' own sound,
or a synth score written for this disc.

5
00:00:33,000 --> 00:00:38,500
The highway of tomorrow, lit up at night.

6
00:00:40,000 --> 00:00:47,000
When it ends, the disc returns to its menu.
SRT
cat > es.srt <<'SRT'
1
00:00:01,000 --> 00:00:06,000
1956. Una cocina que cocina sola.

2
00:00:08,000 --> 00:00:14,500
De Design for Dreaming, la película
de General Motors sobre su Motorama.

3
00:00:17,000 --> 00:00:22,500
1958. RCA explica el surco del disco estéreo.

4
00:00:24,000 --> 00:00:30,500
Cambia el audio: el sonido original,
o una música de sintetizador para este disco.

5
00:00:33,000 --> 00:00:38,500
La autopista del mañana, iluminada de noche.

6
00:00:40,000 --> 00:00:47,000
Al terminar, el disco vuelve a su menú.
SRT
mkdir -p "$HOME/.spumux" && cp "$FONT" "$HOME/.spumux/"
for i in 0 1; do
  lang=$([ $i = 0 ] && echo en || echo es)
  cat > sub$i.xml <<XML
<subpictures format="NTSC"><stream>
  <textsub filename="$lang.srt" characterset="UTF-8" fontsize="24.0" font="DejaVuSans.ttf"
    horizontal-alignment="center" vertical-alignment="bottom" bottom-margin="40"
    subtitle-fps="29.97" movie-fps="29.97" movie-width="720" movie-height="480" />
</stream></subpictures>
XML
done
spumux -s 0 sub0.xml < feature.mpg > feature_s0.mpg 2>/dev/null
spumux -s 1 sub1.xml < feature_s0.mpg > feature_subs.mpg 2>/dev/null

# -- Menus ------------------------------------------------------------------
# Main menu: the dancer in the fog from Design for Dreaming, at half speed.
ffmpeg $q -ss 304 -t 6.006 -i dreaming.mp4 \
  -f rawvideo -pix_fmt rgba -s 160x160 -r $R -i sphere.rgba \
  -loop 1 -r $R -i title1.png -loop 1 -r $R -i title2.png -loop 1 -r $R -i sparkle.png \
  -loop 1 -r $R -i scanlines.png -f lavfi -i "$band" -i menu_fx.wav \
  -filter_complex "\
    [0:v]setpts=2*PTS,fps=$R,scale=720:480,$(vhs "curves=r='0/0.16 0.5/0.55 1/1':g='0/0.04 0.5/0.42 1/0.92':b='0/0.28 0.5/0.62 1/1',eq=saturation=1.25:brightness=0.05")[bg];\
    [bg][1:v]overlay=x=520:y='150+12*sin(2*PI*t/$LOOP)'[a];\
    [a][2:v]overlay=x=30:y=34[b];[b][3:v]overlay=x=118:y=118[c];\
    [c][4:v]overlay=x=560:y=110:enable='lt(mod(t,4),0.35)'[d];\
    [d]drawtext=fontfile=$FONT:text='a disc of tomorrow, as seen from 1956':x=128:y=226:fontsize=20:fontcolor=0xffd6f4:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='PLAY':x=112:y=298:fontsize=30:fontcolor=white:shadowx=3:shadowy=3,\
       drawtext=fontfile=$MONO:text='SCENES':x=112:y=346:fontsize=30:fontcolor=white:shadowx=3:shadowy=3,\
       drawtext=fontfile=$MONO:text='CREDITS':x=112:y=394:fontsize=30:fontcolor=white:shadowx=3:shadowy=3,\
       drawtext=fontfile=$MONO:text='12\:00':x=596:y=36:fontsize=30:fontcolor=0xd8ffd8:shadowx=2:shadowy=2:enable='lt(mod(t,1),0.5)',\
       drawtext=fontfile=$MONO:text='SP':x=500:y=420:fontsize=22:fontcolor=0xd8ffd8:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='%{pts\:hms}':x=540:y=423:fontsize=16:fontcolor=0xd8ffd8:shadowx=2:shadowy=2[e];\
    [e][6:v]overlay=x=0:y='mod(t*52,560)-40'[f];[f][5:v]overlay,vignette=PI/5[out]" \
  -map "[out]" -map 7:a -frames:v 360 $DVD -b:v 3500k -maxrate 7000k -bufsize 1835k main_bg.mpg

# Scene menu: the highway of tomorrow at night, with a still of each chapter.
ffmpeg $q -ss 516 -t 6.006 -i dreaming.mp4 \
  -f rawvideo -pix_fmt rgba -s 160x160 -r $R -i sphere.rgba \
  -loop 1 -r $R -i scenes_title.png -loop 1 -r $R -i thumb1.png -loop 1 -r $R -i thumb2.png -loop 1 -r $R -i thumb3.png \
  -loop 1 -r $R -i scanlines.png -f lavfi -i "$band" -i scenes_fx.wav \
  -filter_complex "\
    [0:v]setpts=2*PTS,fps=$R,scale=720:480,$(vhs "curves=r='0/0.2 1/0.9':g='0/0.02 1/0.85':b='0/0.3 1/1',eq=saturation=1.3:brightness=-0.04")[bg];\
    [bg][1:v]overlay=x=560:y='24+8*sin(2*PI*t/$LOOP)'[a];[a][2:v]overlay=x=30:y=34[b];\
    [b]drawbox=x=45:y=147:w=182:h=138:c=white:t=3,drawbox=x=269:y=147:w=182:h=138:c=white:t=3,drawbox=x=493:y=147:w=182:h=138:c=white:t=3[c];\
    [c][3:v]overlay=x=48:y=150[d];[d][4:v]overlay=x=272:y=150[e];[e][5:v]overlay=x=496:y=150[f];\
    [f]drawtext=fontfile=$MONO:text='01 KITCHEN':x=64:y=298:fontsize=22:fontcolor=white:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='02 STEREO':x=294:y=298:fontsize=22:fontcolor=white:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='03 HIGHWAY':x=512:y=298:fontsize=22:fontcolor=white:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='BACK':x=334:y=388:fontsize=30:fontcolor=white:shadowx=3:shadowy=3,\
       drawtext=fontfile=$MONO:text='SP':x=500:y=420:fontsize=22:fontcolor=0xd8ffd8:shadowx=2:shadowy=2,\
       drawtext=fontfile=$MONO:text='%{pts\:hms}':x=540:y=423:fontsize=16:fontcolor=0xd8ffd8:shadowx=2:shadowy=2[g];\
    [g][7:v]overlay=x=0:y='mod(t*52,560)-40'[h];[h][6:v]overlay,vignette=PI/5[out]" \
  -map "[out]" -map 8:a -frames:v 360 $DVD -b:v 3500k -maxrate 7000k -bufsize 1835k scenes_bg.mpg

# Button highlights (the DVD's subpicture layer, four colours at most): an
# arrow and an underline for the list items, a frame for the chapter stills.
# Entries are name:x0:y0:x1:y1 (arrow + underline) or frame:x0:y0:x1:y1 (a bar).
highlight() { # $1 output, $2 colour, then entries
  o=$1; c=$2; shift 2
  args=""
  for b in "$@"; do
    set -- $(echo "$b" | tr ':' ' ')
    case $1 in
      frame) args="$args -draw \"rectangle $2,$3 $4,$5\"" ;;
      *) args="$args -draw \"polygon $2,$(($3 + 10)) $(($2 + 18)),$(($3 + 21)) $2,$(($3 + 32))\" -draw \"rectangle $(($2 + 26)),$(($5 - 6)) $(($4 - 20)),$(($5 - 3))\"" ;;
    esac
  done
  eval convert -size 720x480 xc:none +antialias -fill "'$c'" -stroke none $args PNG8:"$o"
}
frame() { # a hollow frame x0 y0 x1 y1, as four bars
  echo "frame:$1:$2:$3:$(($2 + 4)) frame:$1:$(($4 - 4)):$3:$4 frame:$1:$2:$(($1 + 4)):$4 frame:$(($3 - 4)):$2:$3:$4"
}
for kind in highlight:'#ff4fd8' select:'#5ff4ff'; do
  k=${kind%%:*}; colour=${kind#*:}
  highlight "main_$k.png" "$colour" play:84:292:340:334 scenes:84:340:340:382 credits:84:388:340:430
  highlight "scenes_$k.png" "$colour" $(frame 40 142 232 290) $(frame 264 142 456 290) $(frame 488 142 680 290) back:306:380:450:422
done
convert -size 720x480 xc:none PNG8:blank.png

cat > main.xml <<'XML'
<subpictures format="NTSC"><stream>
  <spu start="00:00:00.00" force="yes" image="blank.png" highlight="main_highlight.png" select="main_select.png">
    <button name="play" x0="84" y0="292" x1="340" y1="334" down="scenes"/>
    <button name="scenes" x0="84" y0="340" x1="340" y1="382" up="play" down="credits"/>
    <button name="credits" x0="84" y0="388" x1="340" y1="430" up="scenes"/>
  </spu>
</stream></subpictures>
XML
cat > scenes.xml <<'XML'
<subpictures format="NTSC"><stream>
  <spu start="00:00:00.00" force="yes" image="blank.png" highlight="scenes_highlight.png" select="scenes_select.png">
    <button name="c1" x0="40" y0="142" x1="232" y1="290" right="c2" down="back"/>
    <button name="c2" x0="264" y0="142" x1="456" y1="290" left="c1" right="c3" down="back"/>
    <button name="c3" x0="488" y0="142" x1="680" y1="290" left="c2" down="back"/>
    <button name="back" x0="306" y0="380" x1="450" y1="422" up="c2"/>
  </spu>
</stream></subpictures>
XML
spumux main.xml < main_bg.mpg > main.mpg 2>/dev/null
spumux scenes.xml < scenes_bg.mpg > scenesmenu.mpg 2>/dev/null

# -- Credits: the second title ---------------------------------------------
cat > credits.txt <<'TXT'
TOMORROW VISION
a DVD made for libvlc-wasm, 2026


FOOTAGE
Design for Dreaming (1956)
General Motors / MPO Productions
Living Stereo (1958)
RCA Victor / Jam Handy
Prelinger Archives, public domain
archive.org/details/prelinger


MUSIC
Synth pads and bells, generated
for this disc (CC0)


PICTURES
Chrome type, sphere, VHS effects:
ffmpeg, ImageMagick, numpy (CC0)
Type: DejaVu fonts


AUTHORED WITH
dvdauthor, spumux, genisoimage
TXT
ffmpeg $q -f lavfi -i "gradients=s=720x480:c0=0x12072e:c1=0x5a1a78:c2=0x1fb5b0:nb_colors=3:x0=360:y0=0:x1=360:y1=720:speed=0.004:r=$R" \
  -f rawvideo -pix_fmt rgba -s 160x160 -r $R -i sphere.rgba -loop 1 -r $R -i credits_title.png \
  -loop 1 -r $R -i scanlines.png -f lavfi -i "$band" -i credits_fx.wav \
  -filter_complex "\
    [0:v]$(vhs "eq=saturation=1.1")[bg];[bg][1:v]overlay=x=548:y='300+10*sin(2*PI*t/$LOOP)'[a];\
    [a]drawtext=fontfile=$MONO:textfile=credits.txt:x=(w-text_w)/2:y=h-t*44:fontsize=22:line_spacing=10:fontcolor=white:shadowx=2:shadowy=2,\
       drawbox=x=0:y=0:w=720:h=112:c=0x12072e@0.9:t=fill[t];\
    [t][2:v]overlay=x=(W-w)/2:y=18[c];[c][4:v]overlay=x=0:y='mod(t*52,560)-40'[d];[d][3:v]overlay,vignette=PI/5[out]" \
  -map "[out]" -map 5:a -t 30.03 $DVD -b:v 1800k -maxrate 6000k -bufsize 1835k credits.mpg

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
        <button name="credits">jump title 2;</button>
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
      <audio/>
      <subpicture lang="en"/>
      <subpicture lang="es"/>
      <!-- Subtitles start shown (SPRM2 = 0x40 | stream 0): a hidden stream
           plays as forced-only in VLC, so choosing it later showed nothing.
           The palette makes spumux's text white (index 1) edged black (0). -->
      <pgc palette="subs.rgb">
        <pre>subtitle=64;</pre>
        <vob file="feature_subs.mpg" chapters="0,0:16.016,0:32.032"/>
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
genisoimage -quiet -dvd-video -V TOMORROW_VISION -o "$out/showcase.iso" dvd
ls -la "$out/showcase.iso"
