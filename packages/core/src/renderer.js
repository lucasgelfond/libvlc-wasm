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
precision mediump float;
in vec2 uv;
out vec4 color;
uniform sampler2D y, u, v;
uniform mat3 yuv2rgb;
uniform vec3 offset;
void main() {
  vec3 yuv = vec3(texture(y, uv).r, texture(u, uv).r, texture(v, uv).r) - offset;
  color = vec4(clamp(yuv2rgb * yuv, 0.0, 1.0), 1.0);
}`;

// Limited-range matrices (column-major for GLSL). Height is the usual proxy
// for the colour space when the stream does not say; vmem does not pass it.
const BT601 = [1.164, 1.164, 1.164, 0, -0.392, 2.017, 1.596, -0.813, 0];
const BT709 = [1.164, 1.164, 1.164, 0, -0.213, 2.112, 1.793, -0.533, 0];
const OFFSET = [16 / 255, 128 / 255, 128 / 255];

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
      yuv2rgb: gl.getUniformLocation(this.program, 'yuv2rgb'),
      offset: gl.getUniformLocation(this.program, 'offset'),
    };
    gl.uniform3fv(this.u.offset, OFFSET);
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
      const planes = [0, 1, 2].map((k) => ({
        ptr: h[VIDEO.PLANES + front * 3 + k] >>> 0,
        pitch: h[VIDEO.PITCH + k],
        w: k ? (width + 1) >> 1 : width,
        h: k ? (height + 1) >> 1 : height,
      }));
      const end = planes[2].ptr + planes[2].pitch * planes[2].h;
      if (!planes[0].ptr) return 'idle';
      if (end > this.memory.byteLength) return 'grow';

      const gl = this.gl;
      if (gen !== this.formatGen) {
        this.formatGen = gen;
        this.width = width;
        this.height = height;
        gl.uniformMatrix3fv(this.u.yuv2rgb, false, height >= 720 ? BT709 : BT601);
        planes.forEach((p, k) => {
          gl.activeTexture(gl.TEXTURE0 + k);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, p.pitch, p.h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
          this.scratch[k] = new Uint8Array(p.pitch * p.h);
        });
        // Textures are pitch wide; sample only the visible part.
        gl.uniform2f(this.u.crop, width / planes[0].pitch, 1);
      }
      planes.forEach((p, k) => {
        const n = p.pitch * p.h;
        const dst = this.scratch[k];
        dst.set(new Uint8Array(this.memory, p.ptr, n));
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, p.pitch, p.h, gl.RED, gl.UNSIGNED_BYTE, dst);
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
