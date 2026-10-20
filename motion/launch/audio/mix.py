"""Mix: stems -> music bus (EQ, pan, saturation, reverb, glue), levelled section by section so the song
grows without jumps, gently ducked under the voice, summed with the sound design and mastered to -14 LUFS
with a true-peak ceiling of -1 dBTP.

Run after score.py and sfx.py (and audio/vo.py for the voice):  python audio/mix.py
Writes public/audio/music.wav (ducked music), public/audio/mix.wav and public/audio/mix.m4a (the final track).
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt, sosfiltfilt

ROOT = Path(__file__).resolve().parent.parent
STEMS = ROOT / "audio/build/stems"
SR = 48000
END = 78.0
N = int(END * SR)

# stem: gain dB, pan (-1..1, applied as balance), high-pass Hz, low-pass Hz, drive, reverb send
STEM_MIX = {
    "drums":   (0.0, 0.0, 30, None, 1.25, 0.10),
    "pulse":   (-2.0, 0.0, 30, 220, 1.0, 0.0),
    "bass":    (1.0, 0.0, 35, 5000, 1.2, 0.0),
    "sub":     (-5.0, 0.0, 25, 140, 1.0, 0.0),
    "mgtr":    (-3.0, 0.35, 120, 7000, 1.1, 0.08),
    "gtr_l":   (-3.0, -0.75, 90, 8500, 1.4, 0.07),
    "gtr_r":   (-2.5, 0.75, 90, 8500, 1.4, 0.07),
    "lead":    (-1.0, 0.0, 160, 9500, 1.3, 0.24),
    "piano":   (-1.0, -0.1, 40, None, 1.0, 0.22),
    "ostinato": (-4.0, 0.35, 150, None, 1.0, 0.24),
    "glock":   (-6.0, 0.25, 400, None, 1.0, 0.35),
    "choir":   (-3.0, 0.0, 140, None, 1.0, 0.38),
    "strings": (-2.0, 0.1, 60, None, 1.0, 0.32),
    "horns":   (-3.0, 0.3, 80, 7000, 1.0, 0.30),
    "brass":   (-4.0, -0.2, 80, 9000, 1.1, 0.24),
    "timpani": (-3.0, 0.0, 35, None, 1.0, 0.28),
}
REVERSE_CYMBALS = (24.0, 40.0, 56.0, 66.0, 76.0)  # each swell ends exactly on this time
RISERS = ((18.0, 24.0), (60.0, 66.0))  # noise and tone risers that cut off on the arrival
# Sections and their loudness against the first chorus block (LU). From the drop it only climbs.
SECTIONS = [  # (start, end, name, target)
    (0.0, 8.0, "intro", -7.0), (8.0, 14.0, "verse", -5.0), (14.0, 18.0, "verse 2", -4.0),
    (18.0, 20.0, "dip", -5.5), (20.0, 24.0, "build", -3.0), (24.0, 32.0, "chorus 1", 0.0),
    (32.0, 40.0, "chorus 2", 1.2), (40.0, 48.0, "chorus 3", 2.4), (48.0, 60.0, "chorus 4", 3.6),
    (60.0, 62.0, "whip", 4.0), (62.0, 66.0, "pre-chorus", 4.4), (66.0, 74.0, "final chorus", 5.6),
    (74.0, 78.0, "outro", 5.6),
]
REF, PEAK_SECTION, PEAK_LUFS = "chorus 1", "final chorus", -16.5  # the peak sits 6 dB under the voice once ducked
# how long the level takes to move into each section (s), ending on the boundary
GLIDE = {8.0: 1.0, 14.0: 1.0, 18.0: 0.5, 20.0: 0.5, 24.0: 2.0, 32.0: 1.0, 40.0: 1.0, 48.0: 1.0,
         60.0: 0.5, 62.0: 1.0, 66.0: 0.25, 74.0: 0.5}
DARK = (18.0, 20.0, 24.0)  # the bed is darkened in the dip, then opens up through the build
THIN = (61.3, 66.0)  # a rising high-pass through the pre-chorus; the low end slams back at 66
CLIMB_FROM = 24.0
CLIMB = [(24.0, 0.0), (32.0, 1.2), (40.0, 2.4), (48.0, 3.6), (60.0, 4.0), (62.0, 4.4), (66.0, 5.6), (78.0, 5.9)]
FADE = (76.5, 78.0)
DUCK_DB, DUCK_ATTACK, DUCK_RELEASE = -5.0, 0.06, 0.6
LEAD_REST_FROM, LEAD_REST_DB, LEAD_FADE = 24.0, -6.0, 0.12  # the lead steps back while the voice talks


def lead_rides(tl: dict) -> np.ndarray:
    """Gain (linear, per sample) for the lead guitar: down under every voice line from 32 s, full in the gaps."""
    lens = {r[0]: r[2] for r in json.loads((ROOT / "audio/build/vo_report.json").read_text())}
    spans = []
    for c in tl["vo"]:
        a, b = c["at"] - 0.1, c["at"] + lens[c["id"]] + 0.15
        if b <= LEAD_REST_FROM:
            continue
        if spans and a - spans[-1][1] < 0.4:  # too short a gap to answer in
            spans[-1][1] = b
        else:
            spans.append([max(a, LEAD_REST_FROM), b])
    t = np.arange(N) / SR
    down = np.zeros(N)
    for a, b in spans:
        up_in = np.clip((t - (a - LEAD_FADE)) / LEAD_FADE, 0, 1)
        up_out = np.clip(((b + LEAD_FADE) - t) / LEAD_FADE, 0, 1)
        down = np.maximum(down, np.minimum(up_in, up_out))
    return 10 ** (LEAD_REST_DB * down / 20)


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


def peak_eq(x: np.ndarray, f0: float, gain_db: float, q: float) -> np.ndarray:
    """RBJ peaking biquad."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return lfilter(np.array(b) / den[0], np.array(den) / den[0], x, axis=0)


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


