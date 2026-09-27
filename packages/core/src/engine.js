// The thin layer over the Emscripten module: turns the C bridge's call queue
// (native/bridge.c) into promises and its event posts into callbacks.
//
// Runs wherever the Emscripten runtime's main thread is: the dedicated Worker
// in a browser (see worker.js), or the main thread under Node for tests and
// benchmarks. It must never be blocked — VLC's threads proxy filesystem reads
// to it.

const F = {
  SIZE: 0, REQ: 1, FN: 2, I: 3, D: 4, S: 5, RET_I: 6, RET_D: 7, RET_S: 8,
  PLAYER_RING: 9, PLAYER_VIDEO: 10, RING_DATA: 11,
};

/**
 * @param {(moduleArg: object) => Promise<any>} factory the Emscripten factory (libvlc.js default export)
 * @param {{ threads?: number, locateFile?: (path: string, prefix: string) => string,
 *           onEvent?: (player: number, type: number, a: number, b: number, str: string|null) => void,
 *           print?: (s: string) => void, printErr?: (s: string) => void,
 *           wasmBinary?: ArrayBuffer, wasmModule?: WebAssembly.Module, mainScriptUrlOrBlob?: any }} opts
 */
export async function createEngine(factory, opts = {}) {
  const pending = new Map();
  let nextReq = 1;
  const onEvent = opts.onEvent ?? (() => {});

  const moduleArg = {
    // Callers pick their own pool size (index.js 20, node.js 8); 12 is only a fallback.
    pthreadPoolSize: opts.threads ?? 12,
    print: opts.print ?? (() => {}),
    printErr: opts.printErr ?? ((s) => console.warn('[libvlc]', s)),
    // Pointers can be above 2 GB (MAXIMUM_MEMORY is 4 GB): read them and
    // index the heap unsigned throughout, or they turn negative.
    wvDone(ptr) {
      ptr >>>= 0;
      const req = M.HEAP32[(ptr + L[F.REQ]) >>> 2];
      const p = pending.get(req);
      pending.delete(req);
      if (p) p(ptr);
    },
    wvEvent(player, type, a, b, strPtr) {
      strPtr >>>= 0;
      let str = null;
      if (strPtr) {
        str = M.UTF8ToString(strPtr);
        M._free(strPtr);
      }
      onEvent(player, type, a, b, str);
    },
  };
  moduleArg.wvWc = webCodecsHost(() => M);
  if (opts.locateFile) moduleArg.locateFile = opts.locateFile;
  // VLC's threads are Workers running the engine script itself. Browsers
  // refuse cross-origin Worker scripts, so an engine served from a CDN starts
  // them from a same-origin blob that imports it.
  if (opts.mainScriptUrlOrBlob) moduleArg.mainScriptUrlOrBlob = opts.mainScriptUrlOrBlob;
  if (opts.wasmBinary) moduleArg.wasmBinary = opts.wasmBinary;
  if (opts.wasmModule) {
    moduleArg.instantiateWasm = (imports, done) => {
      WebAssembly.instantiate(opts.wasmModule, imports).then((inst) => done(inst, opts.wasmModule));
      return {};
    };
  }

  const M = await factory(moduleArg);
  // Results and player events come back through Emscripten's mailbox, woken
  // by Atomics.waitAsync. WebKit sometimes misses that wakeup and whatever was
  // queued then waits for good (a finished probe() never answered, about 1 in
  // 30), so drain the mailbox on a timer too. Draining an empty one is a no-op.
  const pump = setInterval(() => M._wv_pump(), 150);
  // Under Node it must not be what keeps the process alive.
  pump.unref?.();
  const L = Array.from({ length: 12 }, (_, k) => M._wv_call_layout(k));
  const names = M.UTF8ToString(M._wv_api_names()).split(',').filter(Boolean);
  const fnIndex = Object.fromEntries(names.map((n, k) => [n, k]));

  /**
   * Runs one bridge function on the control thread.
   * @param {string} name api function (see WV_API in bridge.c)
   * @param {{ i?: number[], d?: number[], s?: (string|null)[] }} args
   * @param {'none'|'string'|'json'|'bytes'} ret how to decode ret_s
   * @returns {Promise<{ i: number, d: number, value: any }>} rejects if the
   *   engine is out of memory or a 'json' result does not parse
   */
  function call(name, args = {}, ret = 'none') {
    const fn = fnIndex[name];
    if (fn === undefined) return Promise.reject(new Error(`libvlc-wasm: unknown call ${name}`));
    const size = L[F.SIZE];
    const ptr = M._malloc(size) >>> 0;
    if (!ptr) return Promise.reject(new Error(`libvlc-wasm: out of memory calling ${name}`));
    M.HEAPU8.fill(0, ptr, ptr + size);
    const req = nextReq++;
    M.HEAP32[(ptr + L[F.REQ]) >>> 2] = req;
    M.HEAP32[(ptr + L[F.FN]) >>> 2] = fn;
    (args.i ?? []).forEach((v, k) => { M.HEAP32[(ptr + L[F.I] + 4 * k) >>> 2] = v | 0; });
    (args.d ?? []).forEach((v, k) => { M.HEAPF64[(ptr + L[F.D] + 8 * k) >>> 3] = v; });
    const strs = [];
    for (const [k, v] of (args.s ?? []).entries()) {
      if (v == null) continue;
      const sp = M.stringToNewUTF8(String(v)) >>> 0;
      if (!sp) {
        strs.forEach((q) => M._free(q));
        M._free(ptr);
        return Promise.reject(new Error(`libvlc-wasm: out of memory calling ${name}`));
      }
      strs.push(sp);
      M.HEAP32[(ptr + L[F.S] + 4 * k) >>> 2] = sp;
    }
    return new Promise((resolve, reject) => {
      pending.set(req, (p) => {
        // The block and its result string are ours to free whatever the
        // decoding does; a throw here would otherwise leak both and leave
        // the caller waiting for good.
        let sp = 0;
        try {
          const i = M.HEAP32[(p + L[F.RET_I]) >>> 2];
          const d = M.HEAPF64[(p + L[F.RET_D]) >>> 3];
          sp = M.HEAP32[(p + L[F.RET_S]) >>> 2] >>> 0;
          let value = null;
          if (sp) {
            if (ret === 'bytes') value = M.HEAPU8.slice(sp, sp + Math.max(0, i));
            else if (ret !== 'none') {
              const text = M.UTF8ToString(sp);
              value = ret === 'json' ? JSON.parse(text) : text;
            }
          }
          resolve({ i, d, value });
        } catch (e) {
          reject(new Error(`libvlc-wasm: bad result from ${name}: ${e?.message ?? e}`));
        } finally {
          if (sp) M._free(sp);
          M._free(p);
        }
      });
      M._wv_submit(ptr);
    });
  }

  return {
    Module: M,
    call,
    /** Stops the mailbox timer; the Emscripten runtime itself is the caller's to tear down. */
    dispose() { clearInterval(pump); },
    layout: {
      playerRing: L[F.PLAYER_RING],
      playerVideo: L[F.PLAYER_VIDEO],
      ringData: L[F.RING_DATA],
    },
  };
}

