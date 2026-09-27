#!/usr/bin/env node
// WASI runtime benchmark for a media-decoding workload (FFmpeg 9.0, C only).
//
//   node bench/wasi/run.mjs                 full sweep: every runtime x variant x clip, 3 iterations
//   node bench/wasi/run.mjs --smoke         1 clip, 1 iteration, validates every runtime (no results written)
//   options: --iters N  --clips h264,vp9  --runtimes wasmtime,wavm  --variants base,simd  --no-write  --recompile
//
// Each run executes decode.c's timed loop (decode only; demux happens before
// the clock starts) and prints {"frames","seconds","fps","checksum"}. A run
// only counts if frames AND checksum equal the native build's, so a runtime
// that decodes garbage cannot score. Slowdown = native fps / runtime fps,
// median of the iterations; the summary is the geometric mean over codecs,
// as in https://00f.net/2026/06/23/webassembly-runtimes-2026/ .
//
// AOT runtimes are compiled once, before timing; compile seconds are recorded
// separately. JIT runtimes (wazero, Node, Bun) compile at startup, which is
// also outside decode.c's timed loop.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.resolve(HERE, '../media');
const OUT = path.join(HERE, 'out');
const AOT = path.join(OUT, 'aot');
const TOOLS = path.join(HERE, 'tools');
mkdirSync(AOT, { recursive: true });

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const SMOKE = argv.includes('--smoke');
const ITERS = Number(opt('iters', SMOKE ? 1 : 3));
const WRITE = !SMOKE && !argv.includes('--no-write');
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : null);
const CLIP_FILTER = list(opt('clips')) ?? (SMOKE ? ['mpeg4asp'] : null);
const RT_FILTER = list(opt('runtimes'));
const VARIANTS = list(opt('variants')) ?? ['base', 'simd'];
const TIMEOUT_MS = Number(opt('timeout', 900)) * 1000;

// ---- helpers ----------------------------------------------------------------
const which = (bin) => {
  const r = spawnSync('/usr/bin/which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const firstExisting = (...ps) => ps.find((p) => p && existsSync(p)) ?? null;
const sh = (bin, args) => {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
  }
};
const firstLine = (s) => s.split('\n').find((l) => l.trim()) ?? '';
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const geomean = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const wasmFile = (variant) => path.join(OUT, variant === 'simd' ? 'decode-simd.wasm' : 'decode.wasm');
const timed = (bin, args) => {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: TIMEOUT_MS * 4 });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  if (r.status !== 0) throw new Error(`${path.basename(bin)} ${args.join(' ')} failed:\n${r.stderr}${r.stdout}`);
  return secs;
};
const lastJson = (s) => {
  const line = s.split('\n').reverse().find((l) => l.startsWith('{'));
  return line ? JSON.parse(line) : null;
};

// ---- tool locations ---------------------------------------------------------
const BIN = {
  wasmtime: which('wasmtime'),
  // the official release tarball has Cranelift + LLVM; Homebrew's is Cranelift-only
  wasmer: firstExisting(path.join(TOOLS, 'wasmer-release/bin/wasmer'), which('wasmer')),
  wasmedge: which('wasmedge'),
  wazero: which('wazero'),
  wavm: firstExisting(path.join(TOOLS, 'wavm/bin/wavm')),
  wamrc: firstExisting(path.join(TOOLS, 'wamr-src/wamr-compiler/build/wamrc')),
  iwasm: firstExisting(path.join(TOOLS, 'wamr-src/product-mini/platforms/darwin/build/iwasm')),
  node: which('node') ?? process.execPath,
  bun: firstExisting(path.join(TOOLS, 'bun/bin/bun'), which('bun')),
  ffmpeg: firstExisting('/opt/homebrew/bin/ffmpeg', which('ffmpeg')),
};
const wasmerHasLlvm = BIN.wasmer && /LLVM/.test(sh(BIN.wasmer, ['-vV']));
const HOST = path.join(HERE, 'wasi-host.mjs');

