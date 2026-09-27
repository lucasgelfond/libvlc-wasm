// Driven by Playwright (tests/verify-corpus.mjs, bench/run.mjs): exposes
// window.harness with one function per measurement. Also usable by hand:
// open /tests/browser/?file=/corpus/media/gen/t_wmv2.wmv
import { createVLC } from '../../packages/core/src/index.js';

const canvas = document.getElementById('c');
const logEl = document.getElementById('log');
const log = (s) => { logEl.textContent += `${s}\n`; };

let vlc = null;
const vlcLogs = [];

async function ensureVLC(opts = {}) {
  if (vlc) return vlc;
  vlc = await createVLC({ logLevel: 'warn', ...opts });
  vlc.on('log', (l) => { vlcLogs.push(`${l.level}: ${l.message}`); if (vlcLogs.length > 400) vlcLogs.shift(); });
  log(`VLC ${vlc.version.version} ready in ${vlc.startupMs.toFixed(0)} ms`);
  return vlc;
}

async function fetchBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const b = await r.blob();
  return new File([b], decodeURIComponent(url.split('/').pop()));
}

/** Can the browser itself play this? loadeddata within the timeout and no error. */
async function nativeCheck(url, timeoutMs = 5000) {
  const kind = /\.(mp3|ogg|oga|opus|flac|wav|aac|m4a|ac3|eac3|dts|thd|mlp|mpc|ape|tta|wv|amr|mod|xm|s3m|it|nsf|spc|vgm|vgz|gbs|sid|mid|midi|ra|au|aiff|aif|voc|gsm|wma)$/i.test(url) ? 'audio' : 'video';
  const el = document.createElement(kind);
  el.muted = true;
  el.preload = 'auto';
  const result = await new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    el.onloadeddata = () => { clearTimeout(t); resolve({ ok: true, reason: 'loadeddata' }); };
    el.onerror = () => { clearTimeout(t); resolve({ ok: false, reason: `error ${el.error?.code}: ${el.error?.message ?? ''}`.trim() }); };
    el.src = url;
  });
  if (result.ok && kind === 'video' && !el.videoWidth) result.audioOnly = true;
  el.removeAttribute('src');
  el.load();
  return result;
}

/** Luma-ish variance and a coarse hash of what is on the canvas. */
function canvasStats() {
  const w = 96, h = 54;
  const c2 = new OffscreenCanvas(w, h);
  const g = c2.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let sum = 0, sum2 = 0, hash = 2166136261;
  for (let k = 0; k < d.length; k += 4) {
    const y = (d[k] * 2 + d[k + 1] * 5 + d[k + 2]) >> 3;
    sum += y; sum2 += y * y;
    if ((k >> 2) % 7 === 0) hash = Math.imul(hash ^ (y >> 4), 16777619) >>> 0;
  }
  const n = d.length / 4;
  return { mean: sum / n, variance: sum2 / n - (sum / n) ** 2, hash };
}

/**
 * Plays `url` through libvlc-wasm for `seconds` and reports what happened.
 * @param {{ url: string, seconds?: number, rate?: number, audio?: boolean, options?: string[] }} c
 */
