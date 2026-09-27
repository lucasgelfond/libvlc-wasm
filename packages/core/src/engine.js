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
    pthreadPoolSize: opts.threads ?? 12,
    print: opts.print ?? (() => {}),
    printErr: opts.printErr ?? ((s) => console.warn('[libvlc]', s)),
    wvDone(ptr) {
      const req = M.HEAP32[(ptr + L[F.REQ]) >> 2];
      const p = pending.get(req);
      pending.delete(req);
      if (p) p(ptr);
    },
    wvEvent(player, type, a, b, strPtr) {
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
  if (opts.wasmBinary) moduleArg.wasmBinary = opts.wasmBinary;
  if (opts.wasmModule) {
    moduleArg.instantiateWasm = (imports, done) => {
      WebAssembly.instantiate(opts.wasmModule, imports).then((inst) => done(inst, opts.wasmModule));
      return {};
    };
  }
  if (opts.mainScriptUrlOrBlob) moduleArg.mainScriptUrlOrBlob = opts.mainScriptUrlOrBlob;

  const M = await factory(moduleArg);
  const L = Array.from({ length: 12 }, (_, k) => M._wv_call_layout(k));
  const names = M.UTF8ToString(M._wv_api_names()).split(',').filter(Boolean);
  const fnIndex = Object.fromEntries(names.map((n, k) => [n, k]));

  /**
   * Runs one bridge function on the control thread.
   * @param {string} name api function (see WV_API in bridge.c)
   * @param {{ i?: number[], d?: number[], s?: (string|null)[] }} args
   * @param {'none'|'string'|'json'|'bytes'} ret how to decode ret_s
   * @returns {Promise<{ i: number, d: number, value: any }>}
   */
  function call(name, args = {}, ret = 'none') {
    const fn = fnIndex[name];
    if (fn === undefined) return Promise.reject(new Error(`libvlc-wasm: unknown call ${name}`));
    const size = L[F.SIZE];
    const ptr = M._malloc(size);
    M.HEAPU8.fill(0, ptr, ptr + size);
    const req = nextReq++;
    M.HEAP32[(ptr + L[F.REQ]) >> 2] = req;
    M.HEAP32[(ptr + L[F.FN]) >> 2] = fn;
    (args.i ?? []).forEach((v, k) => { M.HEAP32[(ptr + L[F.I] + 4 * k) >> 2] = v | 0; });
    (args.d ?? []).forEach((v, k) => { M.HEAPF64[(ptr + L[F.D] + 8 * k) >> 3] = v; });
    (args.s ?? []).forEach((v, k) => {
      if (v != null) M.HEAP32[(ptr + L[F.S] + 4 * k) >> 2] = M.stringToNewUTF8(String(v));
    });
    return new Promise((resolve) => {
      pending.set(req, (p) => {
        const i = M.HEAP32[(p + L[F.RET_I]) >> 2];
        const d = M.HEAPF64[(p + L[F.RET_D]) >> 3];
        const sp = M.HEAP32[(p + L[F.RET_S]) >> 2] >>> 0;
        let value = null;
        if (sp) {
          if (ret === 'bytes') value = M.HEAPU8.slice(sp, sp + i);
          else if (ret !== 'none') {
            const text = M.UTF8ToString(sp);
            value = ret === 'json' ? JSON.parse(text) : text;
          }
          M._free(sp);
        }
        M._free(p);
        resolve({ i, d, value });
      });
      M._wv_submit(ptr);
    });
  }

  return {
    Module: M,
    call,
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
 * The JS half of native/webcodecs.c: owns one VideoDecoder per VLC decoder.
 * Runs on the Emscripten runtime thread; every entry point is posted there
 * asynchronously from a VLC decoder thread.
 */
function webCodecsHost(getModule) {
  const FORMATS = { I420: 0, NV12: 1, I420P10: 2, I422: 3, I444: 4, RGBX: 5, RGBA: 5, BGRX: 6, BGRA: 6, I420A: 0 };
  const decoders = new Map(); // sys pointer -> state

  function make(sys, st) {
    const M = getModule();
    return new VideoDecoder({
      output(frame) {
        const gen = st.gen;
        // copyTo is async; chain the copies so frames reach VLC in order.
        st.chain = st.chain.then(async () => {
          try {
            let format = frame.format;
            const opts = {};
            if (!(format in FORMATS)) { opts.format = 'I420'; format = 'I420'; }
            const rect = frame.visibleRect;
            const size = frame.allocationSize(opts);
            const ptr = M._malloc(size);
            const layout = await frame.copyTo(new Uint8Array(M.HEAPU8.buffer, ptr, size), opts);
            const l = (k) => layout[k] ?? { offset: 0, stride: 0 };
            M._wv_wc_push(sys, gen, ptr, FORMATS[format], rect.width, rect.height, frame.timestamp,
              l(0).offset, l(0).stride, l(1).offset, l(1).stride, l(2).offset, l(2).stride);
          } catch (e) {
            M.printErr?.(`webcodecs: copyTo(${frame.format}): ${e?.message ?? e}`);
            M._wv_wc_error(sys);
          } finally {
            frame.close();
          }
        });
      },
      error(e) {
        M.printErr?.(`webcodecs: ${st.config.codec}: ${e?.message ?? e}`);
        M._wv_wc_error(sys);
      },
    });
  }

  return {
    async open(sys, codec, width, height, descPtr, descSize) {
      const M = getModule();
      let ok = false;
      try {
        if (typeof VideoDecoder !== 'undefined') {
          const config = { codec, hardwareAcceleration: 'no-preference', optimizeForLatency: false };
          if (width && height) Object.assign(config, { codedWidth: width, codedHeight: height });
          // avcC / hvcC: blocks arrive length-prefixed, WebCodecs' AVC/HEVC format.
          if (descSize) config.description = M.HEAPU8.slice(descPtr, descPtr + descSize);
          const { supported } = await VideoDecoder.isConfigSupported(config);
          if (supported) {
            const st = { gen: 0, config, chain: Promise.resolve() };
            st.decoder = make(sys, st);
            st.decoder.configure(config);
            decoders.set(sys, st);
            ok = true;
          }
        }
      } catch { ok = false; }
      M._wv_wc_opened(sys, ok ? 1 : 0);
    },
    decode(sys, gen, ptr, size, ts, key) {
      const M = getModule();
      const st = decoders.get(sys);
      const data = M.HEAPU8.slice(ptr, ptr + size);
      M._free(ptr);
      if (!st || gen !== st.gen || st.decoder.state !== 'configured') return;
      try {
        st.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data }));
      } catch {
        M._wv_wc_error(sys);
      }
    },
    /** Decodes one key frame on a throwaway decoder; answers through wv_wc_opened. */
    async verify(sys, ptr, size, ts) {
      const M = getModule();
      const st = decoders.get(sys);
      const data = M.HEAPU8.slice(ptr, ptr + size);
      M._free(ptr);
      let got = false;
      try {
        const probe = new VideoDecoder({ output: (f) => { got = true; f.close(); }, error: () => {} });
        probe.configure(st.config);
        probe.decode(new EncodedVideoChunk({ type: 'key', timestamp: ts, data }));
        await probe.flush();
        probe.close();
      } catch (e) {
        M.printErr?.(`webcodecs: ${st?.config.codec}: ${e?.message ?? e}`);
      }
      M._wv_wc_opened(sys, got ? 1 : 0);
    },
    async drain(sys, gen) {
      const M = getModule();
      const st = decoders.get(sys);
      try { if (st && st.decoder.state === 'configured') await st.decoder.flush(); } catch { /* reset or closed meanwhile */ }
      if (st) await st.chain;
      M._wv_wc_drained(sys, gen);
    },
    reset(sys, gen) {
      const st = decoders.get(sys);
      if (!st) return;
      st.gen = gen;
      try {
        st.decoder.reset();
        st.decoder.configure(st.config);
      } catch { getModule()._wv_wc_error(sys); }
    },
    close(sys, free) {
      const st = decoders.get(sys);
      decoders.delete(sys);
      try { st?.decoder.close(); } catch { /* already closed */ }
      if (free) (st?.chain ?? Promise.resolve()).then(() => getModule()._wv_wc_free(sys));
    },
  };
}
