#!/bin/sh
# Builds VLC's static libraries for wasm32-unknown-emscripten, inside the
# libvlc-wasm-build container. Invoked by ./build.sh on the host.
#
# The tree lives in /cache (a Docker volume, not a bind mount): the contrib and
# VLC builds touch tens of thousands of files and a macOS bind mount makes that
# several times slower. Only the finished archives are copied to /work/.cache/vlc-out.
set -eu
SUFFIX=; [ "${VARIANT:-default}" != default ] && SUFFIX=-$VARIANT

VLC_REPO=${VLC_REPO:-https://code.videolan.org/videolan/vlc.git}
VLC_COMMIT=${VLC_COMMIT:?}
JOBS=${JOBS:-$(nproc)}
SRC=/cache/vlc
OUT=/work/.cache/vlc-out$SUFFIX
PATCHES=/work/build/patches

. /opt/emsdk/emsdk_env.sh >/dev/null 2>&1
export MAKEFLAGS="-j$JOBS"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ "${CLEAN:-0}" = 1 ] && [ -d "$SRC" ]; then
  step "CLEAN=1: removing contrib and VLC build trees (tarballs are kept)"
  rm -rf "$SRC/contrib/contrib-emscripten" "$SRC/contrib/wasm32-unknown-emscripten" "$SRC/build-emscripten"
fi
if [ ! -d "$SRC/.git" ]; then
  step "fetching VLC $VLC_COMMIT"
  git init -q "$SRC"
  git -C "$SRC" remote add origin "$VLC_REPO"
fi
if [ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null || true)" != "$VLC_COMMIT" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$VLC_COMMIT"
  git -C "$SRC" checkout -q -f "$VLC_COMMIT"
  git -C "$SRC" clean -fdxq -e contrib/contrib-emscripten -e contrib/tarballs -e build-emscripten
fi

# Idempotent on purpose: re-applying (or resetting and re-applying) would
# bump the mtime of contrib/src/main.mak, and every contrib depends on it.
# A patch that neither reverses nor applies is an older version of itself,
# left in the tree by an earlier build: only the files it touches are reset,
# and the earlier patches' hunks for those files put back, before applying it.
step "applying patches"
for p in "$PATCHES"/*.patch; do
  [ -e "$p" ] || continue
  if git -C "$SRC" apply -R --check "$p" 2>/dev/null; then
    echo "  $(basename "$p") (already applied)"
  elif git -C "$SRC" apply --check "$p" 2>/dev/null; then
    echo "  $(basename "$p")"
    git -C "$SRC" apply --whitespace=nowarn "$p"
  else
    echo "  $(basename "$p") (an older version is applied: resetting its files)"
    files=$(git -C "$SRC" apply --numstat "$p" | cut -f3)
    for f in $files; do
      git -C "$SRC" checkout -q HEAD -- "$f" 2>/dev/null || rm -f "$SRC/$f"
    done
    for q in "$PATCHES"/*.patch; do
      [ "$q" = "$p" ] && break
      for f in $files; do
        git -C "$SRC" apply --whitespace=nowarn --include="$f" "$q"
      done
    done
    git -C "$SRC" apply --whitespace=nowarn "$p"
  fi
done

# The upstream script is the source of truth for contrib/configure flags; we
# only feed it our overrides. It is restored first so that every edit below
# starts from upstream's text, whatever an earlier build left behind.
cd "$SRC"
UP=extras/package/wasm-emscripten/build.sh
git checkout -q -- "$UP"
OPT_FLAGS=
if [ "${PROFILE:-release}" != debug ]; then
  # Upstream always configures --enable-debug, which means -Og and assertions
  # on every hot path: fine for CI, several times too slow to benchmark.
  sed -i 's/--enable-debug/--disable-debug/' "$UP"
  OPT_FLAGS="-O3"
fi
# Must match the contribs (patches/0002) and the link (link.sh). Given to
# VLC's configure only: exported globally they would also reach the native
# host tools (extras/tools, built with gcc), which reject them.
WASM_FLAGS="-msimd128 -fwasm-exceptions -sSUPPORT_LONGJMP=wasm"
export VLC_CFLAGS="$OPT_FLAGS $WASM_FLAGS" VLC_LDFLAGS="$WASM_FLAGS"
sed -i 's|    emconfigure "$VLC_SRCPATH"/configure|    CFLAGS="$VLC_CFLAGS" CXXFLAGS="$VLC_CFLAGS" LDFLAGS="$VLC_LDFLAGS" emconfigure "$VLC_SRCPATH"/configure|' "$UP"
# soxr's CMake mistakes -msimd128 for x86 SIMD and compiles CPUID inline asm;
# VLC has other resamplers (samplerate, speex, ugly), so it is simply left out.
sed -i 's/--disable-goom \\/--disable-goom --disable-soxr \\/' "$UP"
# Discs: DVD images and VIDEO_TS folders (dvdnav, with menus) and Blu-ray
# (libbluray, HDMV menus; no BD-J, which needs Java). No libdvdcss or libaacs:
# unencrypted discs play, encrypted ones do not (patches/0005) -- except in the
# dvdcss variant, which you build yourself and which is never distributed.
if [ "${VARIANT:-default}" = dvdcss ]; then
  sed -i 's/--disable-disc //' "$UP"
else
  sed -i 's/--disable-disc /--disable-dvdcss /' "$UP"
fi
# C64 SID music (libsidplay2, GPL).
sed -i 's/ --disable-sidplay2//' "$UP"
if [ "${VARIANT:-default}" = sout ]; then
  # Keep VLC's stream output and the encoders: FFmpeg's, libvpx, x264
  # (patches/0012 teaches it emscripten) and x265.
  sed -i 's/ --disable-sout//' "$UP"
  sed -i 's/--disable-goom /--disable-goom --disable-x26410b --disable-twolame --disable-shout /' "$UP"
fi
grep -n 'bootstrap --' -A15 "$UP" | grep -o -- '--[a-z0-9-]*' | tr '\n' ' '; echo
step "running extras/package/wasm-emscripten/build.sh (${PROFILE:-release}, ${VARIANT:-default})"
MODE=${MODE:-1}
sh extras/package/wasm-emscripten/build.sh --mode="$MODE"

step "collecting archives into $OUT"
B="$SRC/build-emscripten"
rm -rf "$OUT" && mkdir -p "$OUT/lib" "$OUT/modules" "$OUT/include"
cp "$B"/lib/.libs/libvlc.a "$B"/src/.libs/libvlccore.a "$OUT/lib/"
cp "$B"/compat/.libs/libcompat.a "$OUT/lib/" 2>/dev/null || true
cp "$B"/modules/.libs/*plugin.a "$OUT/modules/"
# some plugins build helper convenience libs that the plugins reference
find "$B/modules" -name '*.a' -path '*/.libs/*' ! -name '*plugin.a' -exec cp {} "$OUT/modules/" \;
cp "$B"/vlc-modules.bc "$OUT/"
cp -r "$SRC"/include/vlc "$OUT/include/"
cp -r "$SRC"/contrib/wasm32-unknown-emscripten/lib "$OUT/contrib-lib"
cp "$B"/config.h "$OUT/"
git -C "$SRC" rev-parse HEAD > "$OUT/VLC_COMMIT"
ls "$OUT/modules" | sed 's/^lib//; s/_plugin\.a$//' | sort > "$OUT/modules.txt"
echo "$(wc -l < "$OUT/modules.txt") plugins"