export const EVENT = Object.freeze({
  STATE: 1, BUFFERING: 2, POSITION: 3, LENGTH: 4, TRACKS: 5, TRACK_SELECTED: 6,
  RATE: 7, CAPS: 8, VOUT: 9, STOPPING: 10, META: 11, CHAPTER: 12, TITLES: 13,
  VOLUME: 14, MUTE: 15, PARSED: 16, MEDIA_CHANGED: 17, RECORDING: 18, PROGRAMS: 19, FRAME_STEP: 20, LOG: 100,
});

export const STATE_NAMES = ['idle', 'opening', 'playing', 'paused', 'stopped', 'stopping', 'error'];

/**
 * Options and libvlc_new() arguments reach C as one "\n"-joined string, so a
 * line break (or a NUL, which ends it) inside one would smuggle in others.
 * @param {string[]} list @param {string} what for the error message
 */
export function checkOptions(list, what) {
  for (const o of list) {
    if (/[\x00-\x1f\x7f]/.test(String(o))) throw new Error(`${what}: ${JSON.stringify(o)} contains a control character; give each option as its own array entry`);
  }
  return list;
}

/** Level names to VLC's log verbosity (0 debug .. 4 error); 'off' silences it. */
export const LOG_LEVELS = Object.freeze({ debug: 0, info: 2, notice: 2, warn: 3, warning: 3, error: 4, off: 99 });

