#!/bin/sh
# Builds VLC's static libraries for wasm32-unknown-emscripten, inside the
# libvlc-wasm-build container. Invoked by ./build.sh on the host.
#
# The tree lives in /cache (a Docker volume, not a bind mount): the contrib and
# VLC builds touch tens of thousands of files and a macOS bind mount makes that
# several times slower. Only the finished archives are copied to /work/.cache/vlc-out.
set -eu

VLC_REPO=${VLC_REPO:-https://code.videolan.org/videolan/vlc.git}
VLC_COMMIT=${VLC_COMMIT:?}
JOBS=${JOBS:-$(nproc)}
SRC=/cache/vlc
OUT=/work/.cache/vlc-out
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
step "applying patches"
for p in "$PATCHES"/*.patch; do
  [ -e "$p" ] || continue
  if git -C "$SRC" apply -R --check "$p" 2>/dev/null; then
    echo "  $(basename "$p") (already applied)"
  else
    echo "  $(basename "$p")"
    git -C "$SRC" apply "$p"
  fi
done

# The upstream script is the source of truth for contrib/configure flags; we only
# feed it our overrides through the environment (see patches/ for the rest).
cd "$SRC"
if [ "${PROFILE:-release}" = release ]; then
  # Upstream always configures --enable-debug, which means -Og and assertions
  # on every hot path: fine for CI, several times too slow to benchmark.
  sed -i 's/--enable-debug/--disable-debug/' extras/package/wasm-emscripten/build.sh
  export CFLAGS="-O3" CXXFLAGS="-O3"
fi
# Must match the contribs (patches/0002) and the link (link.sh).
WASM_FLAGS="-msimd128 -fwasm-exceptions -sSUPPORT_LONGJMP=wasm"
export CFLAGS="${CFLAGS:-} $WASM_FLAGS" CXXFLAGS="${CXXFLAGS:-} $WASM_FLAGS" LDFLAGS="${LDFLAGS:-} $WASM_FLAGS"
# soxr's CMake mistakes -msimd128 for x86 SIMD and compiles CPUID inline asm;
# VLC has other resamplers (samplerate, speex, ugly), so it is simply left out.
grep -q -- '--disable-soxr' extras/package/wasm-emscripten/build.sh ||
  sed -i 's/--disable-goom \\/--disable-goom --disable-soxr \\/' extras/package/wasm-emscripten/build.sh
step "running extras/package/wasm-emscripten/build.sh ($PROFILE)"
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
