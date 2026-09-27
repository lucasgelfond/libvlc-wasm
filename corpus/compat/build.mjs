// Per-file compatibility matrix for the test corpus: does each tool decode
// each sample? Measures native VLC.app, native FFmpeg and ffmpeg.wasm, and
// copies through the libvlc-wasm, browser and vlc.js results already on disk.
//
//   node corpus/compat/build.mjs                    measure everything, write compat.json
//   node corpus/compat/build.mjs --measure=vlc      re-measure one tool (vlc,ffmpeg,wasm; comma list)
//   node corpus/compat/build.mjs --measure=none     only re-merge measurements.json + inputs
//   node corpus/compat/build.mjs --ids=a,b          limit measuring to these sample ids
//
// Raw per-tool measurements are kept in measurements.json so a merge never
// needs to re-run the tools. Nothing here plays sound: VLC renders audio to a
// WAV file (afile) and video to its statistics vout, FFmpeg decodes to the null
// muxer, and ffmpeg.wasm runs in Chromium launched with --mute-audio.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync, openSync, readSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const media = `${root}/corpus/media`;
const scratch = `${root}/.scratch/compat`;
mkdirSync(scratch, { recursive: true });

const VLC = '/Applications/VLC.app/Contents/MacOS/VLC';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const SECONDS = 10; // every tool decodes at most the first 10 s

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const measure = new Set(String(args.measure ?? 'vlc,ffmpeg,wasm').split(',').filter((x) => x && x !== 'none'));
const onlyIds = args.ids ? new Set(String(args.ids).split(',')) : null;

const manifest = JSON.parse(readFileSync(`${root}/corpus/manifest.json`, 'utf8'));
const measPath = `${here}/measurements.json`;
const meas = existsSync(measPath) ? JSON.parse(readFileSync(measPath, 'utf8')) : { tools: {}, vlc: {}, ffmpeg: {}, wasm: {} };
const saveMeas = () => writeFileSync(measPath, `${JSON.stringify(meas, null, 1)}\n`);

// What to decode for each sample: the file itself, except the VobSub pair,
// which the manifest tests as subtitles over a generated MPEG-2 clip.
function job(s) {
  const file = `${media}/${s.file}`;
  const hasVideo = !!s.video, hasAudio = !!s.audio;
  if (s.test?.mode === 'subtitles-over') {
    return { file, hasVideo, hasAudio, subs: true, overVideo: `${media}/${s.test.video}`, companions: [file.replace(/\.idx$/, '.sub')] };
  }
  return { file, hasVideo, hasAudio, subs: false, companions: [] };
}
const todo = manifest.samples.filter((s) => !onlyIds || onlyIds.has(s.id));

