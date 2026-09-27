#!/usr/bin/env python3
"""The HDMV side of tests/make-bluray-menu.sh: a Blu-ray with an interactive menu.

No open-source tool authors HDMV (IG) menus, so this writes the parts tsMuxer
cannot, byte by byte, following the formats libbluray parses (1.4.1:
decoders/ig_decode.c + pg_decode.c, bdnav/index_parse.c, hdmv/mobj_parse.c,
bdnav/mpls_parse.c). The disc it finishes (corpus/media/gen/t_bluray_menu.iso):

  index.bdmv       First Playback -> object 0, Top Menu -> object 3,
                   title 1 -> object 1, title 2 -> object 2 (all HDMV)
  MovieObject      0: JumpTitle 0                      (first play: the top menu)
                   1: PlayPL 0;          JumpTitle 0   ("Play": the movie, then the menu)
                   2: PlayPL 0 at mark 1; JumpTitle 0  ("Chapter 2": from its second chapter)
                   3: PlayPL 1; Goto 0                 (the menu playlist, held as a still)
  00000.mpls/clpi/m2ts  the movie: 9 s, H.264 + AC-3, chapters at 0, 3, 6 s (tsMuxer)
  00001.mpls/clpi/m2ts  the menu: 1 s of still background H.264 plus an IG
                   stream (PID 0x1400), its play item an infinite still

The IG stream is one display set -- ICS, PDS, ODS x 6, END -- for a 1280x720
always-on page with two buttons, each in its own button overlap group:

  button 1 "PLAY"      x 240-560, y 500-600   right -> 2   activates JumpTitle 1
  button 2 "CHAPTER 2" x 720-1040, y 500-600  left  -> 1   activates JumpTitle 2

each with a normal (blue), selected (yellow) and activated (red) object, text
drawn from a built-in 5x7 font. Button 1 starts selected.

tsMuxer does not mux IG, but it does mux PG from a .sup file, and an IG stream
is carried exactly like PG (same segment framing, same PES packaging, private
stream 1). So the IG segments are written as a .sup, muxed as a PG track, and
the result is then relabelled, with every length unchanged: PID 0x1200 ->
0x1400 in the transport packets, stream type 0x90 -> 0x91 in the PMT (with its
CRC), coding type and PID in the clip info, and the playlist's STN table entry
moved from the PG count to the IG count (IG entries follow PG entries, so the
bytes stay where they are). tsMuxer only takes a .sup that has a presentation
composition in it, so the .sup starts with an empty PCS, whose packets the
relabelling turns into null packets.

Usage (run by make-bluray-menu.sh):
  make-bluray-menu.py sup OUT.sup          the IG segments, as a PGS .sup
  make-bluray-menu.py fixiso ISO LABEL     a fixed UDF volume set name
  make-bluray-menu.py finish MENU MOVIE DISC
      MENU, MOVIE: tsMuxer --blu-ray folder outputs (menu with the .sup as PG,
      movie); DISC: the BDMV tree to write, ready for the image.
Nothing here reads a clock or a random number; with make-bluray-menu.sh's fixed
file times and faketime the image is the same bytes on every run.
"""
import os
import shutil
import struct
import sys

W, H = 1280, 720
FRAME_RATE_CODE = 1          # 23.976, as the video
IG_PID, PG_PID = 0x1400, 0x1200

# --------------------------------------------------------------------------
# Button art
# --------------------------------------------------------------------------

FONT = {  # 5x7, one string per row
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    ' ': ['.....'] * 7,
}

# Palette entries: (R, G, B, alpha). 0 is transparent, and cheapest in RLE.
COLOURS = [(0, 0, 0, 0), (255, 255, 255, 255), (48, 80, 160, 255), (255, 208, 0, 255),
           (0, 0, 0, 255), (200, 32, 32, 255)]
TRANSPARENT, WHITE, BLUE, YELLOW, BLACK, RED = range(6)
STATES = {'normal': (BLUE, WHITE), 'selected': (YELLOW, BLACK), 'activated': (RED, WHITE)}
BW, BH, SCALE = 320, 100, 6


