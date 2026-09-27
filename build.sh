#!/bin/sh
# One entry point for the whole native build.
#
#   ./build.sh            build the toolchain image, VLC, then link libvlc.wasm
#   ./build.sh vlc        (re)build VLC's static libraries only
#   ./build.sh link       relink libvlc.wasm from the existing archives (fast)
#   ./build.sh shell      a shell inside the build container
set -eu
cd "$(dirname "$0")"

# The VLC master commit this SDK is built and tested against. Override with
# VLC_COMMIT=<sha> to try a newer one (CI does, from its workflow inputs).
VLC_COMMIT=${VLC_COMMIT:-b11917943e3a32578d65edd54f3d12023da29d46}   # VLC master, 2026-09-26
IMAGE=libvlc-wasm-build:latest
# The build tree lives in a Docker volume by default (fast on macOS); CI points
# CACHE_DIR at a host directory it can save between runs.
# VARIANT=sout builds a second binary with VLC's stream output (transcoding,
# remuxing, recording) and FFmpeg's encoders/muxers, in its own build tree.
VARIANT=${VARIANT:-default}
if [ "$VARIANT" = sout ]; then
  CACHE=${CACHE_DIR:-libvlc-wasm-cache-sout}
else
  CACHE=${CACHE_DIR:-libvlc-wasm-cache}
fi

run() {
  docker run --rm -i \
    -v "$PWD":/work -v "$CACHE":/cache \
    -e VLC_COMMIT="$VLC_COMMIT" -e JOBS="${JOBS:-}" -e MODE="${MODE:-1}" \
    -e PROFILE="${PROFILE:-release}" -e CLEAN="${CLEAN:-0}" -e VARIANT="$VARIANT" \
    "$IMAGE" "$@"
}

image() { docker build -q -t "$IMAGE" build >/dev/null; }

case "${1:-all}" in
  image) image ;;
  vlc)   image; run sh /work/build/build-vlc.sh ;;
  link)  run sh /work/build/link.sh ;;
  shell) docker run --rm -it -v "$PWD":/work -v "$CACHE":/cache "$IMAGE" bash ;;
  all)   image; run sh /work/build/build-vlc.sh; run sh /work/build/link.sh ;;
  *) echo "usage: $0 [all|image|vlc|link|shell]" >&2; exit 2 ;;
esac
