// In-browser measurements, driven by bench/run.mjs through Playwright.
import { createVLC } from '../../packages/core/src/index.js';
// ffmpeg.wasm is loaded as its UMD build (see ffmpegWasmDecode).
async function loadFFmpegClass() {
  if (!window.FFmpegWASM) {
    await new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement('script'), { src: '/node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js', onload: resolve, onerror: reject });
      document.head.append(s);
    });
  }
  return window.FFmpegWASM.FFmpeg;
}

const canvas = document.getElementById('c');

async function fetchFile(url) {
  const b = await (await fetch(url)).blob();
  return new File([b], url.split('/').pop());
}

/** createVLC() cold-to-ready, split into its phases. */
async function startup(opts = {}) {
  const t0 = performance.now();
  const vlc = await createVLC({ logLevel: 'error', ...opts });
  const ready = performance.now() - t0;
  const nav = performance.getEntriesByType('resource').find((e) => e.name.endsWith('libvlc.wasm'));
  await vlc.destroy();
  return { readyMs: ready, wasmFetchMs: nav ? nav.responseEnd - nav.startTime : null, wasmTransferBytes: nav?.transferSize ?? null };
}

const vlcs = new Map();
/** @param {'software'|'webcodecs'} mode */
async function benchVLC(threads, mode = 'software') {
  const key = `${threads}:${mode}`;
  if (!vlcs.has(key)) {
    vlcs.set(key, await createVLC({
      logLevel: 'error',
      decoderThreads: threads,
      // Decode every frame and never skip: throughput, not smooth playback.
      args: ['--no-drop-late-frames', '--no-skip-frames', '--no-avcodec-hurry-up',
        `--dav1d-thread-frames=${threads}`,
        ...(mode === 'software' ? ['--no-webcodecs'] : [])],
    }));
  }
  return vlcs.get(key);
}

/**
 * Sustained rate through the whole player: demux, decode, vmem copy and
 * WebGL upload, at 32x with no audio so the clock never waits. Frames are
 * counted from the vmem display counter in shared memory, sampled every few
 * ms, over the window from the first frame to the last one.
 */
async function vlcDecode(url, threads = 4, mode = 'software') {
  const vlc = await benchVLC(threads, mode);
  const file = await fetchFile(url);
  const player = await vlc.createPlayer({ canvas, audio: false });
  const t0 = performance.now();
  // Four passes over the clip: a 5 s clip alone is gone in ~0.3 s at 32x.
  await player.open(file, { options: [':no-audio', ':rate=32', ':input-repeat=3'] });
  const DISPLAYED = 22;
  const hdr = () => player.renderer?.hdr;
  let first = 0, firstCount = 0, last = 0, lastCount = 0;
  const deadline = t0 + 120000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 4));
    const n = hdr() ? Atomics.load(hdr(), DISPLAYED) : 0;
    const now = performance.now();
    if (n && !first) { first = now; firstCount = n; }
    if (n !== lastCount) { last = now; lastCount = n; }
    if (first && now - last > 400) break; // nothing new for 400 ms: done
    if (now > deadline) break;
  }
  await player.destroy();
  const frames = lastCount - firstCount;
  const seconds = (last - first) / 1000;
  return { frames: lastCount, fps: frames / seconds, seconds, firstFrameMs: first - t0 };
}

