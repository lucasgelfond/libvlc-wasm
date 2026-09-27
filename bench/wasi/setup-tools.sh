#!/bin/sh
# Installs the runtimes run.mjs knows about (macOS arm64). Idempotent: skips
# anything already present. Downloads go to bench/wasi/tools/ (gitignored);
# the rest comes from Homebrew.
set -eu
cd "$(dirname "$0")"
mkdir -p tools && cd tools
JOBS=${JOBS:-4}
unq() { xattr -dr com.apple.quarantine "$1" 2>/dev/null || true; }

# Homebrew: wasmtime 49.0.1, wasmer 7.4.2 (Cranelift only), wasmedge 0.17.1,
# wazero 1.12.0, wabt 1.0.42 (wasm2c), simde (wasm2c SIMD), llvm@18 (wamrc).
HOMEBREW_NO_AUTO_UPDATE=1 brew install wasmtime wasmer wasmedge wazero wabt simde llvm@18

# Wasmer's release tarball has the LLVM backend; Homebrew's bottle does not.
if [ ! -x wasmer-release/bin/wasmer ]; then
  mkdir -p wasmer-release
  curl -fL https://github.com/wasmerio/wasmer/releases/download/v7.4.2/wasmer-darwin-arm64.tar.gz | tar xz -C wasmer-release
  unq wasmer-release
fi

# WAVM: not in Homebrew; last nightly with a macOS arm64 build.
if [ ! -x wavm/bin/wavm ]; then
  mkdir -p wavm
  curl -fL https://github.com/WAVM/WAVM/releases/download/nightly/2026-04-05/wavm-nightly-2026-04-05-macos-arm64.tar.gz | tar xz -C wavm
  unq wavm
fi

# Bun: the release zip directly (the curl|bash installer edits ~/.zshrc).
if [ ! -x bun/bin/bun ]; then
  mkdir -p bun/bin
  curl -fL -o bun.zip https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-darwin-aarch64.zip
  unzip -q -o bun.zip && mv bun-darwin-aarch64/bun bun/bin/bun && rm -rf bun.zip bun-darwin-aarch64
  unq bun
fi

# WAMR: Homebrew's `wamr` is interpreter-only with SIMD off and no wamrc, and
# the GitHub releases have no macOS arm64 build, so build both from source.
# wamrc 2.4.x targets LLVM 18 (what its build_llvm.py fetches); Homebrew's
# llvm@18 saves the ~30 min LLVM build.
[ -d wamr-src ] || git clone -q --depth 1 -b WAMR-2.4.5 https://github.com/bytecodealliance/wasm-micro-runtime wamr-src
if [ ! -x wamr-src/wamr-compiler/build/wamrc ]; then
  cmake -S wamr-src/wamr-compiler -B wamr-src/wamr-compiler/build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DWAMR_BUILD_WITH_CUSTOM_LLVM=1 -DLLVM_DIR=/opt/homebrew/opt/llvm@18/lib/cmake/llvm \
    -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/llvm@18
  ninja -C wamr-src/wamr-compiler/build -j"$JOBS"
fi
if [ ! -x wamr-src/product-mini/platforms/darwin/build/iwasm ]; then
  cmake -S wamr-src/product-mini/platforms/darwin -B wamr-src/product-mini/platforms/darwin/build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DWAMR_BUILD_AOT=1 -DWAMR_BUILD_SIMD=1 -DWAMR_BUILD_LIBC_WASI=1 \
    -DWAMR_BUILD_BULK_MEMORY=1 -DWAMR_BUILD_REF_TYPES=1
  ninja -C wamr-src/product-mini/platforms/darwin/build -j"$JOBS"
fi

# wasi-sdk is fetched by build.sh. Node comes from your PATH (nvm).
echo "tools ready"
