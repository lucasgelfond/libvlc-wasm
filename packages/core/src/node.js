// Headless use under Node: probe files and grab thumbnails with VLC's
// demuxers and decoders, no browser. Playback needs a page (canvas, Web Audio).
//
//   import { createVLC } from '@libvlc-wasm/core/node';
//   const vlc = await createVLC();
//   console.log(await vlc.probe('movie.rm'));
//   await writeFile('thumb.jpg', (await vlc.thumbnail('movie.rm', { time: 10 })).jpeg);
//   await vlc.destroy();
import { resolve } from 'node:path';
import createLibVLCModule from '../wasm/libvlc.js';
import { createEngine, EVENT } from './engine.js';

const LOG_LEVELS = { debug: 0, info: 2, warn: 3, error: 4, off: 99 };

/**
 * @param {{ threads?: number, logLevel?: 'debug'|'info'|'warn'|'error'|'off', args?: string[],
 *           onLog?: (l: { level: number, message: string }) => void }} [opts]
 */
export async function createVLC(opts = {}) {
  // Emscripten's pthread workers are unref()d; without this Node would exit
  // while a call is still waiting on one.
  const keepalive = setInterval(() => {}, 1 << 30);
  const engine = await createEngine(createLibVLCModule, {
    threads: opts.threads ?? 8,
    onEvent: (_p, type, a, _b, str) => { if (type === EVENT.LOG) opts.onLog?.({ level: a, message: str }); },
    printErr: () => {},
  });
  const { FS, NODEFS } = engine.Module;
  FS.mkdir('/host');
  FS.mount(NODEFS, { root: '/' }, '/host');
  const { value: version } = await engine.call('version', {}, 'json');
  const { i: inst } = await engine.call('instance_new', { s: [['--no-video-title-show', ...(opts.args ?? [])].join('\n')] });
  if (!inst) throw new Error('libvlc_new() failed');
  await engine.call('set_log_level', { i: [inst, LOG_LEVELS[opts.logLevel ?? 'off'] ?? 99] });

  const mrl = (path) => `file:///host${encodeURI(resolve(path))}`;

  return {
    version,
    /** Container, tracks and metadata of a local file. */
    async probe(path) {
      const { i, value } = await engine.call('parse', { i: [inst], s: [mrl(path)] }, 'json');
      if (i !== 0 && !value?.tracks?.length) throw new Error(`VLC could not parse ${path}`);
      return value;
    },
    /** One frame as JPEG bytes. time in seconds, or position 0..1. */
    async thumbnail(path, { time, position = 0.1, width = 320, height = 0, crop = false, fast = true } = {}) {
      const { i: size, d: dims, value } = await engine.call('thumbnail', {
        i: [inst, width, height, crop ? 1 : 0, fast ? 1 : 0], d: [time ?? -1, position], s: [mrl(path)],
      }, 'bytes');
      if (size <= 0) throw new Error(`VLC could not decode a frame from ${path}`);
      return { jpeg: value, width: Math.floor(dims / 65536), height: dims % 65536 };
    },
    async destroy() {
      clearInterval(keepalive);
      engine.Module.PThread?.terminateAllThreads?.();
    },
  };
}
