// Native baselines on this machine: FFmpeg's own decode benchmark, and
// VLC.app decoding the same way the wasm build is measured (32x, no audio,
// every frame, dummy output).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const VLC = '/Applications/VLC.app/Contents/MacOS/VLC';

export function ffmpegNative(file, threads) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-benchmark', '-threads', String(threads), '-i', file, '-an', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const frames = +([...out.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? 0);
  const rtime = +(/rtime=([\d.]+)s/.exec(out)?.[1] ?? NaN);
  const utime = +(/utime=([\d.]+)s/.exec(out)?.[1] ?? NaN);
  return { frames, seconds: rtime, fps: frames / rtime, cpuSeconds: utime };
}

export function vlcNative(file, threads, frames) {
  if (!existsSync(VLC)) return null;
  // Ten passes over the clip so VLC's ~0.5 s startup is small next to the decode.
  const REPEAT = 10;
  // Software decoding only, like the wasm build: VLC.app otherwise picks its
  // VideoToolbox decoder module (not governed by --avcodec-hw) for H.264/HEVC.
  const av1 = /av1/.test(file);
  const args = ['-I', 'dummy', '--no-audio', '--vout=dummy', '--rate=32', '--no-drop-late-frames', '--no-skip-frames',
    '--no-avcodec-hurry-up', '--avcodec-hw=none', `--codec=${av1 ? 'dav1d' : 'avcodec'},none`,
    `--avcodec-threads=${threads}`, `--dav1d-thread-frames=${threads}`, `--input-repeat=${REPEAT - 1}`,
    '--play-and-exit', file];
  // Subtract VLC's own startup and teardown, measured on a near-empty run.
  const t0 = performance.now();
  spawnSync(VLC, args, { stdio: 'ignore' });
  const secs = (performance.now() - t0) / 1000;
  const t1 = performance.now();
  spawnSync(VLC, ['-I', 'dummy', '--play-and-exit', 'vlc://nop'], { stdio: 'ignore' });
  const overhead = (performance.now() - t1) / 1000;
  const net = Math.max(0.001, secs - overhead);
  return { frames: frames * REPEAT, seconds: net, fps: (frames * REPEAT) / net, startupOverhead: overhead };
}
