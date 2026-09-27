"""Generated pictures and music for the showcase DVD (make-showcase-dvd.sh).

Everything here is computed, nothing is sampled:
  sphere.rgba   a chrome sphere reflecting a sunset sky over a checkerboard
                floor, turning and bobbing: the early-CGI object on the menus
                (raw RGBA, SPHERE x SPHERE, one 12 s loop at 29.97 fps)
  menu.wav      the main menu's bed: detuned sawtooth pads, a sine sub, glassy
                bells, with a slow tape wobble (three 12 s cycles; the middle
                one is the seamless loop)
  scenes.wav    the scene menu's bed (likewise)
  score.wav     the feature's second audio track, 48 s
  credits.wav   the credits' music
Written as 48 kHz stereo; make-showcase-dvd.sh adds reverb and chorus with sox.
  python3 make-showcase-dvd.py <outdir>
"""
import sys
import wave

import numpy as np

out = sys.argv[1] if len(sys.argv) > 1 else "."
SR = 48000
FPS = 30000 / 1001
LOOP_FRAMES = 360  # one menu loop: 12.012 s
LOOP = LOOP_FRAMES / FPS

# -- The sphere ------------------------------------------------------------
SPHERE = 160


def sphere_frames():
    n = SPHERE
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    x = (x + 0.5) / n * 2 - 1
    y = 1 - (y + 0.5) / n * 2
    r2 = x * x + y * y
    inside = r2 < 1
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    # Reflect a view ray (0, 0, -1) about the normal (x, y, z).
    d = np.array([0.0, 0.0, -1.0])
    dn = d[2] * z
    rx, ry, rz = d[0] - 2 * dn * x, d[1] - 2 * dn * y, d[2] - 2 * dn * z
    # Antialiased edge.
    alpha = np.clip((1 - np.sqrt(r2)) * n / 2, 0, 1)
    top = np.array([43, 16, 85], float)
    horizon = np.array([255, 154, 213], float)
    sun = np.array([255, 236, 170], float)
    tile_a = np.array([36, 230, 220], float)
    tile_b = np.array([120, 40, 190], float)
    frames = []
    for f in range(LOOP_FRAMES):
        a = 2 * np.pi * f / LOOP_FRAMES  # one turn per loop
        c, s = np.cos(a), np.sin(a)
        ex, ez = c * rx + s * rz, -s * rx + c * rz
        ey = ry
        col = np.zeros((n, n, 3))
        sky = ey > 0
        k = np.clip(ey, 0, 1)[..., None] ** 0.6
        sky_col = horizon * (1 - k) + top * k
        # A low sun in the reflected sky.
        sd = np.clip(ex * 0.0 + ey * 0.25 + ez * -0.97, -1, 1)
        glow = np.clip((sd - 0.9) * 10, 0, 1)[..., None]
        sky_col = sky_col * (1 - glow) + sun * glow
        # The floor, y = -1.3.
        t = -1.3 / np.where(ey < -1e-3, ey, -1e-3)
        px, pz = ex * t, ez * t
        checker = ((np.floor(px * 1.2) + np.floor(pz * 1.2)) % 2)[..., None]
        floor = tile_a * checker + tile_b * (1 - checker)
        fade = np.clip(t / 12, 0, 1)[..., None]
        floor = floor * (1 - fade) + horizon * fade
        col = np.where(sky[..., None], sky_col, floor)
        # Fresnel-ish rim and a hard specular highlight from the upper left.
        rim = (1 - z)[..., None] ** 3
        col = col * (1 - 0.5 * rim) + horizon * 0.5 * rim
        lx, ly, lz = -0.45, 0.6, 0.66
        spec = np.clip(x * lx + y * ly + z * lz, 0, 1) ** 60
        col = col + 255 * spec[..., None]
        rgba = np.dstack([np.clip(col, 0, 255), 255 * alpha * inside])
        frames.append(rgba.astype(np.uint8))
    with open(f"{out}/sphere.rgba", "wb") as fh:
        for fr in frames:
            fh.write(fr.tobytes())


