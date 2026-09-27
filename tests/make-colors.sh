#!/bin/sh
# Colour-accuracy clips for tests/colors.mjs (bench/media/colors): four flat
# quadrants of known RGB, each clip in a different pixel layout, range and
# matrix. Needs ffmpeg with libx264 and libx265.
set -eu
out="$(cd "$(dirname "$0")/.." && pwd)/bench/media/colors"
mkdir -p "$out" && cd "$out"
q="-loglevel error -y"
# (200,40,40) (40,180,60) / (50,60,200) (128,128,128), as in colors.mjs EXPECT
SRC="color=c=0xC82828:s=640x360:d=2[a];color=c=0x28B43C:s=640x360:d=2[b];color=c=0x323CC8:s=640x360:d=2[c];color=c=0x808080:s=640x360:d=2[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack,format=gbrp"
enc() { # $1 file, $2 pix_fmt, $3 range tv|pc, $4 matrix, then encoder args
  f=$1; pf=$2; range=$3; m=$4; shift 4
  ffmpeg $q -f lavfi -i "$SRC" -r 25 \
    -vf "scale=out_color_matrix=$m:out_range=$range,format=$pf" \
    -color_range "$range" -colorspace "$m" -color_primaries "$([ "$m" = bt470bg ] && echo bt470bg || echo bt709)" \
    -color_trc "$([ "$m" = bt470bg ] && echo gamma28 || echo bt709)" "$@" "$f"
}
enc i420.mpg yuv420p tv bt709 -c:v mpeg2video -q:v 2
enc j422.avi yuvj422p pc bt470bg -c:v mjpeg -q:v 2
enc i444.mkv yuv444p tv bt709 -c:v libx264 -qp 0
enc i0al.mkv yuv420p10le tv bt709 -c:v libx265 -x265-params log-level=error:lossless=1
enc h264.mkv yuv420p tv bt709 -c:v libx264 -crf 10
ls -la