def button_bitmap(text, fill, ink):
    """A BW x BH box in fill, 4 px ink border, text centred: rows of palette indexes."""
    img = [[fill] * BW for _ in range(BH)]
    for y in range(BH):
        for x in range(BW):
            if x < 4 or y < 4 or x >= BW - 4 or y >= BH - 4:
                img[y][x] = ink
    tw = (len(text) * 6 - 1) * SCALE
    x0, y0 = (BW - tw) // 2, (BH - 7 * SCALE) // 2
    for i, ch in enumerate(text):
        for gy, row in enumerate(FONT[ch]):
            for gx, bit in enumerate(row):
                if bit == '#':
                    for dy in range(SCALE):
                        for dx in range(SCALE):
                            img[y0 + gy * SCALE + dy][x0 + (i * 6 + gx) * SCALE + dx] = ink
    return img


def rle(img):
    """HD graphics run-length coding (pg_decode.c _decode_rle), a 00 00 per line."""
    out = bytearray()
    for row in img:
        x = 0
        while x < len(row):
            c, n = row[x], 1
            while x + n < len(row) and row[x + n] == c and n < 16383:
                n += 1
            x += n
            if c != 0 and n <= 2:
                out += bytes([c]) * n
            elif c == 0:
                out += bytes([0, n]) if n < 64 else bytes([0, 0x40 | n >> 8, n & 0xff])
            else:
                out += bytes([0, 0x80 | n, c]) if n < 64 else bytes([0, 0xc0 | n >> 8, n & 0xff, c])
        out += b'\0\0'
    return bytes(out)


def ycrcb(r, g, b):
    """BT.709, studio range, as HD graphics palettes are."""
    y = 16 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 219 / 255
    cb = 128 + (-0.1146 * r - 0.3854 * g + 0.5 * b) * 224 / 255
    cr = 128 + (0.5 * r - 0.4542 * g - 0.0458 * b) * 224 / 255
    return round(y), round(cr), round(cb)

# --------------------------------------------------------------------------
# HDMV commands (12 bytes, hdmv/mobj_parse.c mobj_parse_cmd)
# --------------------------------------------------------------------------


def cmd(op_cnt, grp, sub_grp, branch_opt, dst=0, src=0, imm1=1, imm2=1):
    return struct.pack('>BBBBII', op_cnt << 5 | grp << 3 | sub_grp,
                       imm1 << 7 | imm2 << 6 | branch_opt, 0, 0, dst, src)


def jump_title(t): return cmd(1, 0, 1, 1, t)        # BRANCH/JUMP/JUMP_TITLE
def play_pl(pl): return cmd(1, 0, 2, 0, pl)          # BRANCH/PLAY/PLAY_PL
def play_pl_pm(pl, mark): return cmd(2, 0, 2, 2, pl, mark)  # BRANCH/PLAY/PLAY_PL_PM
def goto(pc): return cmd(1, 0, 0, 1, pc)             # BRANCH/GOTO/GOTO

# --------------------------------------------------------------------------
# The IG display set, as a .sup ("PG" + pts + dts + segment)
# --------------------------------------------------------------------------

BUTTONS = [  # id, label, x, y, left, right, title it jumps to
    (1, 'PLAY', 240, 500, 1, 2, 1),
    (2, 'CHAPTER 2', 720, 500, 1, 2, 2),
]


def objects():
    """object id -> bitmap: button k's states are 3k-3 .. 3k-1 (normal, selected, activated)."""
    objs = {}
    for k, (bid, label, *_rest) in enumerate(BUTTONS):
        for s, (fill, ink) in enumerate(STATES.values()):
            objs[3 * k + s] = button_bitmap(label, fill, ink)
    return objs


