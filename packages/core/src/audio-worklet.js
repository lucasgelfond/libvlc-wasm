// AudioWorklet side of native/webaudio.c: drains the ring buffer VLC fills.
//
// This file is loaded with audioWorklet.addModule(), so it cannot import
// anything; the ring indices are repeated from layout.js.
const R = {
  WRITE: 1, READ: 2, FLUSH_GEN: 3, FLUSH_POS: 4, PAUSED: 5, ACTIVE: 6,
  VOLUME_MILLI: 8, MUTED: 9, UNDERRUNS: 11, CAPACITY: 13, CHANNELS: 14, HEARTBEAT: 16, DATA_PTR: 17,
};

class VlcRingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.attach(options.processorOptions);
    this.port.onmessage = (e) => {
      if (e.data?.type === 'attach') this.attach(e.data);
      else if (e.data?.type === 'detach') this.hdr = null;
    };
  }

  attach({ memory, ringPtr }) {
    if (!memory) return;
    this.hdr = new Int32Array(memory, ringPtr, 18);
    const cap = this.hdr[R.CAPACITY];
    const ch = this.hdr[R.CHANNELS];
    this.data = new Float32Array(memory, this.hdr[R.DATA_PTR] >>> 0, cap * ch);
    this.cap = cap;
    this.ch = ch;
    this.flushGen = Atomics.load(this.hdr, R.FLUSH_GEN);
    this.meter = { peak: 0, sum: 0, n: 0, frames: 0, since: 0 };
  }

  /** Level metering for the page (VU meters, "is anything audible"), ~10 Hz. */
  report() {
    const m = this.meter;
    this.port.postMessage({
      type: 'level', peak: m.peak, rms: m.n ? Math.sqrt(m.sum / m.n) : 0, frames: m.frames,
    });
    m.peak = 0; m.sum = 0; m.n = 0; m.since = 0;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const frames = out[0].length;
    const hdr = this.hdr;
    if (hdr) Atomics.add(hdr, R.HEARTBEAT, 1);
    if (!hdr || !Atomics.load(hdr, R.ACTIVE) || Atomics.load(hdr, R.PAUSED)) {
      for (const c of out) c.fill(0);
      return true;
    }

    const gen = Atomics.load(hdr, R.FLUSH_GEN);
    if (gen !== this.flushGen) {
      this.flushGen = gen;
      Atomics.store(hdr, R.READ, Atomics.load(hdr, R.FLUSH_POS));
    }

    const read = Atomics.load(hdr, R.READ) >>> 0;
    const avail = ((Atomics.load(hdr, R.WRITE) >>> 0) - read) >>> 0;
    const n = Math.min(avail, frames);
    const gain = Atomics.load(hdr, R.MUTED) ? 0 : Atomics.load(hdr, R.VOLUME_MILLI) / 1000;
    const { cap, ch, data } = this;

    for (let c = 0; c < out.length; c++) {
      const dst = out[c];
      const src = Math.min(c, ch - 1); // mono is copied to both speakers
      let pos = read % cap;
      for (let k = 0; k < n; k++) {
        dst[k] = data[pos * ch + src] * gain;
        if (++pos === cap) pos = 0;
      }
      dst.fill(0, n);
    }
    const m = this.meter;
    const probe = out[0];
    for (let k = 0; k < n; k++) {
      const v = probe[k];
      const a = v < 0 ? -v : v;
      if (a > m.peak) m.peak = a;
      m.sum += v * v;
    }
    m.n += n;
    m.frames += n;
    m.since += frames;
    if (m.since >= sampleRate / 10) this.report();
    Atomics.store(hdr, R.READ, (read + n) | 0);
    if (n < frames && n > 0) Atomics.add(hdr, R.UNDERRUNS, 1);
    return true;
  }
}

registerProcessor('vlc-ring', VlcRingProcessor);
