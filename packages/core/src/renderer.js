// Draws the newest decoded frame onto a canvas.
//
// VLC's vout thread writes I420 frames into one of three buffers in wasm
// memory (native/bridge.c, video_lock/video_display). On each animation frame
// this claims the newest one, copies its planes out of the SharedArrayBuffer
// (WebGL refuses shared views) and uploads them as three R8 textures; the
// shader does YUV -> RGB. The claim protocol is what keeps the vout from
// overwriting a frame mid-upload:
//   page: reading = front, then re-check front; vout: never locks front or reading.
import { VIDEO, VIDEO_BUFFERS } from './layout.js';

const VS = `#version 300 es
in vec2 pos;
out vec2 uv;
uniform vec2 scale;
uniform vec2 crop;
void main() {
  uv = vec2((pos.x + 1.0) * 0.5, (1.0 - pos.y) * 0.5) * crop;
  gl_Position = vec4(pos * scale, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D y, u, v;
uniform int mode;          // 0: 8-bit planar, 1: NV12 (u holds interleaved UV), 2: 10-bit planar (RG8 = little-endian 16-bit), 3: RGBX, 4: BGRX
uniform vec4 range;        // y offset, y scale, c offset, c scale
uniform vec2 k;            // Kr, Kb of the colour matrix
float s16(sampler2D t) { vec2 p = texture(t, uv).rg; return (p.r + p.g * 256.0) * 255.0 / 1023.0; }
void main() {
  if (mode == 3) { color = vec4(texture(y, uv).rgb, 1.0); return; }
  if (mode == 4) { color = vec4(texture(y, uv).bgr, 1.0); return; }
  vec3 c;
  if (mode == 1) c = vec3(texture(y, uv).r, texture(u, uv).rg);
  else if (mode == 2) c = vec3(s16(y), s16(u), s16(v));
  else c = vec3(texture(y, uv).r, texture(u, uv).r, texture(v, uv).r);
  float Y = (c.x - range.x) * range.y;
  float Cb = (c.y - range.z) * range.w, Cr = (c.z - range.z) * range.w;
  float r = Y + 2.0 * (1.0 - k.x) * Cr;
  float b = Y + 2.0 * (1.0 - k.y) * Cb;
  float g = (Y - k.x * r - k.y * b) / (1.0 - k.x - k.y);
  color = vec4(clamp(vec3(r, g, b), 0.0, 1.0), 1.0);
}`;

// Header chroma codes (native/bridge.c video_format): low byte = layout,
// bit 8 = full range.
const LAYOUTS = {
  0: { cw: 2, ch: 2, planes: 3, bpp: 1, mode: 0 }, // I420
  1: { cw: 2, ch: 1, planes: 3, bpp: 1, mode: 0 }, // I422
  2: { cw: 1, ch: 1, planes: 3, bpp: 1, mode: 0 }, // I444
  3: { cw: 2, ch: 2, planes: 2, bpp: 1, mode: 1 }, // NV12
  4: { cw: 2, ch: 2, planes: 3, bpp: 2, mode: 2 }, // I420 10-bit
  5: { cw: 1, ch: 1, planes: 1, bpp: 4, mode: 3 }, // RGBX (browser-converted frames)
  6: { cw: 1, ch: 1, planes: 1, bpp: 4, mode: 4 }, // BGRX (Firefox's hardware frames)
};
// Bytes per texel -> [internal format, format]
const TEXEL_FORMATS = { 1: ['R8', 'RED'], 2: ['RG8', 'RG'], 4: ['RGBA8', 'RGBA'] };

// Kr, Kb per matrix code (bits 12-15 of the header's chroma word).
const KR_KB = [[0.299, 0.114], [0.2126, 0.0722], [0.2627, 0.0593]];

export class Renderer {
  /**
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @param {{ fit?: 'contain'|'cover'|'fill', background?: [number, number, number] }} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.fit = opts.fit ?? 'contain';
    this.background = opts.background ?? [0, 0, 0];
    this.sar = 1;
    this.lastSeq = -1;
    this.formatGen = -1;
    this.framesDrawn = 0;
    this.scratch = [];
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, desynchronized: true });
    if (!gl) throw new Error('libvlc-wasm needs WebGL2 to draw video');
    this.gl = gl;
    this.program = link(gl, VS, FS);
    gl.useProgram(this.program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = ['y', 'u', 'v'].map((name, k) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(this.program, name), k);
      return t;
    });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.u = {
      scale: gl.getUniformLocation(this.program, 'scale'),
      crop: gl.getUniformLocation(this.program, 'crop'),
      mode: gl.getUniformLocation(this.program, 'mode'),
      range: gl.getUniformLocation(this.program, 'range'),
      k: gl.getUniformLocation(this.program, 'k'),
    };
  }

  /** Points the renderer at a player's video struct in wasm memory. */
  bind(memory, videoPtr) {
    this.memory = memory;
    this.videoPtr = videoPtr;
    this.hdr = new Int32Array(memory, videoPtr, VIDEO.SIZE);
    this.lastSeq = -1;
    this.formatGen = -1;
  }