/**
 * The JS half of native/webcodecs.c: owns one VideoDecoder per VLC decoder.
 * Runs on the Emscripten runtime thread; every entry point is posted there
 * asynchronously from a VLC decoder thread.
 */
function webCodecsHost(getModule) {
  // VideoFrame.format -> enum wv_layout (native/shared.h). Alpha is dropped.
  const FORMATS = { I420: 0, I422: 1, I444: 2, NV12: 3, I420P10: 4, RGBX: 5, RGBA: 5, BGRX: 6, BGRA: 6, I420A: 0 };
  // sys pointer -> { decoder, config, gen, chain, pending, closing }. A record
  // exists from open() until close(); sys itself is freed (wv_wc_free) only
  // once close() has run and every call below has settled, because C stops
  // waiting on a slow answer (a stalled runtime thread) and goes on.
  const decoders = new Map();

  // VideoFrame.colorSpace -> WV_COLOUR_* bits (native/shared.h). A matrix the
  // frame does not name is left to the stream's own description.
  const MATRIX = { smpte170m: 0, bt470bg: 0, bt709: 1, 'bt2020-ncl': 2 };
  function colour(cs) {
    if (!cs || cs.fullRange == null || !(cs.matrix in MATRIX)) return 0;
    return (1 << 24) | (cs.fullRange ? 1 << 8 : 0) | (MATRIX[cs.matrix] << 12);
  }

  function record(sys) {
    let st = decoders.get(sys);
    if (!st) decoders.set(sys, (st = { gen: 0, chain: Promise.resolve(), pending: new Set(), closing: false }));
    return st;
  }
  /** Runs fn with sys's record, keeping close() from freeing sys until it settles. */
  function track(sys, fn) {
    const st = record(sys);
    const p = Promise.resolve().then(() => fn(st)).catch(() => {});
    st.pending.add(p);
    p.finally(() => st.pending.delete(p));
    return p;
  }

  function make(sys, st) {
    const M = getModule();
    return new VideoDecoder({
      output(frame) {
        const gen = st.gen;
        // copyTo is async; chain the copies so frames reach VLC in order.
        st.chain = st.chain.then(async () => {
          let ptr = 0;
          try {
            if (st.closing) return;
            const rect = frame.visibleRect;
            if (frame.format === null) {
              // A GPU-only frame (e.g. 10-bit hardware HEVC on macOS): copyTo
              // refuses it, so read it back through a 2D canvas as RGBA.
              const w = rect.width, h = rect.height;
              st.readback ??= new OffscreenCanvas(w, h);
              if (st.readback.width !== w || st.readback.height !== h) Object.assign(st.readback, { width: w, height: h });
              const g = st.readback.getContext('2d', { willReadFrequently: true });
              g.drawImage(frame, 0, 0, w, h);
              const px = g.getImageData(0, 0, w, h).data;
              ptr = M._malloc(px.length);
              if (!ptr) return;
              M.HEAPU8.set(px, ptr);
              M._wv_wc_push(sys, gen, ptr, FORMATS.RGBX, w, h, frame.timestamp, 0, w * 4, 0, 0, 0, 0, 0);
              ptr = 0; // C owns it now
              return;
            }
            let format = frame.format;
            const opts = {};
            // A layout we cannot draw is converted by the browser; RGBX is the
            // conversion every engine offers.
            if (!(format in FORMATS)) { opts.format = 'RGBX'; format = 'RGBX'; }
            const size = frame.allocationSize(opts);
            ptr = M._malloc(size);
            if (!ptr) return;
            const layout = await frame.copyTo(new Uint8Array(M.HEAPU8.buffer, ptr, size), opts);
            if (st.closing) return;
            const l = (k) => layout[k] ?? { offset: 0, stride: 0 };
            M._wv_wc_push(sys, gen, ptr, FORMATS[format], rect.width, rect.height, frame.timestamp,
              l(0).offset, l(0).stride, l(1).offset, l(1).stride, l(2).offset, l(2).stride,
              opts.format ? 0 : colour(frame.colorSpace));
            ptr = 0;
          } catch (e) {
            M.printErr?.(`webcodecs: copyTo(${frame.format}): ${e?.message ?? e}`);
            if (!st.closing) M._wv_wc_error(sys);
          } finally {
            if (ptr) M._free(ptr);
            frame.close();
          }
        });
      },
      error(e) {
        if (st.closing) return;
        M.printErr?.(`webcodecs: ${st.config.codec}: ${e?.message ?? e}`);
        M._wv_wc_error(sys);
      },
    });
  }

  return {
    open(sys, codec, width, height, descPtr, descSize) {
      const M = getModule();
      // Read everything from wasm memory now, before the first await.
      const config = { codec, hardwareAcceleration: 'no-preference', optimizeForLatency: false };
      if (width && height) Object.assign(config, { codedWidth: width, codedHeight: height });
      // avcC / hvcC: blocks arrive length-prefixed, WebCodecs' AVC/HEVC format.
      if (descSize) config.description = M.HEAPU8.slice(descPtr, descPtr + descSize);
      track(sys, async (st) => {
        let ok = false;
        try {
          if (typeof VideoDecoder !== 'undefined' && (await VideoDecoder.isConfigSupported(config)).supported && !st.closing) {
            st.config = config;
            st.decoder = make(sys, st);
            st.decoder.configure(config);
            ok = true;
          }
        } catch { ok = false; }
        if (!st.closing) M._wv_wc_opened(sys, ok ? 1 : 0);
      });
    },
    decode(sys, gen, ptr, size, ts, key) {
      const M = getModule();
      const st = decoders.get(sys);
      const data = M.HEAPU8.slice(ptr, ptr + size);
      M._free(ptr);
      if (!st?.decoder || st.closing || gen !== st.gen || st.decoder.state !== 'configured') return;
      try {
        st.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data }));
      } catch {
        M._wv_wc_error(sys);
      }
    },
    /** Decodes one key frame on a throwaway decoder; answers through wv_wc_opened. */
    verify(sys, ptr, size, ts) {
      const M = getModule();
      const data = M.HEAPU8.slice(ptr, ptr + size);
      M._free(ptr);
      track(sys, async (st) => {
        let got = false;
        let probe;
        try {
          // A frame with no CPU-readable format (e.g. 10-bit hardware HEVC on
          // macOS) can only be read back through a canvas, ~20x slower than
          // decoding in software; decline it so VLC falls back.
          probe = new VideoDecoder({
            output: (f) => {
              if (f.format === null) M.printErr?.(`webcodecs: ${st.config.codec}: GPU-only frames, using software decoding`);
              else got = true;
              f.close();
            },
            error: () => {},
          });
          probe.configure(st.config);
          probe.decode(new EncodedVideoChunk({ type: 'key', timestamp: ts, data }));
          await probe.flush();
        } catch (e) {
          M.printErr?.(`webcodecs: ${st.config?.codec}: ${e?.message ?? e}`);
        } finally {
          // Hardware decoder slots are scarce: never leave one open.
          try { probe?.close(); } catch { /* already closed */ }
        }
        if (!st.closing) M._wv_wc_opened(sys, got ? 1 : 0);
      });
    },
    drain(sys, gen) {
      const M = getModule();
      track(sys, async (st) => {
        try { if (st.decoder?.state === 'configured') await st.decoder.flush(); } catch { /* reset or closed meanwhile */ }
        await st.chain;
        if (!st.closing) M._wv_wc_drained(sys, gen);
      });
    },
    reset(sys, gen) {
      const st = decoders.get(sys);
      if (!st?.decoder || st.closing) return;
      st.gen = gen;
      try {
        st.decoder.reset();
        st.decoder.configure(st.config);
      } catch { getModule()._wv_wc_error(sys); }
    },
    /** Called once per sys, by Open (on failure) or Close; frees sys when nothing can call back. */
    async close(sys) {
      const st = record(sys);
      st.closing = true;
      decoders.delete(sys);
      try { st.decoder?.close(); } catch { /* already closed */ }
      await Promise.allSettled([...st.pending, st.chain]);
      getModule()._wv_wc_free(sys);
    },
  };
}