def section_rides(music: np.ndarray, meter: pyln.Meter) -> tuple[np.ndarray, dict[str, float]]:
    """A gain curve (dB per sample) that sets each section to its target against the chorus."""
    loud = {name: meter.integrated_loudness(music[int(a * SR):int(b * SR)]) for a, b, name, _ in SECTIONS}
    ref = loud[REF]
    t = np.arange(N) / SR
    gain = np.zeros(N)
    prev = None
    for a, b, name, target in SECTIONS:
        g = target + ref - loud[name]
        seg = (t >= a) & (t < b)
        gain[seg] = g
        if prev is not None and a in GLIDE:
            gl = GLIDE[a]
            ramp = (t >= a - gl) & (t < a)
            x = (t[ramp] - (a - gl)) / gl
            gain[ramp] = prev + (g - prev) * (0.5 - 0.5 * np.cos(np.pi * x))
        prev = g
    return gain, loud


def climb_rides(music: np.ndarray, meter: pyln.Meter, ref: float) -> np.ndarray:
    """From the drop, a bar-by-bar gain (dB per sample) so each 2 s bar sits on a line that only rises."""
    t = np.arange(N) / SR
    starts = np.arange(CLIMB_FROM, END, 2.0)
    centres = starts + 1.0
    target = ref + np.interp(starts, *zip(*CLIMB))
    gain_db = np.zeros(len(starts))
    for _ in range(3):
        g = np.interp(t, centres, gain_db) * np.clip((t - (CLIMB_FROM - 1)), 0, 1)
        x = music * (10 ** (g / 20))[:, None]
        lu = np.array([meter.integrated_loudness(x[int(a * SR):int((a + 2) * SR)]) for a in starts])
        gain_db = np.clip(gain_db + (target - lu), -4.0, 4.0)
    return np.interp(t, centres, gain_db) * np.clip((t - (CLIMB_FROM - 1)), 0, 1)


