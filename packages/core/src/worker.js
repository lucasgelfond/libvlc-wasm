// The dedicated Worker that owns the wasm instance. The page talks to it with
// {id, method, args} messages (see client.js); frames and audio never pass
// through here — the page reads them straight out of shared wasm memory.
import createDefaultModule from '../wasm/libvlc.js';
import { createEngine, EVENT } from './engine.js';

let engine = null;
let FS = null;
let mountSeq = 0;
const mounts = new Map(); // mrl -> mountpoint, released with the source

const post = (msg, transfer) => self.postMessage(msg, transfer ?? []);

function onEvent(player, type, a, b, str) {
  post({ type: 'event', player, event: type, a, b, str });
}

/**
 * Makes any supported source reachable by VLC and returns its MRL.
 * File/Blob are mounted with WORKERFS: VLC reads them lazily through
 * FileReaderSync, so a 4 GB file costs no memory up front. Bytes go into
 * MEMFS. URLs are passed through when VLC can reach them itself; http(s) is
 * mapped onto an Emscripten lazy file (synchronous ranged XHR from this
 * worker), because a browser gives VLC no sockets.
 */
function toMrl(src) {
  if (typeof src === 'string') {
    if (/^https?:/i.test(src)) {
      const dir = `/url/${++mountSeq}`;
      FS.mkdirTree(dir);
      const name = decodeURIComponent(new URL(src).pathname.split('/').pop() || 'stream');
      FS.createLazyFile(dir, name, src, true, false);
      const mrl = `file://${dir}/${encodeURIComponent(name)}`;
      mounts.set(mrl, { dir, kind: 'lazy', path: `${dir}/${name}` });
      return mrl;
    }
    return src; // file:///..., or a VLC MRL such as a playlist or archive path
  }
  const dir = `/mnt/${++mountSeq}`;
  FS.mkdirTree(dir);
  let name;
  if (Array.isArray(src)) {
    // Files that refer to each other by name (idx + sub, cue + bin, a
    // playlist and its entries) share one directory; the first is opened.
    const files = src.filter((f) => f instanceof File);
    const blobs = src.filter((f) => !(f instanceof File)).map((b, k) => ({ name: b.name || `part${k}`, data: b }));
    FS.mount(engine.Module.WORKERFS, { files, blobs }, dir);
    // The files of a VIDEO_TS folder are a disc: open the folder with
    // dvdnav (menus, titles) rather than one of its files.
    if (src.some((f) => /^video_ts\.ifo$/i.test(f.name ?? ''))) {
      const mrl = `dvd://${dir}`;
      mounts.set(mrl, { dir, kind: 'workerfs' });
      return mrl;
    }
    name = src[0].name || 'part0';
    mounts.set(`file://${dir}/${encodeURIComponent(name)}`, { dir, kind: 'workerfs' });
  } else if (src instanceof Blob) {
    name = src.name || 'media';
    FS.mount(engine.Module.WORKERFS,
      src instanceof File ? { files: [src] } : { blobs: [{ name, data: src }] }, dir);
    mounts.set(`file://${dir}/${encodeURIComponent(name)}`, { dir, kind: 'workerfs' });
  } else {
    name = src.name || 'media';
    FS.writeFile(`${dir}/${name}`, new Uint8Array(src.data));
    mounts.set(`file://${dir}/${encodeURIComponent(name)}`, { dir, kind: 'memfs', path: `${dir}/${name}` });
  }
  return `file://${dir}/${encodeURIComponent(name)}`;
}

function release(mrl) {
  const m = mounts.get(mrl);
  if (!m) return;
  mounts.delete(mrl);
  try {
    if (m.kind === 'workerfs') FS.unmount(m.dir);
    else FS.unlink(m.path);
    FS.rmdir(m.dir);
  } catch { /* still in use by a player; left for the next run */ }
}

const methods = {
  async init({ threads, wasmUrl, fonts = [], soundfont, moduleUrl }) {
    // Another build of the engine (e.g. libvlc-sout.js, the transcoding
    // variant) is loaded from a URL, so bundlers do not have to know about it.
    const factory = moduleUrl ? (await import(/* @vite-ignore */ moduleUrl)).default : createDefaultModule;
    // Subtitles need a font file: there is no fontconfig and no system font
    // directory in wasm. Fetched alongside the wasm, so it costs no latency.
    const sfData = soundfont ? fetch(soundfont).then(async (r) => {
      if (!r.ok) throw new Error(`soundfont ${soundfont}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }) : null;
    const fontData = Promise.all(fonts.map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`font ${u}: HTTP ${r.status}`);
      return [decodeURIComponent(new URL(u).pathname.split('/').pop()), new Uint8Array(await r.arrayBuffer())];
    }));
    engine = await createEngine(factory, {
      threads,
      locateFile: wasmUrl ? (p) => (p.endsWith('.wasm') ? wasmUrl : p) : undefined,
      onEvent,
      printErr: (s) => post({ type: 'event', player: 0, event: EVENT.LOG, a: 3, b: 0, str: s }),
    });
    FS = engine.Module.FS;
    FS.mkdir('/fonts');
    FS.mkdir('/recordings');
    FS.mkdir('/out');
    const installed = [];
    for (const [name, bytes] of await fontData) {
      FS.writeFile(`/fonts/${name}`, bytes);
      installed.push(`/fonts/${name}`);
    }
    const { value: version } = await engine.call('version', {}, 'json');
    let soundfontPath = null;
    if (sfData) {
      FS.mkdir('/soundfonts');
      soundfontPath = '/soundfonts/default.sf2';
      FS.writeFile(soundfontPath, await sfData);
    }
    return { version, layout: engine.layout, fonts: installed, soundfont: soundfontPath };
  },

  async instance({ args, logLevel }) {
    const { i } = await engine.call('instance_new', { s: [args.join('\n')] });
    if (!i) throw new Error('libvlc_new() failed; check the log for a bad option');
    await engine.call('set_log_level', { i: [i, logLevel] });
    return i;
  },

  memory() {
    return engine.Module.wasmMemory.buffer;
  },

  mount({ source }) { return toMrl(source); },

  /** Hands a file VLC wrote (a recording) to the page and deletes it here. */
  takeFile({ path }) {
    const data = FS.readFile(path);
    FS.unlink(path);
    return { name: path.split('/').pop(), data };
  },
  unmount({ mrl }) { release(mrl); },

  // Every remaining method is a bridge call: {name, i, d, s, ret}.
  async call({ name, i, d, s, ret }) {
    const r = await engine.call(name, { i, d, s }, ret);
    return r;
  },
};

self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    const result = await methods[method](args ?? {});
    post({ type: 'result', id, result });
  } catch (err) {
    post({ type: 'result', id, error: err?.message ?? String(err) });
  }
};