// ---- runtimes ---------------------------------------------------------------
// prepare(variant) -> { art, compileSeconds }   (once, untimed)
// cmd(art, clip)   -> [bin, args]               (clip is the file name inside MEDIA)
const aot = (name, variant, ext) => path.join(AOT, `${name}-${variant}.${ext}`);
const RUNTIMES = [
  {
    id: 'wavm', label: 'WAVM (nightly, LLVM AOT)', ok: !!BIN.wavm,
    version: () => `nightly-2026-04-05 (${firstLine(sh(BIN.wavm, ['version']))})`,
    prepare: (v) => {
      const art = aot('wavm', v, 'wasm');
      return { art, compileSeconds: timed(BIN.wavm, ['compile', wasmFile(v), art]) };
    },
    cmd: (art, clip) => [BIN.wavm, ['run', '--precompiled', '--mount-root', MEDIA, art, `/${clip}`]],
  },
  {
    id: 'wamr', label: 'WAMR (wamrc AOT, -O3)', ok: !!(BIN.wamrc && BIN.iwasm),
    version: () => firstLine(sh(BIN.iwasm, ['--version'])),
    prepare: (v) => {
      const art = aot('wamr', v, 'aot');
      // x18 is the platform register on Apple arm64 and gets clobbered by the
      // kernel; wamrc's bare "aarch64" target allocates it unless told not to.
      const args = ['--target=aarch64', '--cpu=apple-m3', '--cpu-features=+reserve-x18', '--opt-level=3', '-o', art, wasmFile(v)];
      return { art, compileSeconds: timed(BIN.wamrc, args) };
    },
    cmd: (art, clip) => [BIN.iwasm, [`--map-dir=/media::${MEDIA}`, art, `/media/${clip}`]],
  },
  {
    id: 'wasmedge', label: 'WasmEdge (AOT, --run-mode=aot)', ok: !!BIN.wasmedge,
    version: () => firstLine(sh(BIN.wasmedge, ['--version'])),
    prepare: (v) => {
      const art = aot('wasmedge', v, 'so');
      return { art, compileSeconds: timed(BIN.wasmedge, ['compile', '--optimize', '3', wasmFile(v), art]) };
    },
    // without --run-mode=aot WasmEdge 0.17 interprets even an AOT .so (~90x slower)
    cmd: (art, clip) => [BIN.wasmedge, ['--run-mode=aot', '--dir', `/media:${MEDIA}`, art, `/media/${clip}`]],
  },
  {
    id: 'wasm2c', label: 'wasm2c (clang -O3 -mcpu=native)', ok: existsSync(path.join(OUT, 'decode-wasm2c')),
    version: () => `wabt ${firstLine(sh('wasm2c', ['--version']))}, ${firstLine(sh('clang', ['--version']))}`,
    prepare: (v) => ({ art: path.join(OUT, v === 'simd' ? 'decode-simd-wasm2c' : 'decode-wasm2c'), compileSeconds: null }),
    cmd: (art, clip) => [art, [MEDIA, `/media/${clip}`]],
    okVariant: (v) => existsSync(path.join(OUT, v === 'simd' ? 'decode-simd-wasm2c' : 'decode-wasm2c')),
  },
  {
    id: 'wasmer-llvm', label: 'Wasmer (LLVM)', ok: !!BIN.wasmer && wasmerHasLlvm,
    version: () => firstLine(sh(BIN.wasmer, ['--version'])),
    prepare: (v) => {
      const art = aot('wasmer-llvm', v, 'wasmu');
      return { art, compileSeconds: timed(BIN.wasmer, ['compile', '--llvm', wasmFile(v), '-o', art]) };
    },
    cmd: (art, clip) => [BIN.wasmer, ['run', '--llvm', '--volume', `${MEDIA}:/media`, art, '--', `/media/${clip}`]],
  },
  {
    id: 'wasmer', label: 'Wasmer (Cranelift, default)', ok: !!BIN.wasmer,
    version: () => firstLine(sh(BIN.wasmer, ['--version'])),
    prepare: (v) => {
      const art = aot('wasmer-cranelift', v, 'wasmu');
      return { art, compileSeconds: timed(BIN.wasmer, ['compile', '--cranelift', wasmFile(v), '-o', art]) };
    },
    cmd: (art, clip) => [BIN.wasmer, ['run', '--cranelift', '--volume', `${MEDIA}:/media`, art, '--', `/media/${clip}`]],
  },
  {
    id: 'wasmtime', label: 'Wasmtime (Cranelift)', ok: !!BIN.wasmtime,
    version: () => firstLine(sh(BIN.wasmtime, ['--version'])),
    prepare: (v) => {
      const art = aot('wasmtime', v, 'cwasm');
      return { art, compileSeconds: timed(BIN.wasmtime, ['compile', wasmFile(v), '-o', art]) };
    },
    cmd: (art, clip) => [BIN.wasmtime, ['run', '--allow-precompiled', '--dir', `${MEDIA}::/media`, art, `/media/${clip}`]],
  },
  {
    id: 'wazero', label: 'Wazero (compiler)', ok: !!BIN.wazero,
    version: () => `wazero ${firstLine(sh(BIN.wazero, ['version']))}`,
    prepare: (v) => ({ art: wasmFile(v), compileSeconds: null }),
    cmd: (art, clip) => [BIN.wazero, ['run', '-mount', `${MEDIA}:/media`, art, `/media/${clip}`]],
  },
  {
    id: 'node', label: 'Node (default tiering)', ok: !!BIN.node,
    version: () => `node ${sh(BIN.node, ['--version'])}`,
    prepare: (v) => ({ art: wasmFile(v), compileSeconds: null }),
    cmd: (art, clip) => [BIN.node, ['--no-warnings', HOST, art, MEDIA, `/media/${clip}`]],
  },
  {
    id: 'node-noliftoff', label: 'Node --no-liftoff', ok: !!BIN.node,
    version: () => `node ${sh(BIN.node, ['--version'])}`,
    prepare: (v) => ({ art: wasmFile(v), compileSeconds: null }),
    cmd: (art, clip) => [BIN.node, ['--no-warnings', '--no-liftoff', HOST, art, MEDIA, `/media/${clip}`]],
  },
  {
    id: 'bun', label: 'Bun', ok: !!BIN.bun,
    version: () => `bun ${sh(BIN.bun, ['--version'])}`,
    prepare: (v) => ({ art: wasmFile(v), compileSeconds: null }),
    cmd: (art, clip) => [BIN.bun, [HOST, art, MEDIA, `/media/${clip}`]],
  },
];