async function playCase({ url, seconds = 4, rate = 1, audio = true, options = [], seekTo, subtitles, snapshot = false, vlcOptions }) {
  await ensureVLC(vlcOptions);
  vlcLogs.length = 0;
  const file = await fetchBlob(url);
  const ctx = audio ? new AudioContext() : null;
  let analyser = null;
  if (ctx) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // Measure, but never make a sound: tests run on someone's laptop.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    analyser.connect(silent).connect(ctx.destination);
  }
  const player = await vlc.createPlayer({ canvas, audio, audioContext: ctx ?? undefined, audioDestination: analyser ?? undefined });
  const res = { url, bytes: file.size, events: [], error: null };
  let firstFrameAt = 0, playingAt = 0, maxRms = 0, audibleSamples = 0, samples = 0;
  const hashes = new Set();
  let maxVariance = 0;
  let peak = 0, levelReports = 0, audibleReports = 0;
  player.on('audiolevel', (l) => {
    peak = Math.max(peak, l.peak);
    levelReports++;
    if (l.peak > 0.003) audibleReports++;
  });
  player.on('statechange', (s) => res.events.push(s));
  player.on('error', (e) => { res.error = e.message; });
  player.on('ended', () => res.events.push('ended'));

  const t0 = performance.now();
  try {
    await player.open(file, { options });
    if (rate !== 1) player.rate = rate;
    if (subtitles) await player.addSubtitles(await Promise.all(subtitles.map(fetchBlob)));
  } catch (e) {
    res.error = e.message;
  }
  const buf = analyser ? new Float32Array(analyser.fftSize) : null;
  const deadline = t0 + seconds * 1000 + 3000;
  let sought = false;
  while (performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (!playingAt && player.state === 'playing') playingAt = performance.now();
    const drawn = player.renderer?.framesDrawn ?? 0;
    if (drawn && !firstFrameAt) firstFrameAt = performance.now();
    if (drawn) {
      const s = canvasStats();
      // Keep the most detailed frame: short files end and clear the canvas.
      if (snapshot && s.variance >= maxVariance) res.snapshot = canvas.toDataURL('image/jpeg', 0.8);
      maxVariance = Math.max(maxVariance, s.variance);
      hashes.add(s.hash);
    }
    if (analyser) {
      analyser.getFloatTimeDomainData(buf);
      let e = 0;
      for (const v of buf) e += v * v;
      const rms = Math.sqrt(e / buf.length);
      maxRms = Math.max(maxRms, rms);
      samples++;
      if (rms > 0.002) audibleSamples++;
    }
    if (seekTo != null && !sought && playingAt && performance.now() - playingAt > 1500) {
      sought = true;
      await player.seek(seekTo);
    }
    if (res.events.includes('ended') || res.error) break;
    if (playingAt && performance.now() - playingAt > seconds * 1000) break;
  }
  // The worklet reports levels every ~100 ms of output; let the last reports
  // of a short clip land before reading them.
  await new Promise((r) => setTimeout(r, 400));
  const stats = await player.stats().catch(() => ({}));
  res.tracks = player.tracks.map((t) => ({ type: t.type, codec: t.codec, codecName: t.codecName, width: t.width, height: t.height, rate: t.rate, channels: t.channels, selected: t.selected }));
  res.duration = player.duration;
  res.currentTime = player.currentTime;
  res.timings = {
    openToPlayingMs: playingAt ? playingAt - t0 : null,
    openToFirstFrameMs: firstFrameAt ? firstFrameAt - t0 : null,
    playedMs: playingAt ? performance.now() - playingAt : 0,
  };
  res.video = { framesDrawn: player.renderer?.framesDrawn ?? 0, distinctFrames: hashes.size, maxVariance: Math.round(maxVariance) };
  // Measured in the worklet on every sample it plays, so a 200 ms clip counts too.
  res.audio = {
    peak: +peak.toFixed(4),
    framesPlayed: player.audioFramesPlayed ?? 0,
    audibleFraction: levelReports ? +(audibleReports / levelReports).toFixed(2) : 0,
    analyserRms: +maxRms.toFixed(4),
  };
  res.stats = stats;
  res.logs = vlcLogs.slice(-40);
  await player.destroy();
  if (ctx) await ctx.close();
  return res;
}

async function probe(url) {
  await ensureVLC();
  const t0 = performance.now();
  const info = await vlc.probe(await fetchBlob(url));
  return { ms: performance.now() - t0, info };
}

async function thumb(url, opts) {
  await ensureVLC();
  const t0 = performance.now();
  const { blob, width, height } = await vlc.thumbnail(await fetchBlob(url), opts);
  const ms = performance.now() - t0;
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return { ms, width, height, jpeg: b64 };
}

window.harness = { ensureVLC, nativeCheck, playCase, probe, thumb, get vlc() { return vlc; } };
window.harnessReady = true;

const q = new URLSearchParams(location.search).get('file');
if (q) {
  document.body.addEventListener('click', async () => {
    const r = await playCase({ url: q, seconds: 8 });
    log(JSON.stringify(r, null, 2));
  }, { once: true });
  log(`click to play ${q}`);
}