let ff = null, ffThreadsLoaded = null;
async function ffmpegWasmDecode(url, threads = 4, mt = true) {
  const key = mt ? 'mt' : 'st';
  if (!ff || ffThreadsLoaded !== key) {
    ff?.terminate();
    // UMD throughout: the library's classic worker importScripts() the UMD
    // core, whose pthreads importScripts() it again. Mixing in the ESM build
    // fails one way or the other.
    const FFmpeg = await loadFFmpegClass();
    ff = new FFmpeg();
    // The UMD build through blob URLs is what ffmpeg.wasm documents for the
    // multithreaded core: its ESM build spawns pthread workers as classic
    // scripts that contain import statements.
    const base = `/node_modules/@ffmpeg/${mt ? 'core-mt' : 'core'}/dist/umd`;
    const blob = async (u, type) => URL.createObjectURL(new Blob([await (await fetch(u)).arrayBuffer()], { type }));
    await ff.load({
      coreURL: await blob(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await blob(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ...(mt ? { workerURL: await blob(`${base}/ffmpeg-core.worker.js`, 'text/javascript') } : {}),
    });
    ffThreadsLoaded = key;
  }
  const name = url.split('/').pop();
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  await ff.writeFile(name, data);
  let frames = 0;
  const onLog = ({ message }) => { const m = /frame=\s*(\d+)/.exec(message); if (m) frames = +m[1]; };
  ff.on('log', onLog);
  const t0 = performance.now();
  await ff.exec(['-threads', String(threads), '-i', name, '-an', '-f', 'null', '-']);
  const secs = (performance.now() - t0) / 1000;
  ff.off('log', onLog);
  await ff.deleteFile(name);
  return { frames, seconds: secs, fps: frames / secs };
}

/**
 * Time from "here is a file" to its first frame on screen, for a format the
 * browser cannot play: libvlc-wasm plays it directly; with ffmpeg.wasm it has
 * to be transcoded to something <video> accepts first (H.264/AAC MP4 here).
 */
async function firstFrameShowdown(url, seconds = 10) {
  const log = (m) => console.log(`showdown: ${m}`);
  const file = await fetchFile(url);
  // libvlc-wasm
  const vlc = await benchVLC(4, 'software');
  const player = await vlc.createPlayer({ canvas, audio: false });
  const t0 = performance.now();
  await player.open(file);
  while (!(player.renderer?.framesDrawn > 0) && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 2));
  const vlcMs = performance.now() - t0;
  log(`libvlc-wasm first frame after ${vlcMs.toFixed(0)} ms`);
  await player.destroy();

  // ffmpeg.wasm: transcode the first `seconds` (and, separately, the whole file), then <video>.
  const FFmpeg = await loadFFmpegClass();
  ff?.terminate(); ffThreadsLoaded = null;
  ff = new FFmpeg();
  const tl0 = performance.now();
  const base = '/node_modules/@ffmpeg/core-mt/dist/umd';
  const blob = async (u, type) => URL.createObjectURL(new Blob([await (await fetch(u)).arrayBuffer()], { type }));
  await ff.load({
    coreURL: await blob(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await blob(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await blob(`${base}/ffmpeg-core.worker.js`, 'text/javascript'),
  });
  ffThreadsLoaded = 'mt';
  const loadMs = performance.now() - tl0;
  log(`ffmpeg.wasm loaded in ${loadMs.toFixed(0)} ms`);
  const ffLog = ({ message }) => { if (/error|Error|Stream|frame=/.test(message)) log(`ffmpeg: ${message.slice(0, 120)}`); };
  ff.on('log', ffLog);
  const results = { vlcFirstFrameMs: vlcMs, ffmpegLoadMs: loadMs };
  for (const [label, extra] of [['first10s', ['-t', String(seconds)]], ['whole', []]]) {
    const t1 = performance.now();
    log(`transcoding (${label})`);
    await ff.writeFile('in', new Uint8Array(await file.arrayBuffer()));
    // libx264's own threads deadlock ffmpeg.wasm's multithreaded core, a known
    // issue there; x264 has to run single-threaded.
    await ff.exec(['-i', 'in', ...extra, '-c:v', 'libx264', '-preset', 'ultrafast', '-x264-params', 'threads=1',
      '-c:a', 'aac', '-movflags', '+faststart', 'out.mp4']);
    const out = await ff.readFile('out.mp4');
    const video = Object.assign(document.createElement('video'), { muted: true, preload: 'auto', playsInline: true });
    document.body.append(video);
    video.src = URL.createObjectURL(new Blob([out], { type: 'video/mp4' }));
    await Promise.race([
      new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error(`video error ${video.error?.code}`)); }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('video never loaded')), 15000)),
    ]);
    video.remove();
    results[`ffmpegWasm_${label}_Ms`] = performance.now() - t1;
    log(`${label}: first frame after ${results[`ffmpegWasm_${label}_Ms`].toFixed(0)} ms`);
    await ff.deleteFile('in'); await ff.deleteFile('out.mp4');
  }
  return results;
}

async function vlcProbeAndThumb(url) {
  const vlc = await benchVLC(4);
  const file = await fetchFile(url);
  const t0 = performance.now();
  await vlc.probe(file);
  const t1 = performance.now();
  await vlc.thumbnail(file, { width: 320 });
  return { probeMs: t1 - t0, thumbnailMs: performance.now() - t1 };
}

async function memory() {
  if (!performance.measureUserAgentSpecificMemory) return null;
  const m = await performance.measureUserAgentSpecificMemory();
  return m.bytes;
}

window.bench = { startup, vlcDecode, ffmpegWasmDecode, firstFrameShowdown, vlcProbeAndThumb, memory };
window.benchReady = true;
