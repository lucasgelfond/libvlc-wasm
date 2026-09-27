#!/usr/bin/env node
// ffprobe/exiftool-style inspection with VLC's demuxers, plus a thumbnail per
// video file. No browser involved.
//   node examples/node/probe.mjs file [file...] [--thumbs=out-dir]
import { writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createVLC } from 'libvlc-wasm/node';

const args = process.argv.slice(2);
const thumbs = args.find((a) => a.startsWith('--thumbs='))?.split('=')[1];
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: probe.mjs file [file...] [--thumbs=dir]'); process.exit(2); }

const vlc = await createVLC();
console.log(`libvlc ${vlc.version.version}\n`);
if (thumbs) await mkdir(thumbs, { recursive: true });

for (const f of files) {
  const t0 = performance.now();
  try {
    const info = await vlc.probe(f);
    console.log(`${basename(f)}  (${(performance.now() - t0).toFixed(0)} ms)`);
    if (info.duration) console.log(`  duration  ${info.duration.toFixed(2)} s`);
    for (const [k, v] of Object.entries(info.meta)) console.log(`  ${k.padEnd(9)} ${v}`);
    for (const t of info.tracks) {
      const detail = t.type === 'video' ? `${t.width}x${t.height}${t.fps ? ` @ ${t.fps.toFixed(3)}` : ''}`
        : t.type === 'audio' ? `${t.rate} Hz, ${t.channels} ch` : t.language ?? '';
      console.log(`  ${t.type.padEnd(5)}     ${(t.codecName ?? t.codec).padEnd(34)} ${detail}`);
    }
    if (thumbs && info.tracks.some((t) => t.type === 'video')) {
      const { jpeg, width, height } = await vlc.thumbnail(f, { position: 0.25, width: 480 });
      const out = join(thumbs, `${basename(f)}.jpg`);
      await writeFile(out, jpeg);
      console.log(`  thumbnail ${width}x${height} -> ${out}`);
    }
  } catch (e) {
    console.log(`${basename(f)}: ${e.message}`);
  }
  console.log();
}
await vlc.destroy();
process.exit(0);
