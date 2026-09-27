# WASI runtime benchmark: video decoding

How much slower is FFmpeg's C decoder when it runs as WebAssembly, per runtime? This is the
media-decoding counterpart of the chart *"Baseline WebAssembly slowdown by release year (plain
wasm32-wasi, no SIMD)"* in Frank Denis's
[Performance of WebAssembly runtimes in 2026](https://00f.net/2026/06/23/webassembly-runtimes-2026/),
which measured libsodium. Results land in `RESULTS.md` / `results.json` after a run.

## Reproduce

```sh
bench/wasi/setup-tools.sh     # runtimes: brew + downloads into bench/wasi/tools/ (~2 GB)
bench/wasi/build.sh           # FFmpeg 9.0 x3 + wasm2c builds into bench/wasi/out/ (~2 min, -j4)
node bench/wasi/run.mjs --smoke   # 1 clip, 1 iteration, every runtime: checks they all work
node bench/wasi/run.mjs           # the sweep: 3 iterations, writes RESULTS.md + results.json
```

`run.mjs` options: `--iters N`, `--clips h264,hevc`, `--runtimes wasmtime,wavm`,
`--variants base,simd`, `--recompile` (discard cached AOT artifacts), `--no-write`.
The clips are `bench/media/*` (`bench/make-media.sh`): 5 s of 1080p30 per codec, with temporal
noise so the bitrate resembles real footage. The AV1 clip is skipped (FFmpeg has no native AV1
decoder worth benchmarking; VLC uses dav1d).

## What is measured

**The workload.** `decode.c` opens the file with libavformat, reads every video packet into
memory, then — and only then — starts a `CLOCK_MONOTONIC` clock and decodes every packet with
`thread_count = 1`, draining the decoder at the end. It prints
`{"codec","frames","seconds","fps","checksum"}`. File I/O through the WASI layer is therefore not
in the number; startup, instantiation and JIT compilation are not either.

**The same C everywhere.** FFmpeg 9.0 (the version VLC's contrib pins, SHA-512 checked) is
configured once — `--disable-everything --disable-asm --disable-pthreads`, then the h264, hevc,
vp9, mpeg2video, mpeg4, msmpeg4v3 and mjpeg decoders plus the matroska, avi, mpegps/mpegvideo,
mpegts and mov demuxers — and built three times from that one flag set:

| Artifact | Compiler | Notes |
|---|---|---|
| `out/decode-native` | Apple clang, `-O3`, arm64 | **the 1.00x baseline.** No NEON asm, but clang autovectorizes to NEON as usual |
| `out/decode.wasm` | wasi-sdk 34 (clang 23), `--target=wasm32-wasip1 -O3` | "plain": no SIMD, no threads, default `generic` CPU features (bulk-memory, sign-ext, nontrapping-fptoint, multivalue, reference-types) |
| `out/decode-simd.wasm` | same + `-msimd128` | autovectorization only; FFmpeg's hand-written wasm simd128 is still off via `--disable-asm` |

Slowdown = native fps / runtime fps, median of the iterations, per codec; the headline is the
**geometric mean over codecs**, as in the article. A run only counts if its frame count **and its
checksum** (an Adler-style sum over one luma row of every decoded frame) equal native's. Every
runtime in the table matched bit-for-bit on every clip during validation.

**Context row.** Homebrew's FFmpeg 9.0.2 *with* its NEON assembly,
`ffmpeg -threads 1 -benchmark -i clip -an -f null -`, frames / `rtime`. That includes demux and
the null muxer, so it slightly understates the decoder. It answers a different question: how much
hand-written SIMD is worth over the C the wasm builds run (for hevc, about 1.5x).

## Runtimes

| id | Runtime | Mode | How it runs |
|---|---|---|---|
| `wavm` | WAVM nightly 2026-04-05 (macOS arm64 release) | LLVM AOT | `wavm compile`, then `wavm run --precompiled --mount-root media` |
| `wamr` | WAMR 2.4.5, built from source with AOT + SIMD | `wamrc --opt-level=3` AOT | `iwasm --map-dir=/media::media x.aot` |
| `wasmedge` | WasmEdge 0.17.1 (brew) | AOT, `--optimize 3` | `wasmedge --run-mode=aot --dir /media:media x.so` |
| `wasm2c` | wabt 1.0.42 wasm2c + Apple clang `-O3 -mcpu=native` | ahead-of-time via C | linked to `wasm2c-wasi-host.c` |
| `wasmer-llvm` | Wasmer 7.4.2 (GitHub release build) | LLVM | `wasmer compile --llvm`, then `wasmer run --llvm` |
| `wasmer` | Wasmer 7.4.2 | Cranelift (default) | `wasmer compile --cranelift`, then run |
| `wasmtime` | Wasmtime 49.0.1 (brew) | Cranelift | `wasmtime compile`, then `run --allow-precompiled` |
| `wazero` | Wazero 1.12.0 (brew) | compiler (JIT at load) | `wazero run -mount media:/media` |
| `node` | Node 22.21.1 (nvm), `node:wasi` | V8 default (Liftoff → TurboFan) | `wasi-host.mjs` |
| `node-noliftoff` | same, `--no-liftoff` | TurboFan only | `wasi-host.mjs` |
| `bun` | Bun 1.4.2, its `node:wasi` | JSC tiers | `wasi-host.mjs` |

AOT compile time is measured once and reported separately; compiled artifacts are cached in
`out/aot/` until their `.wasm` changes.

### Pitfalls found getting each one to run (all handled in the scripts)

- **WasmEdge interprets unless told otherwise.** `wasmedge x.so` with an AOT-compiled file and no
  `--run-mode=aot` ran mpeg4 at 4 fps instead of 373 fps — 90x slower, silently. The default run
  mode in 0.17 is `interpreter`.
- **WAMR AOT on Apple arm64 needs `--cpu-features=+reserve-x18`.** wamrc's bare `aarch64` target
  lets LLVM allocate x18, which Darwin reserves and clobbers; the module crashes with a SIGSEGV on
  the first memory access through x18. Also `--cpu=apple-m4` does not exist in LLVM 18 and
  silently falls back to a CPU without FP, so the AOT file then needs soft-float helpers
  (`resolve symbol __floatsidf failed`); `apple-m3` is used.
- **Homebrew's `wamr` is interpreter-only** (no SIMD, no JIT, no wamrc) and **Homebrew's wasmer has
  only Cranelift**, so both come from elsewhere (`setup-tools.sh`).
- **wasm2c has no WASI.** `wasm2c-wasi-host.c` implements the 22 preview1 imports decode.wasm has,
  on plain POSIX calls. It is a harness, not a sandbox (no `..` checks, guest fds are host fds);
  wasm-rt's guard-page bounds checks are left on, which is what matters for speed parity.
- **Bun's `node:wasi` has no `getImportObject()`**; `wasi-host.mjs` passes `wasiImport` directly.
- The mpegps demuxer needs the raw `mpegvideo` demuxer enabled to probe an MPEG-2 stream.

## Caveats

- **One workload family.** Integer-heavy video decoding in C, not crypto; rankings differ from
  the article's (e.g. wide-arithmetic is irrelevant here). Seven codecs, but all FFmpeg.
- **Single-threaded, video only.** Real players use frame/slice threads; wasi-threads support is
  too uneven across these runtimes to compare fairly.
- **No hand-written SIMD anywhere.** Production FFmpeg (and VLC's contrib build) runs NEON/AVX asm;
  the Homebrew row shows how far that is from the 1.00x baseline here.
- **The native baseline autovectorizes** (NEON is always on for arm64), while the plain wasm build
  cannot. That is the article's methodology too, and part of what "wasm overhead" means. The SIMD
  variant shows how much of the gap autovectorization to simd128 recovers — and where it backfires
  (in validation, Wasmer's LLVM backend was *slower* with SIMD than without on every clip tried).
- **wasm32 only**, no memory64. Default `generic` wasm features, not `-mcpu=lime1` or `mvp`;
  every runtime above accepted them.
- **JS engines tier up.** decode.c loops over many short function calls for thousands of
  iterations, so V8 and JSC reach their optimizing tier early; unlike the article's Node result,
  default Node here is not dramatically slower than `--no-liftoff`. The JS numbers are for the
  CLI runtimes, not browsers.
- **Machine noise.** Apple M5, 10 cores (macOS schedules P vs E cores as it likes; no frequency pinning is
  possible), laptop thermals, 3 iterations by default. Run on an idle, plugged-in machine; raise
  `--iters` for tighter medians. Clips are short (0.2–2 s of decode per run at native speed).
- `wasm2c` and `wamr` use `-mcpu=native`/`apple-m3` codegen; the native baseline uses Apple
  clang's arm64 default (`apple-m1`-level). This slightly favors those two.

## Files

| File | Purpose |
|---|---|
| `decode.c` | the benchmark driver (libavformat + libavcodec) |
| `build.sh` | FFmpeg 9.0 native / wasm / wasm-simd builds, plus wasm2c builds |
| `setup-tools.sh` | installs/builds the runtimes |
| `run.mjs` | runs the matrix, validates output, writes `results.json` + `RESULTS.md` |
| `wasi-host.mjs` | `node:wasi` host for Node and Bun |
| `wasm2c-wasi-host.c` | minimal WASI preview1 host for wasm2c output |
| `tools/`, `src/`, `build/`, `out/` | downloads and build output (gitignored) |
