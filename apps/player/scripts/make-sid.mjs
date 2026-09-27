// The Commodore 64 sample (static/samples/wasm-64.sid): a tune of our own and
// the 6502 player that plays it, wrapped as a PSID file. Nothing in it is
// borrowed: the melody, bass line and arpeggios are written out below, and the
// player is the assembly at the bottom of this file.
//
// The player is the classic shape of 1980s C64 music drivers, cut down:
//   voice 1  sawtooth bass, with the drums (noise + pulse sweeps) played on the
//            same voice for a few frames and the bass note restored after
//   voice 2  pulse arpeggios cycling through a chord every frame (50 Hz), with
//            pulse-width modulation, through a swept resonant low-pass filter
//   voice 3  pulse lead, with delayed vibrato and pulse-width modulation
// The song is one row of four bytes (bass, chord, lead, drum) per 16th note,
// six frames a row: 125 BPM, about 54 s before it loops back to the verse.
//
// Needs acme (a 6502 assembler); run it in Docker:
//   docker run --rm -v "$PWD":/w -w /w debian:trixie sh -c 'apt-get update -qq &&
//     apt-get install -y -qq acme nodejs >/dev/null && node apps/player/scripts/make-sid.mjs'
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../static/samples/wasm-64.sid');

// -- Notes -----------------------------------------------------------------
// A note is a semitone number with C0 = 0; in the song data it is stored plus
// one (0 = keep playing, 0xff = release).
const NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const n = (s) => { const m = /^([A-G]#?)(\d)$/.exec(s); return NAMES[m[1]] + 12 * +m[2]; };
const PAL = 985248;
const freq = Array.from({ length: 96 }, (_, i) => Math.min(0xffff, Math.round((440 * 2 ** ((i - 57) / 12) * 16777216) / PAL)));

// -- Chords, for the arpeggio voice -----------------------------------------
const CHORDS = {
  Am: ['A3', 'C4', 'E4'], F: ['F3', 'A3', 'C4'], C: ['G3', 'C4', 'E4'], G: ['G3', 'B3', 'D4'],
  E: ['G#3', 'B3', 'E4'], Dm: ['A3', 'D4', 'F4'],
};
const chordIds = Object.keys(CHORDS);
const ROOT = { Am: 'A1', F: 'F1', C: 'C2', G: 'G1', E: 'E1', Dm: 'D2' };

// -- The score -------------------------------------------------------------
// Each bar is 16 rows. Melodies are [note, rows] pairs; '-' is a rest.
const intro = ['Am', 'F', 'C', 'G'];
const verse = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'];
const bridge = ['Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'E', 'Am'];
const verseTune = [
  ['E5', 4], ['D5', 2], ['C5', 2], ['B4', 2], ['C5', 2], ['A4', 4],
  ['A4', 4], ['C5', 4], ['F5', 6], ['E5', 2],
  ['G5', 6], ['E5', 2], ['C5', 4], ['D5', 2], ['E5', 2],
  ['D5', 8], ['B4', 4], ['G4', 4],
  ['E5', 4], ['D5', 2], ['C5', 2], ['B4', 2], ['C5', 2], ['E5', 4],
  ['A5', 6], ['G5', 2], ['F5', 4], ['E5', 4],
  ['D5', 4], ['G5', 4], ['B4', 4], ['D5', 4],
  ['B4', 4], ['E5', 4], ['G#5', 8],
];
const bridgeTune = [
  ['F5', 6], ['E5', 2], ['D5', 4], ['A4', 4],
  ['C5', 6], ['B4', 2], ['A4', 8],
  ['A4', 4], ['C5', 4], ['F5', 4], ['A5', 4],
  ['G#5', 8], ['B5', 4], ['G#5', 4],
  ['A5', 6], ['G5', 2], ['F5', 4], ['D5', 4],
  ['E5', 6], ['C5', 2], ['A4', 8],
  ['B4', 4], ['D5', 4], ['E5', 4], ['G#5', 4],
  ['A5', 12], ['-', 4],
];
// The verse again, with its answer an octave up.
const verseTune2 = verseTune.map(([s, d], i) => [i >= 17 && s !== '-' ? s.replace(/\d/, (o) => +o + 1) : s, d]);

const rows = [];
const KICK = 1, SNARE = 2;
function section(chords, tune, { drums = true, bass = true } = {}) {
  const start = rows.length;
  chords.forEach((c, bar) => {
    for (let r = 0; r < 16; r++) {
      const row = [0, 0, 0, 0];
      // Bass: root, octave, root, octave ... with the fifth near the end of the bar.
      if (bass && r % 2 === 0) {
        const step = [0, 12, 0, 12, 0, 12, 7, 12][r / 2];
        row[0] = n(ROOT[c]) + step + 1;
      }
      if (r === 0) row[1] = chordIds.indexOf(c) + 1;
      if (drums) {
        if (r === 0 || r === 8 || (r === 10 && bar % 2)) row[3] = KICK;
        if (r === 4 || r === 12) row[3] = SNARE;
        if (r === 14 && bar % 4 === 3) row[3] = SNARE;
      }
      rows.push(row);
    }
  });
  let at = start;
  for (const [s, d] of tune ?? []) {
    rows[at][2] = s === '-' ? 0xff : n(s) + 1;
    at += d;
  }
}
section(intro.slice(0, 2), null, { drums: false });
section(intro.slice(2), null);
const loop = rows.length;
section(verse, verseTune);
section(bridge, bridgeTune);
section(verse, verseTune2);

// -- Assemble ---------------------------------------------------------------
const bytes = (a) => a.map((x) => `$${x.toString(16).padStart(2, '0')}`).join(',');
const chunk = (a, w = 16) => Array.from({ length: Math.ceil(a.length / w) }, (_, i) => `  !byte ${bytes(a.slice(i * w, i * w + w))}`).join('\n');
const table = [0, ...freq];
const asm = `
!to "tune.prg", cbm
* = $1000
SPEED = 6
rowptr = $fb

init    jmp do_init
play    jmp do_play

do_init ldx #$18
        lda #0
clr     sta $d400,x
        dex
        bpl clr
        lda #<song
        sta rowptr
        lda #>song
        sta rowptr+1
        lda #1
        sta tick
        lda #$ff
        sta drum_pos
        lda #0
        sta bass_note
        sta arp_on
        sta chord_ofs
        sta pwc
        sta fc
        ; envelopes: bass/drums, arpeggio, lead
        lda #$08
        sta $d405
        lda #$a9
        sta $d406
        lda #$08
        sta $d40c
        lda #$6a
        sta $d40d
        lda #$19
        sta $d413
        lda #$a9
        sta $d414
        lda #$08
        sta $d403
        ; resonance 10, filter voice 2; low-pass, volume 15
        lda #$a2
        sta $d417
        lda #$1f
        sta $d418
        rts

do_play dec tick
        bne frame
        lda #SPEED
        sta tick
        jsr row
frame   jsr fx
        rts

; ---- one row of the song ----
row     ldy #0
        lda (rowptr),y
        beq bass_done
        cmp #$ff
        bne bass_new
        lda #0
        sta bass_note
        lda drum_pos
        bpl bass_done
        lda #$20
        sta $d404
        jmp bass_done
bass_new
        sta bass_note
        lda drum_pos
        bpl bass_done
        jsr bass_on
bass_done
        iny
        lda (rowptr),y
        beq chord_done
        cmp #$ff
        bne chord_new
        lda #$40
        sta $d40b
        lda #0
        sta arp_on
        jmp chord_done
chord_new
        sec
        sbc #1
        sta tmp
        asl
        clc
        adc tmp
        sta chord_ofs
        lda #0
        sta arp_step
        lda #1
        sta arp_on
        lda #$40
        sta $d40b
        lda #$41
        sta $d40b
chord_done
        iny
        lda (rowptr),y
        beq lead_done
        cmp #$ff
        bne lead_new
        lda #$40
        sta $d412
        jmp lead_done
lead_new
        sta lead_note
        tax
        lda #0
        sta lead_age
        lda freq_lo,x
        sta $d40e
        lda freq_hi,x
        sta $d40f
        lda #$40
        sta $d412
        lda #$41
        sta $d412
lead_done
        iny
        lda (rowptr),y
        beq drum_done
        tax
        lda drum_start-1,x
        sta drum_pos
        lda #0
        sta $d404
drum_done
        lda rowptr
        clc
        adc #4
        sta rowptr
        bcc no_carry
        inc rowptr+1
no_carry
        lda rowptr+1
        cmp #>song_end
        bne row_end
        lda rowptr
        cmp #<song_end
        bne row_end
        lda #<song_loop
        sta rowptr
        lda #>song_loop
        sta rowptr+1
row_end rts

bass_on ldx bass_note
        lda freq_lo,x
        sta $d400
        lda freq_hi,x
        sta $d401
        lda #$20
        sta $d404
        lda #$21
        sta $d404
        rts

; ---- every frame ----
fx      ldx drum_pos
        bmi arp
        lda drum_tab,x
        beq drum_end
        sta $d404
        lda #0
        sta $d400
        lda drum_tab+1,x
        sta $d401
        inx
        inx
        stx drum_pos
        jmp arp
drum_end
        lda #$ff
        sta drum_pos
        lda bass_note
        beq drum_off
        jsr bass_on
        jmp arp
drum_off
        lda #$20
        sta $d404

arp     lda arp_on
        beq vib
        lda chord_ofs
        clc
        adc arp_step
        tax
        ldy arp_notes,x
        lda freq_lo,y
        sta $d407
        lda freq_hi,y
        sta $d408
        inc arp_step
        lda arp_step
        cmp #3
        bne vib
        lda #0
        sta arp_step

; lead vibrato, after the note has sounded for a moment
vib     lda lead_age
        cmp #$ff
        beq vib_go
        inc lead_age
vib_go  lda lead_age
        cmp #12
        bcc pwm
        ldx lead_note
        beq pwm
        lda freq_lo,x
        sta tmp
        lda freq_hi,x
        sta tmp2
        lsr
        sta unit
        inc vib_phase
        lda vib_phase
        and #7
        tay
        lda vib_amt,y
        beq vib_set
        sta cnt
        lda vib_sign,y
        bne vib_sub
vib_add lda tmp
        clc
        adc unit
        sta tmp
        bcc va_nc
        inc tmp2
va_nc   dec cnt
        bne vib_add
        jmp vib_set
vib_sub lda tmp
        sec
        sbc unit
        sta tmp
        bcs vs_nb
        dec tmp2
vs_nb   dec cnt
        bne vib_sub
vib_set lda tmp
        sta $d40e
        lda tmp2
        sta $d40f

; pulse-width modulation on voices 2 and 3, and the filter sweep
pwm     inc pwc
        lda pwc
        bpl pw_up
        eor #$ff
pw_up   asl
        sta tmp
        lsr
        lsr
        lsr
        lsr
        lsr
        clc
        adc #3
        sta $d40a
        sta $d411
        lda tmp
        asl
        asl
        asl
        sta $d409
        sta $d410
        inc fc
        lda fc
        bpl fc_up
        eor #$ff
fc_up   lsr
        clc
        adc #$20
        sta $d416
        rts

vib_amt  !byte 0,1,2,1,0,1,2,1
vib_sign !byte 0,0,0,0,0,1,1,1
; drums: (control, frequency high) per frame, 0 ends
drum_start !byte kick-drum_tab, snare-drum_tab
drum_tab
kick    !byte $81,$20, $41,$0c, $41,$08, $41,$06, $40,$05, 0
snare   !byte $81,$e0, $41,$0c, $81,$c8, $81,$b0, $80,$a0, 0

freq_lo
${chunk(table.map((f) => f & 0xff))}
freq_hi
${chunk(table.map((f) => f >> 8))}
arp_notes
${chunk(chordIds.flatMap((c) => CHORDS[c].map((s) => n(s) + 1)))}

tick      !byte 0
tmp       !byte 0
tmp2      !byte 0
unit      !byte 0
cnt       !byte 0
bass_note !byte 0
drum_pos  !byte 0
arp_on    !byte 0
arp_step  !byte 0
chord_ofs !byte 0
lead_note !byte 0
lead_age  !byte 0
vib_phase !byte 0
pwc       !byte 0
fc        !byte 0

song
${chunk(rows.slice(0, loop).flat())}
song_loop
${chunk(rows.slice(loop).flat())}
song_end
`;
const tmp = mkdtempSync(join(tmpdir(), 'sid-'));
writeFileSync(join(tmp, 'tune.asm'), asm);
execFileSync('acme', ['tune.asm'], { cwd: tmp, stdio: 'inherit' });
const prg = readFileSync(join(tmp, 'tune.prg'));

// -- PSID v2 header -----------------------------------------------------------
const h = Buffer.alloc(0x7c);
h.write('PSID', 0, 'latin1');
h.writeUInt16BE(2, 4); // version
h.writeUInt16BE(0x7c, 6); // data offset
h.writeUInt16BE(0, 8); // load address: the first two bytes of the data
h.writeUInt16BE(0x1000, 0x0a); // init
h.writeUInt16BE(0x1003, 0x0c); // play
h.writeUInt16BE(1, 0x0e); // songs
h.writeUInt16BE(1, 0x10); // start song
h.writeUInt32BE(0, 0x12); // speed: vertical blank (50 Hz)
h.write('Wasm 64', 0x16, 'latin1');
h.write('libvlc-wasm', 0x36, 'latin1');
h.write('2026 libvlc-wasm, CC0', 0x56, 'latin1');
h.writeUInt16BE(0x0014, 0x76); // flags: PAL, 6581
writeFileSync(out, Buffer.concat([h, prg]));
const seconds = (rows.length * 6) / 50;
console.log(`${out}: ${h.length + prg.length} bytes, ${rows.length} rows, ${seconds.toFixed(1)} s before it loops`);
