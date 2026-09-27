#!/bin/sh
# Builds a decode-only FFmpeg (the version VLC's contrib pins) three ways from
# the same source and the same configure flags, and links decode.c against each:
#
#   out/decode-native     arm64 macOS, clang -O3, --disable-asm   (the baseline)
#   out/decode.wasm       wasm32-wasip1, -O3, no SIMD, no threads (the chart's "plain")
#   out/decode-simd.wasm  same, plus -msimd128 (compiler autovectorization only)
#
# --disable-asm on all three means every artifact runs the same C code: no NEON
# on native, none of FFmpeg's hand-written wasm simd128 either. The slowdown
# measured is therefore purely what each runtime makes of the compiled C.
#
# Needs: wasi-sdk in tools/ (fetched here if missing), Apple clang, curl, make.
# Usage: bench/wasi/build.sh [native|wasm|simd]...   (default: all three)
set -eu
cd "$(dirname "$0")"
HERE=$(pwd)
JOBS=${JOBS:-4}

FFMPEG_VERSION=9.0   # = .research/vlc/contrib/src/ffmpeg/rules.mak
FFMPEG_SHA512=2e2fea606b290c306bdef13b4c8efb7a4b138ffa16f94f608f85877f5e7ca93980bda8219eeeed8343c463d302c7a2c46b14902ccbbe1e53483f9411b31b9c69
WASI_SDK_VERSION=34.0
WASI_SDK=$HERE/tools/wasi-sdk-$WASI_SDK_VERSION-arm64-macos

mkdir -p src out build tools

# --- sources ---------------------------------------------------------------
if [ ! -f src/ffmpeg-$FFMPEG_VERSION.tar.xz ]; then
  curl -fL -o src/ffmpeg-$FFMPEG_VERSION.tar.xz https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz
fi
echo "$FFMPEG_SHA512  src/ffmpeg-$FFMPEG_VERSION.tar.xz" | shasum -a 512 -c -
[ -d src/ffmpeg-$FFMPEG_VERSION ] || tar -C src -xf src/ffmpeg-$FFMPEG_VERSION.tar.xz
FFSRC=$HERE/src/ffmpeg-$FFMPEG_VERSION

if [ ! -x "$WASI_SDK/bin/clang" ]; then
  curl -fL -o tools/wasi-sdk.tgz \
    https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION%%.*}/wasi-sdk-$WASI_SDK_VERSION-arm64-macos.tar.gz
  tar -C tools -xzf tools/wasi-sdk.tgz && rm tools/wasi-sdk.tgz
  xattr -dr com.apple.quarantine "$WASI_SDK" 2>/dev/null || true
fi

# --- the one FFmpeg configuration -----------------------------------------
# Decode-only, video only. Parsers are enabled so the demuxers can split
# elementary streams (mpegps/ts need them; mpegps also needs the raw
# mpegvideo demuxer to probe what an 0xe0 stream carries); the vp9 decoder pulls in its
# vp9_superframe_split bsf by itself.
COMMON_FLAGS="
  --disable-everything --disable-asm --disable-pthreads --disable-network
  --disable-programs --disable-doc --disable-debug --disable-autodetect
  --disable-avdevice --disable-avfilter --disable-swscale --disable-swresample
  --enable-static --disable-shared --optflags=-O3
  --enable-protocol=file
  --enable-decoder=h264,hevc,vp9,mpeg2video,mpeg4,msmpeg4v3,mjpeg
  --enable-demuxer=matroska,avi,mpegps,mpegts,mov,mpegvideo
  --enable-parser=h264,hevc,vp9,mpegvideo,mpeg4video,mjpeg
"

ffbuild() { # name, then extra configure args
  name=$1; shift
  bdir=$HERE/build/$name
  if [ ! -f "$bdir/.done" ]; then
    rm -rf "$bdir" && mkdir -p "$bdir"
    (cd "$bdir" && "$FFSRC/configure" --prefix="$bdir/prefix" $COMMON_FLAGS "$@" > configure.log 2>&1) \
      || { tail -30 "$bdir/configure.log"; tail -30 "$bdir/ffbuild/config.log"; exit 1; }
    make -C "$bdir" -j"$JOBS" > "$bdir/make.log" 2>&1 || { tail -40 "$bdir/make.log"; exit 1; }
    make -C "$bdir" install > /dev/null
    touch "$bdir/.done"
  fi
}
LIBS="-lavformat -lavcodec -lavutil"