def ics():
    page = bytearray([0, 0]) + bytes(8)                  # id, version, UO mask
    page += bytes([0, 0]) + bytes([0, 0])                # in / out effects: no windows, no effects
    page += struct.pack('>BHHBB', 0, BUTTONS[0][0], 0xffff, 0, len(BUTTONS))
    for k, (bid, label, x, y, left, right, title) in enumerate(BUTTONS):
        nav = [jump_title(title)]
        page += struct.pack('>HB', bid, 1)               # BOG: default valid button, 1 button
        page += struct.pack('>HHBHH', bid, bid, 0, x, y)  # id, numeric select, no auto action
        page += struct.pack('>HHHH', bid, bid, left, right)  # up, down, left, right
        o = 3 * k
        page += struct.pack('>HHB', o, o, 0)             # normal start/end, no repeat
        page += struct.pack('>BHHB', 0xff, o + 1, o + 1, 0)  # selected: no sound
        page += struct.pack('>BHH', 0xff, o + 2, o + 2)  # activated
        page += struct.pack('>H', len(nav)) + b''.join(nav)
    comp = bytes([0]) + bytes(5) + bytes(5)               # stream model 0, ui model 0 (always on), timeouts 0
    comp += (0).to_bytes(3, 'big') + bytes([1]) + page    # user timeout, one page
    body = struct.pack('>HHB', W, H, FRAME_RATE_CODE << 4)
    body += struct.pack('>HB', 0, 2 << 6)                 # composition 0, epoch start
    body += bytes([0xc0])                                 # first and last in sequence
    body += len(comp).to_bytes(3, 'big') + comp
    return body


def pds():
    body = bytes([0, 0])
    for i, (r, g, b, a) in enumerate(COLOURS):
        body += bytes([i, *ycrcb(r, g, b), a])
    return body


def ods(oid, img):
    data = struct.pack('>HH', len(img[0]), len(img)) + rle(img)
    body = struct.pack('>HBB', oid, 0, 0xc0) + len(data).to_bytes(3, 'big') + data
    assert len(body) < 0xffff, 'object too large for one segment'
    return body


def segment(kind, body, pts=0, dts=0):
    return b'PG' + struct.pack('>IIBH', pts, dts, kind, len(body)) + body


def write_sup(path):
    # tsMuxer only takes a .sup as a track once it has seen a presentation
    # composition in it, so one goes first; patch_m2ts drops it again.
    pcs = struct.pack('>HHBHBBBB', W, H, FRAME_RATE_CODE << 4, 0, 2 << 6, 0, 0, 0)
    segs = [segment(0x16, pcs), segment(0x18, ics()), segment(0x14, pds())]
    segs += [segment(0x15, ods(oid, img)) for oid, img in sorted(objects().items())]
    segs.append(segment(0x80, b''))
    with open(path, 'wb') as f:
        f.write(b''.join(segs))

# --------------------------------------------------------------------------
# index.bdmv and MovieObject.bdmv
# --------------------------------------------------------------------------


def hdmv_obj(playback_type, obj):
    """INDX_HDMV_OBJ: playback type, object id; after a 4-byte object-type word."""
    return struct.pack('>HHI', playback_type << 14, obj, 0)


def index_bdmv():
    first_play = struct.pack('>I', 1 << 30) + hdmv_obj(0, 0)    # HDMV, movie
    top_menu = struct.pack('>I', 1 << 30) + hdmv_obj(1, 3)      # HDMV, interactive
    titles = [struct.pack('>I', 1 << 30) + hdmv_obj(0, o) for o in (1, 2)]  # HDMV, access permitted
    index = first_play + top_menu + struct.pack('>H', len(titles)) + b''.join(titles)
    # AppInfo (34 bytes): no 3D, video format 720p (5), 23.976 (1), no user data.
    app = struct.pack('>I', 34) + bytes([0, 5 << 4 | 1]) + bytes(32)
    start = 40 + len(app)
    head = b'INDX0200' + struct.pack('>II', start, 0) + bytes(24)
    return head + app + struct.pack('>I', len(index)) + index


def movie_objects():
    progs = [
        [jump_title(0)],
        [play_pl(0), jump_title(0)],
        [play_pl_pm(0, 1), jump_title(0)],
        [play_pl(1), goto(0)],
    ]
    body = struct.pack('>IH', 0, len(progs))
    for p in progs:
        body += struct.pack('>HH', 0, len(p)) + b''.join(p)  # resume/menu-call/title-search masks off
    head = b'MOBJ0200' + struct.pack('>I', 0) + bytes(28)
    return head + struct.pack('>I', len(body)) + body

# --------------------------------------------------------------------------
# Relabelling tsMuxer's PG track as IG
# --------------------------------------------------------------------------


def crc32_mpeg(data):
    crc = 0xffffffff
    for b in data:
        crc ^= b << 24
        for _ in range(8):
            crc = (crc << 1 ^ 0x04c11db7) if crc & 0x80000000 else crc << 1
            crc &= 0xffffffff
    return crc


