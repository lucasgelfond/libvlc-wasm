// The Sega Genesis sample (static/samples/wasm-drive.vgm): a tune of our own,
// written out here as the register writes a Mega Drive / Genesis sound driver
// would make, 60 times a second, to its two sound chips:
//   YM2612 (FM)   ch1 slap bass, ch2 brass lead (with LFO vibrato),
//                 ch3-5 a slow-attack chord pad, ch6 a kick drum (pitch sweep)
//   SN76489 (PSG) tone 0 a square-wave arpeggio, tone 1 its echo, noise the
//                 snare and hi-hats
// Nothing is sampled or borrowed: the patches, the score and the drums are all
// numbers in this file. D minor, 128 BPM, about 52 s, then it loops back to the
// first verse.
//   node apps/player/scripts/make-vgm.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../static/samples/wasm-drive.vgm');

const FM_CLOCK = 7670453, PSG_CLOCK = 3579545;
const FRAMES_PER_ROW = 7; // 16th notes at 60 Hz: 128.6 BPM

// -- Notes -----------------------------------------------------------------
const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const n = (s) => { const m = /^([A-G][#b]?)(\d)$/.exec(s); return NAMES[m[1]] + 12 * +m[2]; };
const hz = (note) => 440 * 2 ** ((note - 57) / 12);

// -- The command stream ----------------------------------------------------
const cmds = [];
let frame = 0;
let loopByte = -1, loopFrame = 0;
const fm = (port, reg, val) => cmds.push(port ? 0x53 : 0x52, reg, val & 0xff);
const psg = (val) => cmds.push(0x50, val & 0xff);

// FM channel c is 0..5; ch 1-3 on port 0, 4-6 on port 1.
const chPort = (c) => (c < 3 ? 0 : 1);
const chOff = (c) => c % 3;
const keyCode = (c) => (c < 3 ? c : c + 1);
const OPS = [0, 4, 8, 12]; // register order: S1, S3, S2, S4

/** Patch: alg, fb, and per operator (register order S1 S3 S2 S4) [dt, mul, tl, rs, ar, d1r, d2r, sl, rr]. */
function setPatch(c, p) {
  const port = chPort(c), o = chOff(c);
  p.ops.forEach(([dt, mul, tl, rs, ar, d1r, d2r, sl, rr], i) => {
    const r = OPS[i] + o;
    fm(port, 0x30 + r, (dt << 4) | mul);
    fm(port, 0x40 + r, tl);
    fm(port, 0x50 + r, (rs << 6) | ar);
    fm(port, 0x60 + r, d1r);
    fm(port, 0x70 + r, d2r);
    fm(port, 0x80 + r, (sl << 4) | rr);
    fm(port, 0x90 + r, 0);
  });
  fm(port, 0xb0 + o, (p.fb << 3) | p.alg);
  fm(port, 0xb4 + o, 0xc0 | (p.pms ?? 0));
}
function setFreq(c, f) {
  let block = 0, fnum = 0;
  for (block = 0; block < 8; block++) {
    fnum = Math.round((f * 144 * 2 ** 20) / FM_CLOCK / 2 ** (block - 1));
    if (fnum < 0x800) break;
  }
  fm(chPort(c), 0xa4 + chOff(c), (block << 3) | (fnum >> 8));
  fm(chPort(c), 0xa0 + chOff(c), fnum & 0xff);
}
const keyOn = (c) => fm(0, 0x28, 0xf0 | keyCode(c));
const keyOff = (c) => fm(0, 0x28, keyCode(c));
const psgTone = (ch, f) => { const d = Math.min(1023, Math.round(PSG_CLOCK / (32 * f))); psg(0x80 | (ch << 5) | (d & 15)); psg((d >> 4) & 0x3f); };
const psgVol = (ch, att) => psg(0x90 | (ch << 5) | Math.max(0, Math.min(15, att)));

// -- Instruments -------------------------------------------------------------
const BASS = { alg: 0, fb: 5, ops: [
  [0, 1, 30, 0, 31, 9, 2, 3, 15],
  [0, 2, 38, 0, 31, 11, 2, 4, 15],
  [0, 1, 24, 0, 31, 14, 3, 5, 15],
  [0, 1, 0, 1, 31, 6, 3, 3, 15],
] };
const LEAD = { alg: 4, fb: 5, pms: 2, ops: [
  [3, 1, 30, 0, 24, 5, 2, 2, 8],
  [7, 2, 34, 0, 24, 5, 2, 2, 8],
  [3, 1, 6, 0, 25, 3, 1, 1, 7],
  [7, 2, 14, 0, 25, 3, 1, 1, 7],
] };
const PAD = { alg: 5, fb: 3, ops: [
  [0, 1, 40, 0, 18, 2, 0, 1, 6],
  [3, 1, 28, 0, 13, 2, 0, 2, 5],
  [7, 2, 34, 0, 12, 2, 0, 2, 5],
  [0, 1, 26, 0, 13, 2, 0, 2, 5],
] };
const KICK = { alg: 7, fb: 0, ops: [
  [0, 1, 127, 0, 31, 0, 0, 0, 15],
  [0, 1, 127, 0, 31, 0, 0, 0, 15],
  [0, 1, 127, 0, 31, 0, 0, 0, 15],
  [0, 1, 0, 0, 31, 14, 12, 15, 15],
] };

// -- The score -------------------------------------------------------------
const CHORDS = {
  Dm: ['D4', 'F4', 'A4'], Bb: ['D4', 'F4', 'Bb4'], C: ['E4', 'G4', 'C5'], Am: ['E4', 'A4', 'C5'],
  Gm: ['D4', 'G4', 'Bb4'], F: ['F4', 'A4', 'C5'], A: ['E4', 'A4', 'C#5'],
};
const ROOT = { Dm: 'D2', Bb: 'Bb1', C: 'C2', Am: 'A1', Gm: 'G1', F: 'F1', A: 'A1' };
const verse = ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'A'];
const bridge = ['Gm', 'Bb', 'F', 'A', 'Gm', 'Bb', 'C', 'A'];
const verseTune = [
  ['A4', 6], ['F4', 2], ['D5', 4], ['C5', 2], ['A4', 2],
  ['Bb4', 6], ['D5', 2], ['F5', 4], ['D5', 4],
  ['E5', 4], ['G5', 4], ['E5', 2], ['D5', 2], ['C5', 4],
  ['A4', 8], ['C5', 4], ['E5', 4],
  ['F5', 6], ['E5', 2], ['D5', 4], ['A4', 4],
  ['D5', 6], ['C5', 2], ['Bb4', 4], ['F5', 4],
  ['G5', 4], ['E5', 4], ['C5', 4], ['G4', 4],
  ['A4', 4], ['C#5', 4], ['E5', 8],
];
const bridgeTune = [
  ['G5', 6], ['F5', 2], ['D5', 4], ['Bb4', 4],
  ['F5', 8], ['D5', 4], ['Bb4', 4],
  ['A5', 6], ['G5', 2], ['F5', 4], ['C5', 4],
  ['E5', 8], ['C#5', 4], ['A4', 4],
  ['Bb5', 6], ['A5', 2], ['G5', 4], ['D5', 4],
  ['F5', 6], ['D5', 2], ['Bb4', 8],
  ['C5', 4], ['E5', 4], ['G5', 4], ['C6', 4],
  ['A5', 8], ['E5', 4], ['C#5', 4],
];

/** One bar's events, by row: what each part does. */
const bars = [];
function section(chords, tune, parts) {
  const first = bars.length;
  chords.forEach((c) => bars.push({ chord: c, lead: [], ...parts }));
  let row = 0;
  for (const [s, d] of tune ?? []) {
    bars[first + (row >> 4)].lead.push([row & 15, n(s), d]);
    row += d;
  }
}
section(['Dm', 'Bb', 'C', 'A'], null, { bass: false, kick: false, snare: false, arp: true });
section(['Dm', 'Bb', 'C', 'A'], null, { bass: true, kick: true, snare: false, arp: true });
const loopBar = bars.length;
section(verse, verseTune, { bass: true, kick: true, snare: true, arp: true });
section(bridge, bridgeTune, { bass: true, kick: true, snare: true, arp: true });
section(verse, verseTune, { bass: true, kick: true, snare: true, arp: true });

// -- Render ------------------------------------------------------------------
fm(0, 0x22, 0x08 | 3); // LFO on, ~6 Hz: the lead's vibrato
fm(0, 0x27, 0x00);
fm(0, 0x2b, 0x00); // no DAC
for (let c = 0; c < 6; c++) keyOff(c);
setPatch(0, BASS);
setPatch(1, LEAD);
for (const c of [2, 3, 4]) setPatch(c, PAD);
setPatch(5, KICK);
for (let ch = 0; ch < 4; ch++) psgVol(ch, 15);

// Per-frame state for the envelopes that the driver runs itself.
let kickAge = -1, noiseAge = -1, noiseKind = 0;
const arpEnv = [[-1, 0], [-1, 0]]; // [age, base attenuation] for PSG tones 0 and 1
const pending = []; // [frame, fn]
const at = (f, fn) => pending.push([f, fn]);

bars.forEach((bar, b) => {
  const f0 = b * 16 * FRAMES_PER_ROW;
  const rowF = (r) => f0 + r * FRAMES_PER_ROW;
  if (b === loopBar) at(f0, () => { loopByte = cmds.length; loopFrame = frame; });
  // Pad: the chord, held for the bar.
  at(f0, () => CHORDS[bar.chord].forEach((s, i) => { keyOff(2 + i); setFreq(2 + i, hz(n(s) - 12)); keyOn(2 + i); }));
  at(f0 + 16 * FRAMES_PER_ROW - 2, () => [2, 3, 4].forEach(keyOff));
  // Bass: a syncopated root / octave / fifth figure.
  if (bar.bass) {
    const root = n(ROOT[bar.chord]);
    [[0, 0], [3, 0], [6, 12], [8, 0], [10, 7], [12, 12], [14, 0]].forEach(([r, step]) => {
      at(rowF(r), () => { keyOff(0); setFreq(0, hz(root + step)); keyOn(0); });
      at(rowF(r) + FRAMES_PER_ROW + 3, () => keyOff(0));
    });
  }
  // Lead.
  for (const [r, note, d] of bar.lead) {
    at(rowF(r), () => { keyOff(1); setFreq(1, hz(note)); keyOn(1); });
    at(rowF(r) + d * FRAMES_PER_ROW - 2, () => keyOff(1));
  }
  // Drums.
  if (bar.kick) for (const r of [0, 8, ...(b % 2 ? [11] : [])]) at(rowF(r), () => { kickAge = 0; });
  if (bar.snare) {
    for (const r of [4, 12]) at(rowF(r), () => { noiseAge = 0; noiseKind = 1; });
    for (const r of [2, 6, 10, 14]) at(rowF(r), () => { noiseAge = 0; noiseKind = 0; });
  }
  // PSG arpeggio: the chord, up two octaves, 16ths; the echo three rows behind.
  if (bar.arp) {
    const notes = CHORDS[bar.chord].map(n);
    const seq = [0, 1, 2, 1 + 3, 2, 1, 0 + 3, 2];
    for (let r = 0; r < 16; r++) {
      const i = seq[r % 8];
      const note = notes[i % 3] + 12 + (i >= 3 ? 12 : 0);
      at(rowF(r), () => { psgTone(0, hz(note)); arpEnv[0] = [0, 5]; });
      at(rowF(r) + 3 * FRAMES_PER_ROW, () => { psgTone(1, hz(note)); arpEnv[1] = [0, 9]; });
    }
  }
});

const total = bars.length * 16 * FRAMES_PER_ROW + 3 * FRAMES_PER_ROW;
pending.sort((a, b) => a[0] - b[0]);
let p = 0;
for (frame = 0; frame < total; frame++) {
  while (p < pending.length && pending[p][0] === frame) pending[p++][1]();
  // Kick: a sine that drops from ~150 Hz to ~45 Hz in a few frames.
  if (kickAge >= 0) {
    if (kickAge === 0) { keyOff(5); setFreq(5, 150); keyOn(5); }
    else if (kickAge < 8) setFreq(5, 150 * 0.75 ** kickAge + 40);
    else { keyOff(5); kickAge = -2; }
    kickAge++;
  }
  // Noise: snare (white, loud, ~10 frames) or hi-hat (white, high, 3 frames).
  if (noiseAge >= 0) {
    if (noiseAge === 0) psg(0xe0 | 0x04 | (noiseKind ? 1 : 0));
    const len = noiseKind ? 10 : 3;
    psgVol(3, noiseAge >= len ? 15 : (noiseKind ? 2 : 7) + noiseAge * (noiseKind ? 1.3 : 3) | 0);
    noiseAge = noiseAge >= len ? -1 : noiseAge + 1;
  }
  // Arpeggio envelopes: a short pluck.
  arpEnv.forEach((e, ch) => { if (e[0] >= 0) { psgVol(ch, e[1] + (e[0] >> 1)); e[0] = e[0] > 20 ? -1 : e[0] + 1; } });
  cmds.push(0x62); // wait one 60 Hz frame (735 samples)
}
for (let c = 0; c < 6; c++) keyOff(c);
for (let ch = 0; ch < 4; ch++) psgVol(ch, 15);
cmds.push(0x66);

// -- File ----------------------------------------------------------------------
const gd3Strings = ['Wasm Drive', '', 'libvlc-wasm samples', '', 'Sega Mega Drive / Genesis', '', 'libvlc-wasm', '', '2026', 'apps/player/scripts/make-vgm.mjs', 'Written for libvlc-wasm; CC0'];
const gd3Body = Buffer.concat(gd3Strings.map((s) => Buffer.from(s + '\0', 'utf16le')));
const gd3 = Buffer.alloc(12 + gd3Body.length);
gd3.write('Gd3 ', 0, 'latin1');
gd3.writeUInt32LE(0x100, 4);
gd3.writeUInt32LE(gd3Body.length, 8);
gd3Body.copy(gd3, 12);

const data = Buffer.from(cmds);
const h = Buffer.alloc(0x40);
const samples = total * 735;
h.write('Vgm ', 0, 'latin1');
h.writeUInt32LE(0x40 + data.length + gd3.length - 4, 0x04);
h.writeUInt32LE(0x150, 0x08);
h.writeUInt32LE(PSG_CLOCK, 0x0c);
h.writeUInt32LE(0x40 + data.length - 0x14, 0x14); // GD3 offset
h.writeUInt32LE(samples, 0x18);
h.writeUInt32LE(0x40 + loopByte - 0x1c, 0x1c); // loop offset
h.writeUInt32LE(samples - loopFrame * 735, 0x20);
h.writeUInt32LE(60, 0x24);
h.writeUInt16LE(0x0009, 0x28); // SN76489 noise feedback (Sega)
h.writeUInt8(16, 0x2a); // shift register width
h.writeUInt32LE(FM_CLOCK, 0x2c);
h.writeUInt32LE(0x40 - 0x34, 0x34); // data offset
writeFileSync(out, Buffer.concat([h, data, gd3]));
console.log(`${out}: ${h.length + data.length + gd3.length} bytes, ${(total / 60).toFixed(1)} s, loop from ${(loopFrame / 60).toFixed(1)} s`);
