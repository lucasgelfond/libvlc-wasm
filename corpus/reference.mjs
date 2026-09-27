// Ground truth for tests/verify-corpus.mjs: what native tools make of each
// sample's first seconds of audio. Peak level (dBFS) from native FFmpeg, or
// from native VLC.app rendering to WAV when FFmpeg cannot decode the file.
//   node corpus/reference.mjs     writes corpus/reference.json
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(`${here}/manifest.json`, 'utf8'));
const SECONDS = 4;
const VLC = '/Applications/VLC.app/Contents/MacOS/VLC';

function peakDb(file) {
  // FFmpeg logs to stderr, including on success.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-t', String(SECONDS), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 60000 });
  return parse(`${r.stdout ?? ''}${r.stderr ?? ''}`);
}
function parse(text) {
  const m = /max_volume: (-?[\d.]+|-inf) dB/.exec(text);
  if (!m) return null;
  return m[1] === '-inf' ? -Infinity : +m[1];
}

function viaVlc(file) {
  if (!existsSync(VLC)) return null;
  const wav = `${tmpdir()}/libvlc-wasm-ref.wav`;
  rmSync(wav, { force: true });
  try {
    execFileSync(VLC, ['-I', 'dummy', '--no-video', '--aout=afile', `--audiofile-file=${wav}`, `--stop-time=${SECONDS}`, '--play-and-exit', file],
      { stdio: 'ignore', timeout: 60000 });
  } catch { /* VLC exits non-zero on some inputs even after writing audio */ }
  if (!existsSync(wav)) return null;
  const db = peakDb(wav);
  rmSync(wav, { force: true });
  return db;
}

const ref = {};
for (const s of manifest.samples) {
  if (!s.audio) continue;
  const file = resolve(here, 'media', s.file);
  if (!existsSync(file)) continue;
  let db = peakDb(file), source = 'ffmpeg';
  if (db == null || db === -Infinity) {
    const v = viaVlc(file);
    if (v != null) { db = v; source = 'vlc-native'; }
  }
  ref[s.id] = { peakDb: db === -Infinity ? null : db, source: db == null ? 'none' : source };
  console.log(`${s.id.padEnd(46)} ${db == null ? 'n/a' : `${db} dB`}  (${ref[s.id].source})`);
}
writeFileSync(`${here}/reference.json`, JSON.stringify(ref, null, 1));