  /**
   * Uploads and draws the newest frame if there is one.
   * @returns {'drawn'|'idle'|'grow'} 'grow' means the frame lies beyond the
   *   SharedArrayBuffer we hold: wasm memory grew and the caller should fetch
   *   the new buffer and call bind() again.
   */
  tick() {
    const h = this.hdr;
    if (!h) return 'idle';
    const seq = Atomics.load(h, VIDEO.SEQ);
    if (seq === this.lastSeq) return 'idle';

    let front;
    for (;;) {
      front = Atomics.load(h, VIDEO.FRONT);
      if (front < 0 || front >= VIDEO_BUFFERS) return 'idle';
      Atomics.store(h, VIDEO.READING, front);
      if (Atomics.load(h, VIDEO.FRONT) === front) break;
    }
    try {
      const gen = Atomics.load(h, VIDEO.FORMAT_GEN);
      const width = h[VIDEO.WIDTH], height = h[VIDEO.HEIGHT];
      const code = h[VIDEO.CHROMA];
      const L = LAYOUTS[code & 0xff] ?? LAYOUTS[0];
      const planes = [];
      for (let k = 0; k < L.planes; k++) {
        const pitch = h[VIDEO.PITCH + k];
        const rows = k ? Math.ceil(height / L.ch) : height;
        // Texel layout: 8-bit planes are R8; NV12's UV plane and 10-bit
        // planes are RG8 (two bytes per texel).
        const twoByte = L.bpp === 2 || (L.mode === 1 && k === 1);
        const texel = L.bpp === 4 ? 4 : twoByte ? 2 : 1;
        planes.push({ ptr: h[VIDEO.PLANES + front * 3 + k] >>> 0, pitch, rows, texel, texW: pitch / texel });
      }
      const lastPlane = planes[planes.length - 1];
      if (!planes[0].ptr) return 'idle';
      if (lastPlane.ptr + lastPlane.pitch * lastPlane.rows > this.memory.byteLength) return 'grow';

      const gl = this.gl;
      if (gen !== this.formatGen || code !== this.code) {
        this.formatGen = gen;
        this.code = code;
        this.width = width;
        this.height = height;
        const full = (code & 0x100) !== 0;
        const matrix = (code >> 12) & 0xf;
        const sarNum = h[VIDEO.SAR_NUM], sarDen = h[VIDEO.SAR_DEN];
        if (sarNum && sarDen) this.sar = sarNum / sarDen;
        const tenBit = L.bpp === 2;
        // Limited range is 16-235 (64-940 in 10-bit) for luma and 16-240 for
        // chroma, all around a half-scale chroma zero.
        const max = tenBit ? 1023 : 255;
        const range = full ? [0, 1, (tenBit ? 512 : 128) / max, 1]
          : [(tenBit ? 64 : 16) / max, max / (tenBit ? 876 : 219), (tenBit ? 512 : 128) / max, max / (tenBit ? 896 : 224)];
        gl.uniform4fv(this.u.range, range);
        // The display module sends the stream's matrix (or the by-size
        // convention when the stream does not say).
        gl.uniform2fv(this.u.k, KR_KB[matrix] ?? KR_KB[1]);
        gl.uniform1i(this.u.mode, L.mode);
        planes.forEach((p, k) => {
          gl.activeTexture(gl.TEXTURE0 + k);
          const [internal, fmt] = TEXEL_FORMATS[p.texel];
          gl.texImage2D(gl.TEXTURE_2D, 0, gl[internal], p.texW, p.rows, 0, gl[fmt], gl.UNSIGNED_BYTE, null);
          this.scratch[k] = new Uint8Array(p.pitch * p.rows);
        });
        // Textures are pitch wide; sample only the visible part. Every plane
        // has the same visible/pitch ratio by construction.
        gl.uniform2f(this.u.crop, (width * L.bpp) / planes[0].pitch, 1);
      }
      planes.forEach((p, k) => {
        const dst = this.scratch[k];
        dst.set(new Uint8Array(this.memory, p.ptr, p.pitch * p.rows));
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, p.texW, p.rows, gl[TEXEL_FORMATS[p.texel][1]], gl.UNSIGNED_BYTE, dst);
      });
    } finally {
      Atomics.store(h, VIDEO.READING, -1);
    }
    this.lastSeq = seq;
    this.draw();
    this.framesDrawn++;
    return 'drawn';
  }

  /** Redraws the last frame, e.g. after the canvas is resized. */
  draw() {
    const gl = this.gl;
    const c = this.canvas;
    if (c.clientWidth !== undefined) {
      const dpr = globalThis.devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr), hgt = Math.round(c.clientHeight * dpr);
      if (w && hgt && (c.width !== w || c.height !== hgt)) { c.width = w; c.height = hgt; }
    }
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(...this.background, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.width) return;
    const src = (this.width * this.sar) / this.height;
    const dst = c.width / c.height;
    let sx = 1, sy = 1;
    if (this.fit !== 'fill') {
      const wider = src > dst;
      if ((this.fit === 'contain') === wider) sy = dst / src; else sx = src / dst;
    }
    gl.uniform2f(this.u.scale, sx, sy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Drops the picture (on stop) so a stale frame is not left on screen. */
  clear() {
    this.width = 0;
    this.lastSeq = -1;
    this.draw();
  }

  destroy() {
    const gl = this.gl;
    this.tex.forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.program);
    this.hdr = null;
  }
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