# -- Music -----------------------------------------------------------------
def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def wobble(t):
    """Tape wow and flutter: the pitch drifts a few cents, slowly."""
    return 1 + 0.0028 * np.sin(2 * np.pi * 0.31 * t) + 0.0009 * np.sin(2 * np.pi * 5.3 * t)


def osc_saw(f, t):
    ph = np.cumsum(f * wobble(t)) / SR
    return 2 * (ph - np.floor(ph + 0.5))


def osc_sine(f, t, mul=1.0):
    ph = np.cumsum(f * mul * wobble(t)) / SR
    return np.sin(2 * np.pi * ph)


def envelope(t, start, end, attack, release):
    e = np.clip((t - start) / attack, 0, 1)
    e = e * np.clip(1 - (t - end) / release, 0, 1)
    return e * (t >= start)


def piece(chords, seg, cycles, bell_every, bell_seed, sub=True):
    """chords: list of MIDI note lists, each lasting seg seconds; the whole
    progression repeated `cycles` times. Returns (L, R) float arrays."""
    total = len(chords) * seg * cycles
    t = np.arange(int(total * SR)) / SR
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    rng = np.random.default_rng(bell_seed)
    for cyc in range(cycles):
        for i, ch in enumerate(chords):
            start = (cyc * len(chords) + i) * seg
            end = start + seg
            env = envelope(t, start - 0.6, end, 1.6, 2.2)
            if not env.any():
                continue
            for m in ch:
                f = hz(m)
                for det, pan in ((-7, 0.8), (0, 0.5), (6, 0.2)):
                    v = osc_saw(np.full_like(t, f * 2 ** (det / 1200)), t) * env * 0.05
                    L += v * pan
                    R += v * (1 - pan)
            if sub:
                s = osc_sine(np.full_like(t, hz(ch[0] - 12)), t) * env * 0.16
                L += s
                R += s
            # Bells: chord tones two octaves up, on a lazy grid.
            steps = int(seg / bell_every)
            for k in range(steps):
                if rng.random() < 0.35:
                    continue
                bt = start + k * bell_every
                m = ch[rng.integers(len(ch))] + 24
                f = hz(m)
                idx = int(bt * SR)
                if idx >= len(t):
                    continue
                tt = t[idx:] - bt
                dec = np.exp(-tt / 1.4)
                b = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.756 * tt) * np.exp(-tt / 0.3)) * dec * 0.09
                pan = rng.uniform(0.2, 0.8)
                L[idx:] += b * pan
                R[idx:] += b * (1 - pan)
    return L, R


def write(name, L, R):
    st = np.stack([L, R], axis=1)
    st = st / (np.abs(st).max() + 1e-9) * 0.7
    with wave.open(f"{out}/{name}", "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


# Chord voicings as MIDI notes (C4 = 60).
Fmaj7 = [53, 57, 60, 64]
Em7 = [52, 55, 59, 62]
Dm9 = [50, 53, 57, 64]
Cmaj7 = [48, 55, 59, 64]
Am9 = [45, 52, 55, 59, 60]
Fmaj7s11 = [41, 52, 57, 59, 60]
Dbmaj7 = [49, 53, 56, 60]
Bbm9 = [46, 53, 56, 60, 61]

if __name__ == "__main__":
    sphere_frames()
    # The loops are rendered three cycles long; make-showcase-dvd.sh keeps the
    # middle one after the reverb, so the tails of the last chord (and of the
    # reverb) run into the first and the loop is seamless.
    L, R = piece([Fmaj7, Em7, Dm9, Cmaj7], LOOP / 4, 3, 0.75, 1)
    write("menu.wav", L, R)
    L, R = piece([Am9, Fmaj7s11], LOOP / 2, 3, 1.0, 2)
    write("scenes.wav", L, R)
    L, R = piece([Dbmaj7, Bbm9, Fmaj7, Em7, Dm9, Cmaj7], 8.008, 1, 0.5, 3)
    write("score.wav", L, R)
    L, R = piece([Fmaj7, Em7, Dm9, Cmaj7, Dbmaj7, Cmaj7], 5.005, 1, 0.75, 4)
    write("credits.wav", L, R)
