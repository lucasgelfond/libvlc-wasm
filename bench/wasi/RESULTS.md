# WASI runtime benchmark: FFmpeg 9.0 video decode (1080p30, 5 s clips)

Generated 2026-09-27T05:31:40.752Z on Darwin 25.6.0 arm64, Apple M5, 10 cpus. 3 iteration(s), median fps per cell.
Slowdown = native fps / runtime fps, where native is **the same C code** (FFmpeg built with
`--disable-asm`) compiled by clang -O3 for arm64. Lower is better; 1.00x = native.
Single-threaded decode, video only. See README.md for methodology and caveats.

## Baseline: plain wasm32-wasip1, no SIMD (the 00f.net chart's "plain" build)

| Runtime | h264 | hevc | mjpeg | mpeg2video 1080p | mpeg2video 720p | mpeg2video 360p | mpeg4 | msmpeg4 | vp9 | **geomean** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WAMR (wamrc AOT, -O3) | 1.17x | 1.13x | 1.20x | 1.18x | 1.17x | 1.14x | 1.21x | 1.21x | 1.08x | **1.16x** |
| wasm2c (clang -O3 -mcpu=native) | 1.14x | 1.52x | 1.13x | 1.16x | 1.15x | 1.14x | 1.15x | 1.17x | 1.21x | **1.19x** |
| Wasmer (LLVM) | 1.14x | 1.52x | 1.19x | 1.21x | 1.20x | 1.21x | 1.19x | 1.19x | 1.22x | **1.23x** |
| WAVM (nightly, LLVM AOT) | 1.15x | 1.50x | 1.21x | 1.25x | 1.23x | 1.22x | 1.25x | 1.25x | 1.19x | **1.25x** |
| Bun | 1.23x | 1.63x | 1.33x | 1.29x | 1.30x | 1.33x | 1.30x | 1.27x | 1.29x | **1.33x** |
| Node (default tiering) | 1.27x | 1.67x | 1.25x | 1.32x | 1.33x | 1.30x | 1.35x | 1.31x | 1.29x | **1.34x** |
| Wasmer (Cranelift, default) | 1.27x | 1.69x | 1.32x | 1.34x | 1.31x | 1.29x | 1.40x | 1.36x | 1.34x | **1.36x** |
| Wasmtime (Cranelift) | 1.29x | 1.69x | 1.37x | 1.37x | 1.34x | 1.35x | 1.44x | 1.39x | 1.35x | **1.39x** |
| Node --no-liftoff | 1.28x | 1.76x | 1.26x | 1.44x | 1.54x | 1.55x | 1.44x | 1.40x | 1.31x | **1.44x** |
| WasmEdge (AOT, --run-mode=aot) | 1.32x | 1.58x | 1.64x | 1.62x | 1.55x | 1.32x | 1.62x | 1.64x | 1.24x | **1.50x** |
| Wazero (compiler) | 1.80x | 3.64x | 2.33x | 2.00x | 1.96x | 1.85x | 2.12x | 2.04x | 2.04x | **2.15x** |

## Same, built with -msimd128 (compiler autovectorization only, no hand-written SIMD)

