// In-browser measurements, driven by bench/run.mjs through Playwright.
import { createVLC } from '../../packages/core/src/index.js';
import { FFmpeg } from '@ffmpeg/ffmpeg';

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
 * Sustained decode rate through the whole player: demux, decode, vmem copy
 * and the page's WebGL upload, at 32x with no audio so the clock never waits.
 */
async function vlcDecode(url, threads = 4, mode = 'software') {
  const vlc = await benchVLC(threads, mode);
  const file = await fetchFile(url);
  const player = await vlc.createPlayer({ canvas, audio: false });
  let tPlaying = 0, tEnd = 0;
  const ended = new Promise((res) => {
    player.on('playing', () => { tPlaying ||= performance.now(); });
    player.on('ended', () => { tEnd = performance.now(); res(); });
    player.on('error', () => { tEnd = performance.now(); res(); });
  });
  const t0 = performance.now();
  await player.open(file, { options: [':no-audio', ':rate=32'] });
  await Promise.race([ended, new Promise((r) => setTimeout(r, 120000))]);
  const status = await player.stats();
  await player.destroy();
  // Decoded, not displayed: the vout can show a frame twice around rate changes.
  const frames = status.decodedVideo || status.framesDisplayed;
  const secs = ((tEnd || performance.now()) - tPlaying) / 1000;
  return { frames, seconds: secs, fps: frames / secs, openToPlayingMs: tPlaying - t0, framesDrawn: status.framesDrawn };
}

let ff = null, ffThreadsLoaded = null;
async function ffmpegWasmDecode(url, threads = 4, mt = true) {
  const key = mt ? 'mt' : 'st';
  if (!ff || ffThreadsLoaded !== key) {
    ff?.terminate();
    ff = new FFmpeg();
    const base = `/node_modules/@ffmpeg/${mt ? 'core-mt' : 'core'}/dist/esm`;
    await ff.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      ...(mt ? { workerURL: `${base}/ffmpeg-core.worker.js` } : {}),
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

window.bench = { startup, vlcDecode, ffmpegWasmDecode, vlcProbeAndThumb, memory };
window.benchReady = true;