def patch_m2ts(data):
    """PID 0x1200 -> 0x1400 in every packet; stream type 0x90 -> 0x91 in the PMT.
    The packets of the PES carrying write_sup's leading PCS become null packets."""
    buf = bytearray(data)
    assert len(buf) % 192 == 0
    pmt_pids, moved, dropping, dropped = set(), 0, False, 0
    for off in range(0, len(buf), 192):
        ts = off + 4
        assert buf[ts] == 0x47
        pid = (buf[ts + 1] & 0x1f) << 8 | buf[ts + 2]
        pusi = buf[ts + 1] & 0x40
        afc = buf[ts + 3] >> 4 & 3
        p = ts + 4 + (1 + buf[ts + 4] if afc & 2 else 0)
        if pid == PG_PID:
            if pusi:                                      # PES header, then the segment type
                dropping = buf[p + 9 + buf[p + 8]] == 0x16
            if dropping:
                buf[ts + 1], buf[ts + 2] = buf[ts + 1] & 0xe0 | 0x1f, 0xff
                dropped += 1
                continue
            buf[ts + 1] = buf[ts + 1] & 0xe0 | IG_PID >> 8
            buf[ts + 2] = IG_PID & 0xff
            buf[ts + 3] = buf[ts + 3] & 0xf0 | (buf[ts + 3] - dropped) & 0x0f  # continuity
            moved += 1
            continue
        if not pusi or not afc & 1:
            continue
        p += 1 + buf[p]                                   # pointer field
        if pid == 0 and buf[p] == 0:                      # PAT: note the PMT PIDs
            n = ((buf[p + 1] & 0xf) << 8 | buf[p + 2]) + 3 - 4
            for e in range(p + 8, p + n, 4):
                if buf[e] << 8 | buf[e + 1]:
                    pmt_pids.add((buf[e + 2] & 0x1f) << 8 | buf[e + 3])
        elif pid in pmt_pids and buf[p] == 2:             # PMT
            n = (buf[p + 1] & 0xf) << 8 | buf[p + 2]
            end = p + 3 + n - 4
            e = p + 12 + ((buf[p + 10] & 0xf) << 8 | buf[p + 11])
            while e < end:
                epid = (buf[e + 1] & 0x1f) << 8 | buf[e + 2]
                if epid == PG_PID:
                    assert buf[e] == 0x90
                    buf[e] = 0x91
                    buf[e + 1] = buf[e + 1] & 0xe0 | IG_PID >> 8
                    buf[e + 2] = IG_PID & 0xff
                e += 5 + ((buf[e + 3] & 0xf) << 8 | buf[e + 4])
            buf[end:end + 4] = struct.pack('>I', crc32_mpeg(buf[p:end]))
    assert moved and dropped and pmt_pids, 'no PG packets / PMT found'
    return bytes(buf)


def patch_clpi(data):
    """ProgramInfo: the PG stream entry becomes IG (PID and coding type, same size)."""
    buf = bytearray(data)
    prog = struct.unpack_from('>I', buf, 12)[0]           # ProgramInfo start address
    p = prog + 4 + 1 + 1                                  # length, reserved, num programs
    p += 4 + 2                                            # SPN program sequence start, program map PID
    nstreams = buf[p]
    p += 2                                                # num streams, num groups
    found = False
    for _ in range(nstreams):
        pid = struct.unpack_from('>H', buf, p)[0]
        alen = buf[p + 2]
        if pid == PG_PID:
            assert buf[p + 3] == 0x90
            struct.pack_into('>H', buf, p, IG_PID)
            buf[p + 3] = 0x91                              # attributes (language) keep their layout
            found = True
        p += 3 + alen
    assert found, 'PG stream not in clip info'
    return bytes(buf)