build_native() {
  ffbuild native --cc=clang
  P=$HERE/build/native/prefix
  clang -O3 -I"$P/include" decode.c -L"$P/lib" $LIBS -lm -o out/decode-native
  echo "built out/decode-native"
}

# wasm32-wasip1: FFmpeg has no WASI target-os; "none" plus the emulated libc
# pieces is enough. The 8 MiB stack is for deep decoder frames (wasm-ld's
# default is 64 KiB); memory grows on demand.
WASM_ENV_FLAGS="-D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_MMAN -D_WASI_EMULATED_GETPID"
WASM_LINK="-Wl,--strip-debug -Wl,-z,stack-size=8388608 -Wl,--initial-memory=67108864 -Wl,--max-memory=4294967296
  -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-mman -lwasi-emulated-getpid"

build_wasm() { # name, extra cflags
  name=$1; extra=$2
  ffbuild "$name" --enable-cross-compile --target-os=none --arch=wasm32 \
    --cc="$WASI_SDK/bin/clang" --ar="$WASI_SDK/bin/llvm-ar" --nm="$WASI_SDK/bin/llvm-nm" \
    --ranlib="$WASI_SDK/bin/llvm-ranlib" --sysroot="$WASI_SDK/share/wasi-sysroot" \
    --extra-cflags="--target=wasm32-wasip1 $WASM_ENV_FLAGS $extra" \
    --extra-ldflags="--target=wasm32-wasip1 $extra"
  P=$HERE/build/$name/prefix
  out=$3
  "$WASI_SDK/bin/clang" --target=wasm32-wasip1 -O3 $extra $WASM_ENV_FLAGS -I"$P/include" decode.c \
    -L"$P/lib" $LIBS -lm $WASM_LINK -o "out/$out"
  echo "built out/$out"
}

# wasm2c: translate the wasm (not the C source) to C, compile that with clang
# -O3 -mcpu=native as the 00f.net benchmark does, and link it to our minimal
# WASI host (wasm2c-wasi-host.c; wabt ships none). wasm-rt's default guard-page
# bounds checking stays on. The SIMD build needs simde (brew install simde).
build_wasm2c() { # in.wasm out-binary
  in=$1; outbin=$2
  WABT=$(brew --prefix wabt)
  d=$HERE/build/wasm2c-$(basename "$in" .wasm)
  rm -rf "$d" && mkdir -p "$d"
  wasm2c --module-name=decode --num-outputs=8 "out/$in" -o "$d/decode.c"
  CF="-O3 -mcpu=native -w -I$d -I$WABT/include -I$WABT/share/wabt/wasm2c"
  [ -d "$(brew --prefix simde 2>/dev/null)/include" ] && CF="$CF -I$(brew --prefix simde)/include"
  ls "$d"/decode_*.c | xargs -P"$JOBS" -I{} clang $CF -c {} -o {}.o
  clang $CF -c "$WABT/share/wabt/wasm2c/wasm-rt-impl.c" -o "$d/rt.o"
  clang $CF -c "$WABT/share/wabt/wasm2c/wasm-rt-mem-impl.c" -o "$d/rtmem.o"
  clang $CF -c "$WABT/share/wabt/wasm2c/wasm-rt-exceptions-impl.c" -o "$d/rtexn.o"
  clang $CF -c wasm2c-wasi-host.c -o "$d/host.o"
  clang -o "out/$outbin" "$d"/*.o
  echo "built out/$outbin"
}

targets=${*:-native wasm simd wasm2c wasm2c-simd}
for t in $targets; do
  case $t in
    native) build_native ;;
    wasm)   build_wasm wasm "" decode.wasm ;;
    simd)   build_wasm simd "-msimd128" decode-simd.wasm ;;
    wasm2c) build_wasm2c decode.wasm decode-wasm2c ;;
    wasm2c-simd) build_wasm2c decode-simd.wasm decode-simd-wasm2c ;;
    *) echo "unknown target $t" >&2; exit 2 ;;
  esac
done
ls -la out