def riser(d: float, seed: int) -> np.ndarray:
    """Noise sweeping up plus a rising tone, louder toward the end, cut off sharp."""
    rng = np.random.default_rng(seed)
    n = int(d * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blocks = 64
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        f = 300 * (7000 / 300) ** ((a + b) / 2 / n)
        seg = sosfilt(butter(2, [f / 1.5, min(f * 1.5, SR / 2 - 100)], "bandpass", fs=SR, output="sos"), x[max(0, a - 2000):b])
        out[a:b] = seg[-(b - a):]
    f = 146.83 * 4 ** (t / d)  # D3 up two octaves
    tone_ = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    sig = out / (np.abs(out).max() + 1e-9) + 0.25 * tone_
    sig *= (t / d) ** 2.2
    sig[-int(0.005 * SR):] *= np.linspace(1, 0, int(0.005 * SR))
    return np.stack([sig * (1 - 0.3 * np.sin(t * 3)), sig * (1 - 0.3 * np.cos(t * 3))], axis=1) * 0.12


def main() -> None:
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    assert tl["durationSec"] == END, tl["durationSec"]
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
            x = peak_eq(x, 2500, -2.5, 1.0)  # leave room for the voice
        if stem == "gtr_l":  # double-track feel: the left guitar sits 12 ms late
            x = np.roll(x, int(0.012 * SR), axis=0)
        if stem == "lead":
            x = x * lead_rides(tl)[:, None]
        x = balance(x, pan) * 10 ** (gain / 20)
        dry += x
        send += x * rev

    # reverse cymbal swells that end exactly on the arrival
    crash = load(STEMS / "crash_one.wav")[: int(2.2 * SR)]
    crash = filt(crash, 300, None)
    rev_c = crash[::-1] * np.linspace(0, 1, len(crash))[:, None] ** 1.5
    for t0 in REVERSE_CYMBALS:
        i = int(t0 * SR)
        dry[i - len(rev_c):i] += rev_c * 0.7

    for k, (r0, r1) in enumerate(RISERS):
        r = riser(r1 - r0, 20 + k)
        i = int(r0 * SR)
        dry[i:i + len(r)] += r
        send[i:i + len(r)] += r * 0.3

    wet = fftconvolve(send, reverb_ir(), axes=0)[:N] * 0.6
    wet = filt(wet, 200, 9000)
    music = dry + wet
    music = peak_eq(music, 260, -2.0, 0.9)  # clear the low mids for the voice
    music = peak_eq(music, 3000, -1.5, 0.8)
    music = shelf(music, 5000, 2.0, high=True)  # air

    # the breakdown goes dark and the build opens it back up (zero-phase low-pass, crossfaded)
    t = np.arange(N) / SR
    d0, d1, d2 = DARK
    dark = sosfiltfilt(butter(2, 1400, "lowpass", fs=SR, output="sos"), music, axis=0)
    amt = np.clip((t - (d0 - 0.5)) / 0.5, 0, 1) * np.clip((d2 - t) / (d2 - d1), 0, 1) ** 1.6
    music = music * np.sqrt(1 - amt)[:, None] + dark * np.sqrt(amt)[:, None]

    # the pre-chorus thins out from below, then everything lands at 72
    h0, h1 = THIN
    thin = sosfiltfilt(butter(2, 320, "highpass", fs=SR, output="sos"), music, axis=0)
    amt = np.clip((t - h0) / (h1 - h0), 0, 1) ** 1.5 * (t < h1)
    music = music * np.sqrt(1 - amt)[:, None] + thin * np.sqrt(amt)[:, None]

    music = compress(music, thresh_db=-22, ratio=2.2, attack=0.02, release=0.25)

    # section levels, then the peak of the song sits at PEAK_LUFS
    rides, measured = section_rides(music, meter)
    music *= (10 ** (rides / 20))[:, None]
    ref_a, ref_b = next((s0, s1) for s0, s1, name, _ in SECTIONS if name == REF)
    music *= (10 ** (climb_rides(music, meter, meter.integrated_loudness(music[int(ref_a * SR):int(ref_b * SR)])) / 20))[:, None]
    a, b = next((s0, s1) for s0, s1, name, _ in SECTIONS if name == PEAK_SECTION)
    music *= 10 ** ((PEAK_LUFS - meter.integrated_loudness(music[int(a * SR):int(b * SR)])) / 20)
    music[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]

    vo = load(ROOT / "public/audio/vo.wav")
    vo *= 10 ** ((-15.0 - meter.integrated_loudness(vo)) / 20)
    vo = limit(vo, -5.0, release=0.05)  # tame the few plosive peaks before they reach the master
    sfx = load(ROOT / "public/audio/sfx.wav")
    sfx *= 10 ** ((-24.0 - meter.integrated_loudness(sfx)) / 20)

    # duck the music under the voice: gentle and slow, with a short look-ahead and a hold over word gaps
    block = int(0.005 * SR)
    v_db = block_env(vo, block)
    look = int(0.04 * SR / block)
    v_db = np.concatenate([v_db[look:], np.full(look, -120.0)])
    v_db = maximum_filter1d(v_db, size=61)
    depth = DUCK_DB * np.clip((v_db - (-50.0)) / 12.0, 0, 1)
    duck = to_samples(smooth_db(depth, block / SR, DUCK_ATTACK, DUCK_RELEASE), block)
    music_d = music * duck[:, None]

    mix = music_d + vo + sfx

    # master: loudness to -14 LUFS, true peak under -1 dBTP
    pre = mix * 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
    mix = pre
    for _ in range(4):
        mix = limit(mix, -1.3)
        mix *= 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
    mix = limit(mix, -1.3)
    ratio = (np.abs(mix).max(axis=1) + 1e-9) / (np.abs(pre).max(axis=1) + 1e-9)
    gr = 20 * np.log10(ratio[np.abs(pre).max(axis=1) > 1e-3])
    print(f"limiter: input true peak {true_peak(pre):.1f} dBTP, max gain reduction {-gr.min():.1f} dB, "
          f">3 dB on {(gr < -3).mean() * 100:.1f}% of sounding samples")
    f0, f1 = FADE
    fade = np.where(t < f0, 1.0, 0.5 + 0.5 * np.cos(np.pi * np.clip((t - f0) / (f1 - f0), 0, 1)))
    mix *= fade[:, None]
    music_d *= fade[:, None]
    music_bed = music * fade[:, None]

    sf.write(ROOT / "public/audio/music.wav", music_d.astype(np.float32), SR, subtype="FLOAT")
    sf.write(ROOT / "public/audio/mix.wav", mix, SR, subtype="PCM_24")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "public/audio/mix.wav"), "-c:a", "aac", "-b:a", "256k",
                    str(ROOT / "public/audio/mix.m4a")], check=True)

    # report
    lufs = meter.integrated_loudness(mix)
    print(f"mix: {len(mix) / SR:.3f} s, {lufs:.2f} LUFS, true peak {true_peak(mix):.2f} dBTP, "
          f"sample peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS")
    print("music bed by section (LUFS, before ducking):")
    for a, b, name, target in SECTIONS:
        seg = music_bed[int(a * SR):int(min(b, FADE[0]) * SR)]
        print(f"  {a:5.1f}-{b:5.1f} {name:13s} {meter.integrated_loudness(seg):6.1f}  (target {target:+.1f} vs chorus)")
    w = int(0.25 * SR)
    quiet = [20 * np.log10(np.sqrt((music_bed[i:i + w] ** 2).mean()) + 1e-12) for i in range(0, int(FADE[0] * SR) - w, w)]
    print(f"quietest 0.25 s of the music bed before the fade: {min(quiet):.1f} dBFS RMS at {np.argmin(quiet) * 0.25:.2f} s")
    first = int(CLIMB_FROM // 2)
    lu = [meter.integrated_loudness(music_bed[int(k * 2 * SR):int((k + 1) * 2 * SR)]) for k in range(first, int(FADE[0] // 2))]
    drops = [(CLIMB_FROM + 2 * i, round(lu[i] - max(lu[:i]), 1)) for i in range(1, len(lu)) if lu[i] < max(lu[:i]) - 0.5]
    print(f"2 s bars from {CLIMB_FROM:.0f} s (LUFS):", " ".join(f"{x:.1f}" for x in lu))
    print(f"steps down of more than 0.5 dB after {CLIMB_FROM:.0f} s:", drops or "none")
    print(f"ducking: deepest {20 * np.log10(duck.min()):.1f} dB, >3 dB on {(duck < 10 ** (-3 / 20)).mean() * 100:.0f}% of the film")


if __name__ == "__main__":
    main()