def patch_mpls(data, still_infinite):
    """The STN table lists the PG track as IG; the play item can hold as a still."""
    buf = bytearray(data)
    lst = struct.unpack_from('>I', buf, 8)[0]
    n_items = struct.unpack_from('>H', buf, lst + 6)[0]
    p = lst + 10
    for _ in range(n_items):
        ilen = struct.unpack_from('>H', buf, p)[0]
        if still_infinite:
            buf[p + 31] = 2                               # still mode: infinite (bluray.h BLURAY_STILL_INFINITE)
        assert not buf[p + 12] & 0x10, 'multi-angle play item'
        stn = p + 34                                      # after clip id .. still time
        counts = stn + 4                                  # after STN length and 2 reserved bytes
        n_v, n_a, n_pg, n_ig = buf[counts:counts + 4]
        assert n_pg == 1 and n_ig == 0, (n_pg, n_ig)
        buf[counts + 2], buf[counts + 3] = 0, 1
        q = stn + 16
        for _ in range(n_v + n_a):
            q += 1 + buf[q]; q += 1 + buf[q]              # stream entry, stream attributes
        assert buf[q + 1] == 1 and struct.unpack_from('>H', buf, q + 2)[0] == PG_PID
        struct.pack_into('>H', buf, q + 2, IG_PID)
        q += 1 + buf[q]
        assert buf[q + 1] == 0x90
        buf[q + 1] = 0x91
        p += 2 + ilen
    return bytes(buf)


def finish(menu, movie, disc):
    bd = os.path.join(disc, 'BDMV')
    shutil.rmtree(disc, ignore_errors=True)
    for d in ('PLAYLIST', 'CLIPINF', 'STREAM', 'BACKUP/PLAYLIST', 'BACKUP/CLIPINF', 'AUXDATA', 'BDJO', 'JAR', 'META'):
        os.makedirs(os.path.join(bd, d))
    os.makedirs(os.path.join(disc, 'CERTIFICATE', 'BACKUP'))
    src = lambda root, *p: open(os.path.join(root, 'BDMV', *p), 'rb').read()
    files = {
        'PLAYLIST/00000.mpls': src(movie, 'PLAYLIST', '00000.mpls'),
        'CLIPINF/00000.clpi': src(movie, 'CLIPINF', '00000.clpi'),
        'STREAM/00000.m2ts': src(movie, 'STREAM', '00000.m2ts'),
        'PLAYLIST/00001.mpls': patch_mpls(src(menu, 'PLAYLIST', '00001.mpls'), True),
        'CLIPINF/00001.clpi': patch_clpi(src(menu, 'CLIPINF', '00001.clpi')),
        'STREAM/00001.m2ts': patch_m2ts(src(menu, 'STREAM', '00001.m2ts')),
        'index.bdmv': index_bdmv(),
        'MovieObject.bdmv': movie_objects(),
    }
    for name, data in files.items():
        for root in ([''] if name.startswith('STREAM') else ['', 'BACKUP']):
            with open(os.path.join(bd, root, name), 'wb') as f:
                f.write(data)


# --------------------------------------------------------------------------
# A reproducible image
# --------------------------------------------------------------------------


def crc_itu(data):
    crc = 0
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = (crc << 1 ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xffff
    return crc


def fix_iso(path, label):
    """genisoimage names the UDF volume set from the clock and a random number
    (run under faketime, that is all that still varies): give it a fixed name,
    then re-seal each Primary Volume Descriptor's tag (ECMA-167 3/7.2)."""
    with open(path, 'r+b') as f:
        img = bytearray(f.read(300 * 2048))
        fixed = 0
        for sec in range(16, 300):
            o = sec * 2048
            tag = img[o:o + 16]
            if struct.unpack_from('<H', tag)[0] != 1 or struct.unpack_from('<I', tag, 12)[0] != sec:
                continue
            if sum(tag[:4]) + sum(tag[5:16]) & 0xff != tag[4]:
                continue
            name = b'\x08' + label.encode()
            img[o + 76:o + 204] = name + bytes(127 - len(name)) + bytes([len(name)])
            n = struct.unpack_from('<H', img, o + 10)[0]
            struct.pack_into('<H', img, o + 8, crc_itu(img[o + 16:o + 16 + n]))
            img[o + 4] = sum(img[o:o + 4]) + sum(img[o + 5:o + 16]) & 0xff
            fixed += 1
        assert fixed >= 2, 'no UDF primary volume descriptors'
        f.seek(0)
        f.write(img)


if __name__ == '__main__':
    if sys.argv[1:2] == ['sup']:
        write_sup(sys.argv[2])
    elif sys.argv[1:2] == ['fixiso']:
        fix_iso(sys.argv[2], sys.argv[3])
    elif sys.argv[1:2] == ['finish']:
        finish(*sys.argv[2:5])
    else:
        sys.exit(__doc__)