| Runtime | h264 | hevc | mjpeg | mpeg2video 1080p | mpeg2video 720p | mpeg2video 360p | mpeg4 | msmpeg4 | vp9 | **geomean** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| wasm2c (clang -O3 -mcpu=native) | 1.11x | 1.13x | 1.07x | 1.12x | 1.12x | 1.13x | 1.15x | 1.17x | 1.08x | **1.12x** |
| WAVM (nightly, LLVM AOT) | 1.10x | 1.15x | 1.28x | 1.25x | 1.24x | 1.23x | 1.26x | 1.29x | 1.06x | **1.20x** |
| Bun | 1.17x | 1.24x | 1.27x | 1.24x | 1.25x | 1.28x | 1.27x | 1.24x | 1.13x | **1.23x** |
| Wasmer (Cranelift, default) | 1.21x | 1.27x | 1.27x | 1.25x | 1.24x | 1.23x | 1.36x | 1.28x | 1.20x | **1.26x** |
| Wasmtime (Cranelift) | 1.22x | 1.28x | 1.31x | 1.28x | 1.27x | 1.26x | 1.38x | 1.34x | 1.21x | **1.28x** |
| Node (default tiering) | 1.22x | 1.28x | 1.35x | 1.36x | 1.36x | 1.37x | 1.38x | 1.35x | 1.14x | **1.31x** |
| Node --no-liftoff | 1.23x | 1.38x | 1.36x | 1.48x | 1.59x | 1.61x | 1.48x | 1.46x | 1.17x | **1.41x** |
| WasmEdge (AOT, --run-mode=aot) | 1.27x | 1.18x | 2.38x | 1.89x | 1.78x | 1.50x | 1.85x | 1.86x | 1.09x | **1.60x** |
| Wazero (compiler) | 1.70x | 2.02x | 2.36x | 1.97x | 1.93x | 1.86x | 2.11x | 2.03x | 1.57x | **1.94x** |
| Wasmer (LLVM) | 1.74x | 2.43x | 5.37x | 2.29x | 2.10x | 2.03x | 1.99x | 2.25x | 1.62x | **2.27x** |
| WAMR (wamrc AOT, -O3) | fail | fail | 1.32x | 1.25x | 1.22x | 1.18x | 1.25x | 1.25x | fail | **n/a** |

## Absolute fps (context)

| Build | h264 | hevc | mjpeg | mpeg2video 1080p | mpeg2video 720p | mpeg2video 360p | mpeg4 | msmpeg4 | vp9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| native C, no asm (the 1.00x baseline) | 84 | 183 | 356 | 853 | 1603 | 1747 | 616 | 568 | 193 |
| Homebrew ffmpeg, NEON asm, -threads 1 | 127 | 300 | 714 | 1261 | 2381 | 2679 | 882 | 833 | 341 |
| best wasm, no SIMD (WAMR (wamrc AOT, -O3)) | 72 | 162 | 297 | 725 | 1373 | 1532 | 511 | 470 | 178 |

Homebrew's numbers come from `ffmpeg -threads 1 -benchmark -i clip -an -f null -` and include
demux + null muxing; they show what hand-written NEON buys over the C the wasm builds run.

## AOT compile time (untimed in the tables above)

| Runtime | no SIMD | SIMD |
|---|---:|---:|
| WAVM (nightly, LLVM AOT) | 22.3 s | 25.4 s |
| WAMR (wamrc AOT, -O3) | 37.1 s | 38.3 s |
| WasmEdge (AOT, --run-mode=aot) | 17.9 s | 20.8 s |
| Wasmer (LLVM) | 4.5 s | 5.1 s |
| Wasmer (Cranelift, default) | 0.3 s | 0.3 s |
| Wasmtime (Cranelift) | 0.3 s | 0.3 s |

wasm2c is compiled by build.sh (wasm2c + clang), not here. Wazero, Node and Bun compile at
instantiation, before decode.c starts its clock.

## Versions

- **native**: Apple clang version 17.0.0 (clang-1700.6.3.2)
- **wavm**: nightly-2026-04-05 (WAVM version 0.0.0-prerelease)
- **wamr**: iwasm 2.4.5
- **wasmedge**: /opt/homebrew/bin/wasmedge version 0.17.1
- **wasm2c**: wabt 1.0.42, Apple clang version 17.0.0 (clang-1700.6.3.2)
- **wasmer-llvm**: wasmer 7.4.2
- **wasmer**: wasmer 7.4.2
- **wasmtime**: wasmtime 49.0.1 (46c23a87d 2026-09-24)
- **wazero**: wazero 1.12.0
- **node**: node v22.21.1
- **node-noliftoff**: node v22.21.1
- **bun**: bun 1.4.2
- **ffmpeg_brew**: ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers
