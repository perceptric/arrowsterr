"""Mix: stems -> music bus (EQ, pan, saturation, reverb, glue), ducked under the voice, summed with
the sound design and mastered to -14 LUFS with a true-peak ceiling of -1 dBTP.

Run after score.py and sfx.py (and audio/vo.py for the voice):  python audio/mix.py
Writes public/audio/music.wav (ducked music), public/audio/mix.wav (the final track, 64.0 s).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parent.parent
STEMS = ROOT / "audio/build/stems"
SR = 48000
END = 64.0
N = int(END * SR)

# stem: gain dB, pan (-1..1, applied as balance), high-pass Hz, low-pass Hz, drive, reverb send
STEM_MIX = {
    "drums":   (0.0, 0.0, 30, None, 1.3, 0.10),
    "bass":    (1.0, 0.0, 35, 5000, 1.2, 0.0),
    "sub":     (-3.0, 0.0, 25, 140, 1.0, 0.0),
    "gtr_l":   (-1.5, -0.75, 90, 9000, 1.4, 0.07),
    "gtr_r":   (-1.0, 0.75, 90, 9000, 1.4, 0.07),
    "lead":    (1.5, 0.0, 160, 10000, 1.3, 0.24),
    "piano":   (-0.5, -0.1, 40, None, 1.0, 0.22),
    "choir":   (-3.0, 0.0, 140, None, 1.0, 0.38),
    "strings": (-2.0, 0.1, 60, None, 1.0, 0.32),
    "horns":   (-4.0, 0.3, 80, 7000, 1.0, 0.30),
    "brass":   (-3.0, -0.2, 80, 9000, 1.1, 0.24),
    "timpani": (-2.0, 0.0, 35, None, 1.0, 0.28),
    "pizz":    (-2.0, 0.2, 100, None, 1.0, 0.30),
}
REVERSE_CYMBALS = (27.0, 32.0, 54.0)  # each swell ends exactly on this time
# music level rides, applied after normalising: (time s, dB). The quiet opening still sits under the voice.
RIDE = [(0.0, 15.0), (5.85, 15.0), (6.15, 7.0), (15.85, 7.0), (16.15, 4.0), (21.85, 4.0), (22.15, 2.0),
        (27.0, 2.0), (28.0, 5.0), (30.5, 5.0), (31.5, 0.0), (64.0, 0.0)]


# ---------------------------------------------------------------- helpers

def load(path: Path) -> np.ndarray:
    x, sr = sf.read(path, always_2d=True)
    assert sr == SR, (path, sr)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    out = np.zeros((N, 2))
    out[: min(N, len(x))] = x[:N]
    return out


def filt(x: np.ndarray, hp: float | None, lp: float | None) -> np.ndarray:
    if hp:
        x = sosfilt(butter(2, hp, "highpass", fs=SR, output="sos"), x, axis=0)
    if lp:
        x = sosfilt(butter(2, lp, "lowpass", fs=SR, output="sos"), x, axis=0)
    return x


def shelf(x: np.ndarray, f0: float, gain_db: float, high: bool) -> np.ndarray:
    """RBJ shelving biquad."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    cs, alpha = np.cos(w), np.sin(w) / 2 * np.sqrt(2)
    s = 1 if high else -1
    b0 = a * ((a + 1) + s * (a - 1) * cs + 2 * np.sqrt(a) * alpha)
    b1 = -2 * s * a * ((a - 1) + s * (a + 1) * cs)
    b2 = a * ((a + 1) + s * (a - 1) * cs - 2 * np.sqrt(a) * alpha)
    a0 = (a + 1) - s * (a - 1) * cs + 2 * np.sqrt(a) * alpha
    a1 = 2 * s * ((a - 1) - s * (a + 1) * cs)
    a2 = (a + 1) - s * (a - 1) * cs - 2 * np.sqrt(a) * alpha
    return lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x, axis=0)


def saturate(x: np.ndarray, drive: float) -> np.ndarray:
    if drive <= 1.0:
        return x
    peak = np.abs(x).max() + 1e-9
    y = np.tanh(drive * x / peak) / np.tanh(drive)
    return y * peak


def balance(x: np.ndarray, pan: float) -> np.ndarray:
    th = (pan + 1) * np.pi / 4
    return x * np.array([np.cos(th), np.sin(th)]) * np.sqrt(2)


def reverb_ir(rt60: float = 2.1, predelay: float = 0.025, seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int((rt60 * 1.2) * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.91 * t / rt60)
    ir = np.zeros((n + int(predelay * SR), 2))
    for c in range(2):
        nz = rng.standard_normal(n)
        bright = sosfilt(butter(2, 7000, "lowpass", fs=SR, output="sos"), nz)
        dark = sosfilt(butter(2, 2200, "lowpass", fs=SR, output="sos"), nz)
        mixw = np.exp(-t / 0.35)
        body = (bright * mixw + dark * (1 - mixw)) * env
        body = sosfilt(butter(1, 180, "highpass", fs=SR, output="sos"), body)
        ir[int(predelay * SR):, c] = body
    for k, (dt, g) in enumerate([(0.011, 0.5), (0.017, 0.4), (0.023, 0.33), (0.031, 0.28), (0.043, 0.2)]):
        ir[int(dt * SR), k % 2] += g * 3
    return ir / np.sqrt((ir ** 2).sum(axis=0).mean())


def block_env(x: np.ndarray, block: int) -> np.ndarray:
    m = np.abs(x).max(axis=1) if x.ndim > 1 else np.abs(x)
    nb = len(m) // block
    rms = np.sqrt((m[: nb * block].reshape(nb, block) ** 2).mean(axis=1))
    return 20 * np.log10(rms + 1e-9)


def smooth_db(target: np.ndarray, block_s: float, attack: float, release: float) -> np.ndarray:
    """One-pole smoothing of a gain curve (dB, <= 0); falling gain uses attack, rising gain uses release."""
    a_c = np.exp(-block_s / attack)
    r_c = np.exp(-block_s / release)
    out = np.empty_like(target)
    g = 0.0
    for i, v in enumerate(target):
        c = a_c if v < g else r_c
        g = c * g + (1 - c) * v
        out[i] = g
    return out


def to_samples(curve_db: np.ndarray, block: int) -> np.ndarray:
    centres = (np.arange(len(curve_db)) + 0.5) * block
    g = np.interp(np.arange(N), centres, curve_db)
    return 10 ** (g / 20)


def compress(x: np.ndarray, thresh_db: float, ratio: float, attack: float, release: float) -> np.ndarray:
    block = int(0.005 * SR)
    lvl = block_env(x, block)
    over = np.clip(lvl - thresh_db, 0, None)
    gr = -over * (1 - 1 / ratio)
    g = to_samples(smooth_db(gr, block / SR, attack, release), block)
    return x * g[:, None]


def true_peak(x: np.ndarray) -> float:
    up = resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def limit(x: np.ndarray, ceiling_db: float, release: float = 0.08) -> np.ndarray:
    """Look-ahead limiter on the 4x oversampled peak."""
    ceil = 10 ** (ceiling_db / 20)
    up = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    pk = up[: len(x) * 4].reshape(len(x), 4).max(axis=1)
    need = np.minimum(1.0, ceil / (pk + 1e-12))
    w = int(0.0015 * SR)
    g = minimum_filter1d(need, size=2 * w + 1)
    rc = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i, v in enumerate(g):  # instant attack, smooth release
        cur = v if v < cur else rc * cur + (1 - rc) * v
        out[i] = cur
    out = np.minimum(uniform_filter1d(out, size=w + 1), g)
    return x * out[:, None]


def window(x: np.ndarray, t0: float, t1: float, fade: float = 0.003) -> None:
    """Silence x between t0 and t1 with short fades, in place."""
    a, b = int(t0 * SR), int(t1 * SR)
    f = int(fade * SR)
    x[a - f:a] *= np.linspace(1, 0, f)[:, None]
    x[a:b] = 0.0


# ---------------------------------------------------------------- the mix

def main() -> None:
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    meter = pyln.Meter(SR)

    dry = np.zeros((N, 2))
    send = np.zeros((N, 2))
    for stem, (gain, pan, hp, lp, drive, rev) in STEM_MIX.items():
        x = load(STEMS / f"{stem}.wav")
        x = filt(x, hp, lp)
        x = saturate(x, drive)
        if stem in ("drums", "lead"):
            x = shelf(x, 6000, 2.5, high=True)
        if stem in ("gtr_l", "gtr_r"):
            x = shelf(x, 300, -2.0, high=False)
        if stem == "gtr_l":  # double-track feel: the left guitar sits 12 ms late
            x = np.roll(x, int(0.012 * SR), axis=0)
        x = balance(x, pan) * 10 ** (gain / 20)
        dry += x
        send += x * rev

    # reverse cymbal swells that end exactly on the cue
    crash = load(STEMS / "crash_one.wav")[: int(2.2 * SR)]
    crash = filt(crash, 300, None)
    rev_c = crash[::-1] * np.linspace(0, 1, len(crash))[:, None] ** 1.5
    for t in REVERSE_CYMBALS:
        i = int(t * SR)
        dry[i - len(rev_c):i] += rev_c * 0.9

    wet = fftconvolve(send, reverb_ir(), axes=0)[:N] * 0.6
    wet = filt(wet, 200, 9000)
    music = dry + wet
    music = compress(music, thresh_db=-20, ratio=2.5, attack=0.015, release=0.18)

    # hard stop at 27.0, silence to 28.0
    s0, s1 = tl["beats"]["silence"]
    window(music, s0, s1)

    # levels before ducking
    music *= 10 ** ((-14.0 - meter.integrated_loudness(music)) / 20)
    t = np.arange(N) / SR
    music *= (10 ** (np.interp(t, *zip(*RIDE)) / 20))[:, None]
    vo = load(ROOT / "public/audio/vo.wav")
    vo *= 10 ** ((-15.0 - meter.integrated_loudness(vo)) / 20)
    sfx = load(ROOT / "public/audio/sfx.wav")
    sfx *= 10 ** ((-21.0 - meter.integrated_loudness(sfx)) / 20)

    # duck the music under the voice: -9 dB, 40 ms attack, 300 ms release, 30 ms look-ahead
    block = int(0.005 * SR)
    v_db = block_env(vo, block)
    look = int(0.03 * SR / block)
    v_db = np.concatenate([v_db[look:], np.full(look, -120.0)])
    v_db = maximum_filter1d(v_db, size=31)  # hold through the short gaps between words
    depth = -9.0 * np.clip((v_db - (-50.0)) / 12.0, 0, 1)
    duck = to_samples(smooth_db(depth, block / SR, 0.04, 0.30), block)
    music_d = music * duck[:, None]

    mix = music_d + vo + sfx

    # master: loudness to -14 LUFS, true peak under -1 dBTP
    for _ in range(4):
        mix *= 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
        pre = mix
        mix = limit(mix, -1.3)
    mix = limit(mix, -1.3)
    gr = 20 * np.log10((np.abs(mix).max(axis=1) + 1e-9) / (np.abs(pre).max(axis=1) + 1e-9))
    print(f"limiter: max gain reduction {-gr.min():.1f} dB, >3 dB on {(gr < -3).mean() * 100:.1f}% of samples")
    window(mix, s0, s1)
    fade = np.clip((64.0 - t) / 1.5, 0, 1)
    fade = np.where(t < 62.5, 1.0, 0.5 - 0.5 * np.cos(np.pi * fade))
    mix *= fade[:, None]
    music_d *= fade[:, None]

    sf.write(ROOT / "public/audio/music.wav", music_d.astype(np.float32), SR, subtype="FLOAT")
    sf.write(ROOT / "public/audio/mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")

    # report
    lufs = meter.integrated_loudness(mix)
    tp = true_peak(mix)
    sil = mix[int((s0 + 0.01) * SR):int((s1 - 0.005) * SR)]
    print(f"mix: {len(mix) / SR:.3f} s, {lufs:.2f} LUFS, true peak {tp:.2f} dBTP, sample peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS")
    print(f"silence {s0}-{s1}: max {np.abs(sil).max():.2e}")
    vo_on = duck < 10 ** (-6 / 20)
    print(f"ducked (>6 dB) {vo_on.mean() * 100:.0f}% of the film; min gain {20 * np.log10(duck.min()):.1f} dB")


if __name__ == "__main__":
    main()
