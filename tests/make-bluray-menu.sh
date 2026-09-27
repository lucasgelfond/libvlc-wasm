#!/bin/sh
# An unencrypted Blu-ray image with an HDMV (IG) menu, for the menu tests
# (corpus/media/gen/t_bluray_menu.iso): First Play goes to the Top Menu, a
# still page with two buttons -- "PLAY" plays the movie from the start (title
# 1), "CHAPTER 2" plays it from its second chapter mark (title 2); both come
# back to the menu at the end. The movie is the 9 s test pattern of
# t_bluray.iso (H.264 + AC-3, chapters at 0, 3, 6 s). tsMuxer muxes both
# clips; tests/make-bluray-menu.py writes the IG stream, index.bdmv and
# MovieObject.bdmv, which no open-source tool authors (see its header).
# Run it in Docker (or with ffmpeg, python3, genisoimage, faketime, unzip and curl
# installed, on x86_64 Linux):
#   docker run --rm --platform linux/amd64 -v "$PWD":/w -w /w debian:trixie sh -c \
#     'apt-get update -qq && apt-get install -y -qq ffmpeg python3 genisoimage faketime curl unzip ca-certificates >/dev/null && sh tests/make-bluray-menu.sh'
set -eu
top="$(cd "$(dirname "$0")/.." && pwd)"
dst="$top/${OUT:-corpus/media/gen/t_bluray_menu.iso}"
mkdir -p "$(dirname "$dst")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
q="-loglevel error -y"

TSMUXER_URL=https://github.com/justdan96/tsMuxer/releases/download/2.7.0/tsMuxer-2.7.0-linux.zip
TSMUXER_SHA256=ceaaa181ab70e201685b1e45260d337d1cbdb0aba1408d4fbc47e232a7e4c987
curl -sSL -o tsmuxer.zip "$TSMUXER_URL"
echo "$TSMUXER_SHA256  tsmuxer.zip" | sha256sum -c - >/dev/null
unzip -oq tsmuxer.zip && chmod +x tsMuxeR

# Single-threaded x264, so the same inputs give the same bytes.
x264="-c:v libx264 -threads 1 -profile:v high -level 4.1 -maxrate 4M -bufsize 4M -pix_fmt yuv420p -f h264"
x264p="bluray-compat=1:keyint=24:open-gop=0"
# The movie: 9 s, as t_bluray.iso.
ffmpeg $q -f lavfi -i testsrc2=size=1280x720:rate=24000/1001 -t 9 -an $x264 -b:v 800k -x264-params "$x264p" movie.h264
ffmpeg $q -f lavfi -i sine=frequency=440:sample_rate=48000 -t 9 -vn -ac 2 -ar 48000 -c:a ac3 -b:a 192k movie.ac3
# The menu background: 1 s of a dark still, held by the play item's still mode.
ffmpeg $q -f lavfi -i "color=c=0x101828:s=1280x720:r=24000/1001,drawbox=x=160:y=120:w=960:h=8:t=fill:c=0x3050a0" \
  -t 1 -an $x264 -b:v 200k -x264-params "$x264p" menu.h264
python3 "$top/tests/make-bluray-menu.py" sup menu.sup

cat > movie.meta <<META
MUXOPT --blu-ray --custom-chapters=00:00:00.000;00:00:03.000;00:00:06.000
V_MPEG4/ISO/AVC, "movie.h264", fps=23.976
A_AC3, "movie.ac3", lang=eng
META
# The menu clip: the IG stream goes in as a PG track (see make-bluray-menu.py).
cat > menu.meta <<META
MUXOPT --blu-ray --mplsOffset=1 --m2tsOffset=1
V_MPEG4/ISO/AVC, "menu.h264", fps=23.976
S_HDMV/PGS, "menu.sup", fps=23.976, lang=eng
META
./tsMuxeR movie.meta movie >/dev/null
./tsMuxeR menu.meta menu >/dev/null
python3 "$top/tests/make-bluray-menu.py" finish menu movie disc

# UDF (what libbluray's udfread reads). Fixed file times, a frozen clock and a
# fixed volume set name make the image byte-for-byte reproducible.
find disc -exec touch -h -d 2026-01-01T00:00:00Z {} +
faketime -f '2026-01-01 00:00:00' genisoimage -quiet -udf -V LIBVLC_WASM_BDMENU -o "$dst" disc
python3 "$top/tests/make-bluray-menu.py" fixiso "$dst" LIBVLC_WASM_BDMENU
ls -la "$dst"