// AOT artifacts are reused while they are newer than their .wasm (and the
// compile time measured when they were built is kept beside them), so a re-run
// does not spend minutes recompiling. --recompile forces a fresh compile.
const CACHE = path.join(AOT, 'compile-times.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const prepareCached = (r, v) => {
  const key = `${r.id}/${v}`, c = cache[key];
  if (!argv.includes('--recompile') && c && existsSync(c.art) && statSync(c.art).mtimeMs > statSync(wasmFile(v)).mtimeMs)
    return c;
  const p = r.prepare(v);
  if (p.compileSeconds != null) {
    cache[key] = p;
    writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  }
  return p;
};

// ---- clips + native baseline ------------------------------------------------
const NATIVE = path.join(OUT, 'decode-native');
if (!existsSync(NATIVE) || !existsSync(wasmFile('base'))) {
  console.error('missing out/decode-native or out/decode.wasm - run bench/wasi/build.sh first');
  process.exit(1);
}
const runOnce = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 << 20 });
  const j = r.status === 0 ? lastJson(r.stdout) : null;
  if (!j) {
    const why = r.error ? r.error.message : `exit ${r.status}${r.signal ? ` (${r.signal})` : ''}`;
    throw new Error(`${why}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
  }
  return j;
};

const clips = [];
for (const f of readdirSync(MEDIA).sort()) {
  if (!/\.(mkv|webm|mpg|avi)$/.test(f)) continue;
  const short = f.replace(/_1080p\..*$/, '');
  if (CLIP_FILTER && !CLIP_FILTER.includes(short)) continue;
  let ref;
  try {
    ref = runOnce(NATIVE, [path.join(MEDIA, f)]);
  } catch {
    console.log(`skip ${f}: not decodable by this FFmpeg build (e.g. no AV1 decoder)`);
    continue;
  }
  // Several clips share a codec (mpeg2 at three sizes): label with the size.
  const size = /_(\d+x\d+|\d+p)\./.exec(f)?.[1] ?? '';
  clips.push({ file: f, short, codec: size ? `${ref.codec} ${size}` : ref.codec, frames: ref.frames, checksum: ref.checksum });
}
if (!clips.length) {
  console.error('no clips');
  process.exit(1);
}

// ---- prepare ------------------------------------------------------------------
const selected = [
  { id: 'native', label: 'native C (clang -O3, no asm)', ok: true, version: () => firstLine(sh('clang', ['--version'])),
    prepare: () => ({ art: NATIVE, compileSeconds: null }), cmd: (art, clip) => [art, [path.join(MEDIA, clip)]], variants: ['base'] },
  ...RUNTIMES.filter((r) => r.ok && (!RT_FILTER || RT_FILTER.includes(r.id))),
];
for (const r of RUNTIMES.filter((r) => !r.ok)) console.log(`skip runtime ${r.id}: not installed`);

const meta = {
  date: new Date().toISOString(),
  host: `${os.type()} ${os.release()} ${os.arch()}, ${os.cpus()[0]?.model}, ${os.cpus().length} cpus`,
  iterations: ITERS,
  versions: {},
  compileSeconds: {},
};
const entries = []; // {rt, variant, art}
for (const r of selected) {
  meta.versions[r.id] = r.version();
  for (const v of r.variants ?? VARIANTS) {
    if (v === 'simd' && !existsSync(wasmFile('simd'))) continue;
    if (r.okVariant && !r.okVariant(v)) continue;
    try {
      process.stdout.write(`prepare ${r.id}/${v} ... `);
      const { art, compileSeconds } = prepareCached(r, v);
      meta.compileSeconds[`${r.id}/${v}`] = compileSeconds;
      console.log(compileSeconds == null ? 'ok' : `compiled in ${compileSeconds.toFixed(1)}s`);
      entries.push({ r, v, art, fps: {}, errors: {} });
    } catch (e) {
      console.log(`FAILED\n  ${e.message.split('\n').slice(0, 3).join('\n  ')}`);
    }
  }
}

// ---- run ------------------------------------------------------------------------
// Iterations are the outer loop so slow drift (thermals, background load) is
// spread across runtimes instead of landing on whichever ran last.
for (let it = 0; it < ITERS; it++) {
  for (const clip of clips) {
    for (const e of entries) {
      if (e.errors[clip.short]) continue;
      const [bin, args] = e.r.cmd(e.art, clip.file);
      try {
        const j = runOnce(bin, args);
        if (j.frames !== clip.frames || j.checksum !== clip.checksum)
          throw new Error(`wrong output: ${j.frames} frames / ${j.checksum}, native ${clip.frames} / ${clip.checksum}`);
        (e.fps[clip.short] ??= []).push(j.fps);
        console.log(`[${it + 1}/${ITERS}] ${clip.short.padEnd(9)} ${`${e.r.id}/${e.v}`.padEnd(22)} ${j.fps.toFixed(1).padStart(8)} fps  (${j.frames} frames, ${j.checksum})`);
      } catch (err) {
        e.errors[clip.short] = err.message;
        console.log(`[${it + 1}/${ITERS}] ${clip.short.padEnd(9)} ${`${e.r.id}/${e.v}`.padEnd(22)} ERROR ${err.message}`);
      }
    }
  }
}

// Context only: Homebrew's FFmpeg with its NEON asm, one decode thread.
// -benchmark's rtime covers demux + decode + the null muxer, so it slightly
// understates the decoder's own speed.
const brew = {};
if (BIN.ffmpeg && !(RT_FILTER && !RT_FILTER.includes('ffmpeg'))) {
  meta.versions.ffmpeg_brew = firstLine(sh(BIN.ffmpeg, ['-version']));
  for (const clip of clips) {
    const fps = [];
    for (let it = 0; it < ITERS; it++) {
      const r = spawnSync(BIN.ffmpeg, ['-hide_banner', '-nostats', '-benchmark', '-threads', '1', '-i', path.join(MEDIA, clip.file), '-an', '-f', 'null', '-'], { encoding: 'utf8' });
      const m = /rtime=([\d.]+)s/.exec(r.stderr);
      if (m) fps.push(clip.frames / Number(m[1]));
    }
    if (fps.length) brew[clip.short] = median(fps);
  }
}

// ---- report ---------------------------------------------------------------------
const nativeEntry = entries.find((e) => e.r.id === 'native');
const nativeFps = Object.fromEntries(clips.map((c) => [c.short, median(nativeEntry.fps[c.short] ?? [NaN])]));
const results = entries.map((e) => {
  const perClip = {};
  for (const c of clips) {
    const runs = e.fps[c.short];
    perClip[c.short] = runs?.length
      ? { runs, median_fps: median(runs), slowdown: nativeFps[c.short] / median(runs) }
      : { error: e.errors[c.short] ?? 'not run' };
  }
  const ok = clips.filter((c) => perClip[c.short].slowdown);
  return {
    runtime: e.r.id, label: e.r.label, variant: e.v, compile_seconds: meta.compileSeconds[`${e.r.id}/${e.v}`] ?? null,
    clips: perClip,
    geomean_slowdown: ok.length === clips.length ? geomean(ok.map((c) => perClip[c.short].slowdown)) : null,
  };
});

const fmtX = (x) => (x == null || Number.isNaN(x) ? 'n/a' : `${x.toFixed(2)}x`);
const table = (variant) => {
  const rows = results.filter((r) => r.variant === variant && r.runtime !== 'native')
    .sort((a, b) => (a.geomean_slowdown ?? 1e9) - (b.geomean_slowdown ?? 1e9));
  const head = `| Runtime | ${clips.map((c) => c.codec).join(' | ')} | **geomean** |\n|---|${clips.map(() => '---:').join('|')}|---:|`;
  const body = rows.map((r) => `| ${r.label} | ${clips.map((c) => (r.clips[c.short].slowdown ? fmtX(r.clips[c.short].slowdown) : 'fail')).join(' | ')} | **${fmtX(r.geomean_slowdown)}** |`);
  return [head, ...body].join('\n');
};
const fpsRow = (label, get) => `| ${label} | ${clips.map((c) => { const v = get(c); return v ? v.toFixed(0) : 'n/a'; }).join(' | ')} |`;
const best = (variant) => results.filter((r) => r.variant === variant && r.runtime !== 'native' && r.geomean_slowdown)
  .sort((a, b) => a.geomean_slowdown - b.geomean_slowdown)[0];
const bestBase = best('base');

if (WRITE) {
  writeFileSync(path.join(HERE, 'results.json'), JSON.stringify({ meta, clips, native_fps: nativeFps, homebrew_ffmpeg_fps: brew, results }, null, 2));
  console.log(`\nwrote ${path.join(HERE, 'results.json')} (the site's /benchmarks page renders it)`);
} else {
  console.log('\n' + table('base') + (VARIANTS.includes('simd') ? '\n\n' + table('simd') : ''));
}
