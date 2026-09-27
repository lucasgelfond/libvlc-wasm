# Build environment for libvlc-wasm.
#
# Derived from VideoLAN's own CI image (code.videolan.org/videolan/docker-images,
# vlc-debian-wasm-emscripten), which is published for amd64 only. This one builds
# natively on arm64 as well, so an Apple Silicon machine does not pay for emulation.
FROM debian:trixie-slim

ARG EMSDK_VERSION=6.0.0

RUN set -x && apt-get update && \
    apt-get install -y --no-install-suggests --no-install-recommends \
        ca-certificates git libtool libltdl-dev automake autoconf autopoint make \
        gettext pkg-config cmake zip bzip2 zstd xz-utils wget dos2unix \
        g++ m4 ninja-build build-essential libtool-bin gperf \
        flex bison curl nasm meson python3 python3-venv python3-setuptools python3-mako \
        locales file \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/* && \
    localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8

ENV LANG=en_US.UTF-8

RUN git clone --depth=1 https://github.com/emscripten-core/emsdk/ /opt/emsdk && \
    cd /opt/emsdk && ./emsdk install $EMSDK_VERSION && ./emsdk activate $EMSDK_VERSION

ENV EMSDK=/opt/emsdk
ENV PATH=/opt/emsdk:/opt/emsdk/upstream/emscripten:/opt/emsdk/node/current/bin:$PATH

WORKDIR /work