// ---------------------------------------------------------------------------
// Shared FFmpeg command lines and log parsing (native and wasm run the same).
// `-map 0:V` (capital) skips attached cover pictures.
function ffmpegArgs(input, kind) {
  const base = ['-hide_banner', '-nostdin', '-i', input];
  if (kind === 'video') return [...base, '-map', '0:V:0?', '-an', '-sn', '-dn', '-t', String(SECONDS), '-f', 'null', '-'];
  if (kind === 'audio') return [...base, '-map', '0:a:0?', '-vn', '-sn', '-dn', '-t', String(SECONDS), '-af', 'volumedetect', '-f', 'null', '-'];
  // Subtitles: decode, re-encode as DVD subtitles, discard. Bytes out > 0 means packets decoded.
  return [...base, '-map', '0:s:0?', '-c:s', 'dvdsub', '-f', 'null', '-'];
}
function parseFfmpeg(log, kind) {
  const input = log.split(/Stream mapping:|Output #0/)[0];
  const streams = [...input.matchAll(/Stream #0:\d+[^:]*: (Video|Audio|Subtitle): ([\w-]+)/g)].map((m) => `${m[1].toLowerCase()}:${m[2]}`);
  const errors = log.split('\n').filter((l) => /error|invalid|not supported|unsupported|could not|failed|no decoder|unknown/i.test(l) && !/^\s*(Stream|Metadata)|muxing overhead|harmless|^\[out#/.test(l));
  const r = { streams: [...new Set(streams)], firstError: errors[0]?.trim().slice(0, 200) ?? null, errorLines: errors.length };
  if (kind === 'video') r.frames = +([...log.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? 0);
  if (kind === 'audio') {
    r.samples = Math.max(0, ...[...log.matchAll(/n_samples: (\d+)/g)].map((m) => +m[1]));
    const mv = /max_volume: (-?[\d.]+|-inf) dB/.exec(log)?.[1];
    r.peakDb = mv == null || mv === '-inf' ? null : +mv;
  }
  if (kind === 'subs') {
    const m = /subtitle:\s*([\d.]+)([kKMG]?)i?B/.exec(log);
    r.subtitleKiB = m ? +m[1] * ({ '': 1 / 1024, k: 1, K: 1, M: 1024, G: 1024 * 1024 }[m[2]]) : 0;
  }
  return r;
}

function run(cmd, argv, { timeoutMs = 60000 } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutMs);
    p.on('close', (code) => { clearTimeout(t); res({ code, out, timedOut }); });
  });
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ---------------------------------------------------------------------------
// Native FFmpeg
if (measure.has('ffmpeg')) {
  meas.tools.ffmpeg = execFileSync(FFMPEG, ['-version']).toString().split('\n')[0].replace(/ Copyright.*/, '');
  for (const s of todo) {
    const j = job(s);
    const r = {};
    if (j.subs) r.subs = parseFfmpeg((await run(FFMPEG, ffmpegArgs(j.file, 'subs'))).out, 'subs');
    else {
      r.video = parseFfmpeg((await run(FFMPEG, ffmpegArgs(j.file, 'video'))).out, 'video');
      r.audio = parseFfmpeg((await run(FFMPEG, ffmpegArgs(j.file, 'audio'))).out, 'audio');
    }
    meas.ffmpeg[s.id] = r;
    console.log(`ffmpeg  ${s.id.padEnd(44)} v=${r.video?.frames ?? '-'} a=${r.audio?.samples ?? '-'} s=${r.subs?.subtitleKiB ?? '-'}`);
  }
  saveMeas();
}

// ---------------------------------------------------------------------------
// Native VLC 3: statistics vout (logs "VOUT got" per displayed picture, opens
// no window) and the afile aout (decoded audio to WAV, never to a speaker).
function wavInfo(path) {
  if (!existsSync(path)) return { seconds: 0, bytes: 0 };
  const size = statSync(path).size;
  const fd = openSync(path, 'r');
  const h = Buffer.alloc(Math.min(size, 4096));
  readSync(fd, h, 0, h.length, 0);
  closeSync(fd);
  let channels = 2, rate = 44100, bits = 16, data = Math.max(0, size - 44);
  for (let o = 12; o + 8 <= h.length;) {
    const id = h.toString('ascii', o, o + 4), len = h.readUInt32LE(o + 4);
    if (id === 'fmt ') { channels = h.readUInt16LE(o + 10); rate = h.readUInt32LE(o + 12); bits = h.readUInt16LE(o + 22); }
    if (id === 'data') { data = Math.min(size - o - 8, len || size - o - 8); break; }
    o += 8 + len;
  }
  return { bytes: data, seconds: data / (rate * channels * (bits / 8) || 1) };
}
// The statistics vout needs a fixed chroma, or VLC fails to build a converter
// for palettized (Smacker, FLIC) and VideoToolbox (CVPX) pictures.
async function vlcRun(s, j, extra = []) {
  const wav = `${scratch}/vlc-${s.id}.wav`;
  rmSync(wav, { force: true });
  const argv = ['-I', 'dummy', '-vv', '--no-media-library', '--no-video-title-show', '--no-osd', '--no-metadata-network-access',
    '--no-sub-autodetect-file', '--no-loop', '--no-repeat', '--no-drop-late-frames', '--no-skip-frames',
    '--vout=stats', '--dummy-chroma=I420', '--aout=afile', `--audiofile-file=${wav}`, `--run-time=${SECONDS}`, '--play-and-exit', ...extra];
  if (j.subs) argv.push(j.overVideo, `--sub-file=${j.file}`);
  else argv.push(j.file);
  const { out, timedOut } = await run(VLC, argv, { timeoutMs: 45000 });
  const w = wavInfo(wav);
  let peakDb = null;
  if (w.bytes > 0) {
    const m = /max_volume: (-?[\d.]+|-inf) dB/.exec((await run(FFMPEG, ['-hide_banner', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'])).out)?.[1];
    peakDb = m == null || m === '-inf' ? null : +m;
  }
  rmSync(wav, { force: true });
  const r = {
    frames: (out.match(/VOUT got/g) ?? []).length,
    audioSeconds: +w.seconds.toFixed(3),
    peakDb,
    demux: [...new Set([...out.matchAll(/using demux module "([^"]+)"/g)].map((m) => m[1]))],
    decoders: [...new Set([...out.matchAll(/using (video|audio|spu) decoder module "([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`))],
    noDecoder: [...new Set([...out.matchAll(/(?:no suitable decoder module for fourcc `(.{4})'|Codec `(.{4})' \(([^)]*)\) is not supported)/g)].map((m) => (m[1] ?? `${m[2]} (${m[3]})`).trim()))],
    late: (out.match(/picture is too late|late frames, dropping/g) ?? []).length,
    timedOut,
  };
  if (j.subs) {
    r.subpictureDrops = (out.match(/can't get output subpicture/g) ?? []).length;
    r.vobsubTracks = (out.match(/New vobsub track detected/g) ?? []).length;
  }
  return r;
}
async function vlcOne(s) {
  const j = job(s);
  const r = await vlcRun(s, j);
  // VLC.app prefers VideoToolbox for H.264/HEVC. When the default path shows
  // nothing, say whether VLC's software decoder would have.
  if (j.hasVideo && !j.subs && r.frames === 0) {
    const sw = await vlcRun(s, j, ['--codec=avcodec,none', '--avcodec-hw=none']);
    r.software = { frames: sw.frames, decoders: sw.decoders };
  }
  meas.vlc[s.id] = r;
  console.log(`vlc     ${s.id.padEnd(44)} frames=${r.frames}${r.software ? ` (sw ${r.software.frames})` : ''} audio=${r.audioSeconds}s dec=${r.decoders.join(',')}${r.noDecoder.length ? ` NO:${r.noDecoder}` : ''}`);
}
if (measure.has('vlc') || !meas.tools.nativeVlc || meas.tools.nativeVlc === 'unknown') {
  meas.tools.nativeVlc = /VLC (?:media player|version) ([\d.]+)/.exec((await run(VLC, ['--version'])).out)?.[1] ?? 'unknown';
}
if (measure.has('vlc')) {
  // VLC paces playback in real time, so run a few at once.
  await pool(todo, 4, vlcOne);
  saveMeas();
}

// ---------------------------------------------------------------------------
// ffmpeg.wasm 0.12 (single-threaded core, UMD build through blob URLs) in
// Chromium, on the repo's cross-origin isolated Vite server.
if (measure.has('wasm')) {
  const { startServer, openHarness } = await import('../../tests/lib/browser.mjs');
  const { server, url } = await startServer();
  let h;
  const open = async () => {
    if (h) await h.browser.close().catch(() => {});
    h = await openHarness(url, 'chromium'); // headless, --mute-audio
    await h.page.evaluate(async () => {
      const load = (src) => new Promise((ok, no) => document.head.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: no })));
      if (!window.FFmpegWASM) await load('/node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js');
      const blob = async (u, type) => URL.createObjectURL(new Blob([await (await fetch(u)).arrayBuffer()], { type }));
      const base = '/node_modules/@ffmpeg/core/dist/umd';
      const coreURL = await blob(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await blob(`${base}/ffmpeg-core.wasm`, 'application/wasm');
      window.compatLoad = async () => {
        window.ff?.terminate();
        window.ff = new window.FFmpegWASM.FFmpeg();
        await window.ff.load({ coreURL, wasmURL });
      };
      window.compatExec = async (argv) => {
        const lines = [];
        const onLog = ({ message }) => lines.push(message);
        window.ff.on('log', onLog);
        let code;
        try { code = await window.ff.exec(argv, 60000); } catch (e) { lines.push(`exec threw: ${e.message}`); code = -1; }
        window.ff.off('log', onLog);
        return { code, log: lines.join('\n') };
      };
      await window.compatLoad();
    });
  };
  await open();
  const version = await h.page.evaluate(() => window.compatExec(['-version']));
  meas.tools.ffmpegWasm = `@ffmpeg/core 0.12.10 (${/ffmpeg version (\S+)/.exec(version.log)?.[1] ?? 'unknown'})`;
  for (const s of todo) {
    const j = job(s);
    const names = [j.file, ...j.companions].map((f) => basename(f));
    const exec = async (kind) => {
      const input = basename(j.file);
      const argv = ffmpegArgs(input, kind);
      try {
        return await Promise.race([
          h.page.evaluate(async ([files, argv]) => {
            for (const f of files) await window.ff.writeFile(f.split('/').pop(), new Uint8Array(await (await fetch(f)).arrayBuffer()));
            const r = await window.compatExec(argv);
            for (const f of files) await window.ff.deleteFile(f.split('/').pop()).catch(() => {});
            // ffmpeg.wasm keeps state across exec calls poorly after errors; start clean each time.
            await window.compatLoad();
            return r;
          }, [[j.file, ...j.companions].map((f) => `/corpus/media/${f.slice(media.length + 1)}`), argv]),
          new Promise((_, no) => setTimeout(() => no(new Error('page timeout')), 120000)),
        ]);
      } catch (e) {
        await open();
        return { code: -1, log: `harness: ${e.message}` };
      }
    };
    const r = {};
    if (j.subs) r.subs = parseFfmpeg((await exec('subs')).log, 'subs');
    else {
      const v = await exec('video'); r.video = { ...parseFfmpeg(v.log, 'video'), code: v.code };
      const a = await exec('audio'); r.audio = { ...parseFfmpeg(a.log, 'audio'), code: a.code };
    }
    void names;
    meas.wasm[s.id] = r;
    console.log(`wasm    ${s.id.padEnd(44)} v=${r.video?.frames ?? '-'} a=${r.audio?.samples ?? '-'} s=${r.subs?.subtitleKiB ?? '-'}`);
  }
  saveMeas();
  await h.browser.close();
  await server.close();
}

// ---------------------------------------------------------------------------
// Merge
const results = JSON.parse(readFileSync(`${root}/corpus/results/results.json`, 'utf8'));
const vlcjs = JSON.parse(readFileSync(`${root}/bench/compare/vlcjs-results.json`, 'utf8'));
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const res = byId(results.results), vj = byId(vlcjs.results);

const db = (x) => (x == null ? 'silent (-inf dB)' : `peak ${x} dB`);
function ffVerdict(m, j) {
  if (!m) return { video: null, audio: null, note: 'not measured' };
  if (j.subs) {
    const ok = m.subs.subtitleKiB > 0;
    return { video: null, audio: null, subtitles: ok, note: ok ? `${m.subs.subtitleKiB} KiB of subpictures decoded` : `no subtitles decoded${m.subs.firstError ? `: ${m.subs.firstError}` : ''}` };
  }
  const video = j.hasVideo ? m.video.frames > 0 : null;
  const audio = j.hasAudio ? m.audio.samples > 0 : null;
  const bits = [];
  if (j.hasVideo) bits.push(`${m.video.frames} video frames`);
  if (j.hasAudio) bits.push(m.audio.samples > 0 ? `${m.audio.samples} audio samples, ${db(m.audio.peakDb)}` : 'no audio decoded');
  const err = (j.hasVideo && !video ? m.video.firstError : null) ?? (j.hasAudio && !audio ? m.audio.firstError : null);
  if (err) bits.push(`error: ${err}`);
  else {
    const n = (j.hasVideo ? m.video.errorLines : 0) + (j.hasAudio ? m.audio.errorLines : 0);
    if (n > 0) bits.push(`${n} warning/error lines logged`);
  }
  return { video, audio, note: bits.join('; ') };
}
function vlcVerdict(m, j, s) {
  if (!m) return { video: null, audio: null, note: 'not measured' };
  const bits = [];
  if (j.subs) {
    const ok = m.decoders.includes('spu:spudec') && m.vobsubTracks > 0;
    return {
      video: null, audio: null, subtitles: ok,
      note: `${ok ? 'vobsub track demuxed and spudec decoder opened' : 'VobSub not decoded'} as --sub-file over ${s.test.video} (${m.frames} pictures)${m.subpictureDrops ? `; ${m.subpictureDrops} subpictures could not be output` : ''}; blending onto the picture is not verified`,
    };
  }
  const video = j.hasVideo ? m.frames > 0 : null;
  const audio = j.hasAudio ? m.audioSeconds > 0 : null;
  if (j.hasVideo) bits.push(`${m.frames} pictures displayed`);
  if (j.hasAudio) bits.push(m.audioSeconds > 0 ? `${m.audioSeconds} s audio, ${db(m.peakDb)}` : 'no audio decoded');
  if (m.decoders.length) bits.push(`decoders ${m.decoders.join(', ')}`);
  if (m.software) bits.push(`with software decoding forced (--codec=avcodec,none): ${m.software.frames} pictures`);
  if (m.noDecoder.length) bits.push(`no decoder for ${m.noDecoder.join(', ')}`);
  if (!m.demux.length) bits.push('no demuxer claimed the file');
  if (s.test?.needs === 'soundfont') bits.push('VLC.app renders MIDI with its AudioToolbox synth (built-in GM bank), no soundfont needed');
  if (m.timedOut) bits.push('killed after 45 s');
  return { video, audio, note: bits.join('; ') };
}

const tools = {
  nativeVlc: meas.tools.nativeVlc ?? '3.0.24',
  ffmpeg: meas.tools.ffmpeg ?? null,
  ffmpegWasm: meas.tools.ffmpegWasm ?? null,
  libvlcWasm: `corpus/results/results.json (${results.date})`,
  browsers: results.nativeEngines ?? 'corpus/results/results.json',
  vlcjs: `addyosmani/vlc.js, bench/compare/vlcjs-results.json (${vlcjs.date})`,
};
const samples = manifest.samples.map((s) => {
  const j = job(s), r = res[s.id], v = vj[s.id];
  const lv = r?.vlc;
  return {
    id: s.id, name: s.name, category: s.category, container: s.container, video: s.video, audio: s.audio,
    file: s.file, url: s.url, bytes: existsSync(j.file) ? statSync(j.file).size : s.bytes, whyBrowserCant: s.whyBrowserCant,
    nativeVlc: vlcVerdict(meas.vlc[s.id], j, s),
    ffmpeg: ffVerdict(meas.ffmpeg[s.id], j),
    ffmpegWasm: ffVerdict(meas.wasm[s.id], j),
    libvlcWasm: lv ? {
      passed: lv.passed, checks: lv.checks ?? null,
      note: lv.knownIssue ?? (lv.expectedFailure ? `expected failure: ${lv.expectedFailure}` : null) ?? lv.error ?? null,
    } : null,
    browsers: r ? Object.fromEntries(['chromium', 'webkit', 'firefox'].map((e) => [e, r.native?.[e]?.ok ?? null])) : null,
    vlcjs: v ? v.video === true : null,
  };
});
const outPath = `${here}/compat.json`;
writeFileSync(outPath, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), tools, samples }, null, 1)}\n`);
console.log(`wrote ${outPath} (${samples.length} samples)`);
