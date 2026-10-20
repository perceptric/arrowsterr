"""Sound design: every effect is synthesized here from noise and sine waves, placed on the cue times.

Run: python audio/sfx.py
Writes public/audio/sfx.wav (48 kHz stereo, 64.0 s).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
END = 64.0
rng = np.random.default_rng(11)


# ---------------------------------------------------------------- building blocks

def secs(d: float) -> np.ndarray:
    return np.arange(int(d * SR)) / SR


def noise(d: float) -> np.ndarray:
    return rng.standard_normal(int(d * SR))


def band(x: np.ndarray, lo: float | None, hi: float | None, order: int = 2) -> np.ndarray:
    if lo and hi:
        sos = butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    elif lo:
        sos = butter(order, lo, "highpass", fs=SR, output="sos")
    else:
        sos = butter(order, hi, "lowpass", fs=SR, output="sos")
    return sosfilt(sos, x)


def sweep_band(x: np.ndarray, f0: float, f1: float, q: float = 2.0, blocks: int = 48) -> np.ndarray:
    """Band-pass whose centre glides from f0 to f1 (log), done in short overlapping blocks."""
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    win_len = max(2, int(2 * n / blocks))
    for i in range(blocks):
        a = max(0, edges[i] - win_len // 4)
        b = min(n, edges[i + 1] + win_len // 4)
        f = f0 * (f1 / f0) ** ((edges[i] + edges[i + 1]) / 2 / n)
        lo, hi = f / (1 + 1 / q), min(f * (1 + 1 / q), SR / 2 - 100)
        seg = band(x[a:b], lo, hi)
        w = np.hanning(b - a)
        out[a:b] += seg * w
    return out / (np.abs(out).max() + 1e-9)


def env_ad(n: int, a: float, d: float, curve: float = 4.0) -> np.ndarray:
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = np.exp(-curve * np.clip(t - a, 0, None) / max(d, 1e-4))
    return att * dec


def tone(freq, d: float, decay: float, partials=((1, 1.0),), glide: float | None = None) -> np.ndarray:
    t = secs(d)
    f = freq if glide is None else freq * (glide / freq) ** (t / d)
    phase = 2 * np.pi * np.cumsum(f) / SR if glide is not None else 2 * np.pi * freq * t
    out = sum(a * np.sin(k * phase) * np.exp(-t * k ** 0.5 / decay) for k, a in partials)
    return out * np.clip(t / 0.002, 0, 1)


def bell(freq: float, d: float = 1.6, decay: float = 0.5) -> np.ndarray:
    """A soft struck bell: a few inharmonic partials."""
    t = secs(d)
    parts = [(1.0, 1.0, decay), (2.76, 0.32, decay * 0.5), (5.4, 0.14, decay * 0.3), (2.0, 0.22, decay * 0.8)]
    out = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / dc) for r, a, dc in parts)
    return out * np.clip(t / 0.003, 0, 1)


def click(gain: float = 1.0, bright: float = 3500) -> np.ndarray:
    x = band(noise(0.012), bright, min(bright * 3, 20000)) * env_ad(int(0.012 * SR), 0.0003, 0.004)
    return x / (np.abs(x).max() + 1e-9) * gain


def whoosh(d: float, f0: float, f1: float, peak_at: float = 0.75) -> np.ndarray:
    x = sweep_band(noise(d), f0, f1, q=1.6)
    t = secs(d)
    rise = np.clip(t / (d * peak_at), 0, 1) ** 2.2
    fall = np.exp(-np.clip(t - d * peak_at, 0, None) / (d * 0.12))
    return x * rise * fall


def layer(*parts: tuple[float, np.ndarray]) -> np.ndarray:
    """Sum (gain, signal) pairs of different lengths."""
    out = np.zeros(max(len(x) for _, x in parts))
    for g, x in parts:
        out[: len(x)] += g * x
    return out


def norm(x: np.ndarray, peak: float) -> np.ndarray:
    return x / (np.abs(x).max() + 1e-9) * peak


# ---------------------------------------------------------------- the track

class Track:
    def __init__(self) -> None:
        self.buf = np.zeros((int(END * SR), 2))

    def put(self, at: float, x: np.ndarray, db: float = 0.0, pan: float | np.ndarray = 0.0) -> None:
        """Place mono x at time `at`. pan is -1 (left) to 1 (right), or a curve as long as x."""
        g = 10 ** (db / 20)
        i = int(round(at * SR))
        if i < 0:
            x, i = x[-i:], 0
        n = min(len(x), len(self.buf) - i)
        if n <= 0:
            return
        x = x[:n]
        pn = pan[:n] if isinstance(pan, np.ndarray) else np.full(n, pan)
        th = (pn + 1) * np.pi / 4
        self.buf[i:i + n, 0] += x * np.cos(th) * g
        self.buf[i:i + n, 1] += x * np.sin(th) * g


def build(tl: dict) -> np.ndarray:
    tr = Track()
    b = tl["beats"]

    # clock tick on each beat, 0-6
    for k in range(12):
        f = 2600 if k % 2 == 0 else 2100
        x = tone(f, 0.05, 0.012, ((1, 1.0), (2.3, 0.4)))
        x[: int(0.012 * SR)] += click(0.8, 4000)
        tr.put(k * 0.5, norm(x, 1), db=-31, pan=-0.15 if k % 2 else 0.15)

    # key ticks for the prompt decode, 2.0-4.6
    t = 2.0
    while t < 4.6:
        x = band(noise(0.02), 2000, 7000) * env_ad(int(0.02 * SR), 0.0005, 0.007)
        x[: int(0.006 * SR)] += click(0.5, 5000)[: int(0.006 * SR)]
        tr.put(t, norm(x, 1), db=-30 + rng.uniform(-3, 2), pan=rng.uniform(-0.3, 0.3))
        t += rng.uniform(0.045, 0.075)

    # card snaps 8.0, 8.5, 9.0
    for k, at in enumerate(b["cards"]):
        crack = band(noise(0.05), 1200, 6500) * env_ad(int(0.05 * SR), 0.0004, 0.018, 5)
        thump = tone(150, 0.09, 0.03, glide=70)
        x = layer((1.0, norm(crack, 1)), (0.7, norm(thump, 1)))
        tr.put(at - 0.004, norm(x, 1), db=-17, pan=[-0.35, 0.0, 0.35][k])

    # glitch stutter 10.0-11.0
    g0 = b["ghost"]
    for k in range(9):
        d = 0.045
        car = np.sign(np.sin(2 * np.pi * rng.uniform(600, 1400) * secs(d)))
        crush = np.round(band(noise(d), 800, 6000) * 4) / 4
        x = (0.5 * car + crush) * env_ad(int(d * SR), 0.001, d * 0.7, 2)
        tr.put(g0 + k * 0.11 + (0.03 if k % 3 == 2 else 0), norm(x, 1), db=-27 - k * 1.2, pan=rng.uniform(-0.5, 0.5))

    # mouse click 12.5 and 56.0
    for at in (b["clickCompetitor"], b["clickYou"]):
        tr.put(at, click(1.0, 3000), db=-19)
        tr.put(at + 0.075, click(0.7, 3600), db=-22)

    # muted minor "booked" chime 13.0: F5 then D5, dark
    x = np.zeros(int(1.4 * SR))
    for k, f in enumerate((698.46, 587.33)):
        s = bell(f, 1.2, 0.35)
        i = int(k * 0.16 * SR)
        x[i:i + len(s)] += s[: len(x) - i]
    tr.put(b["demoBookedCompetitor"], norm(band(x, None, 2200), 1), db=-22)

    # radar sweep 17.0-18.0, panning left to right
    d = 1.0
    x = sweep_band(noise(d), 300, 3500, q=3) * np.sin(np.pi * secs(d) / d) ** 1.5
    tr.put(17.0, x, db=-26, pan=np.linspace(-0.8, 0.8, len(x)))

    # radar pings 18-22: a D6 ping with an echo, walking across the stereo field
    for k, at in enumerate(b["pings"]):
        p = tone(1174.66, 0.9, 0.22, ((1, 1.0), (2, 0.18), (3, 0.05)))
        echo = np.zeros(len(p) + int(0.14 * SR))
        echo[: len(p)] += p
        echo[int(0.14 * SR):] += 0.32 * p
        tr.put(at, norm(echo, 1), db=-20, pan=-0.6 + k * 0.3)

    # low thud 23.0
    x = tone(62, 0.6, 0.22, glide=38) + 0.3 * band(noise(0.6), None, 180) * env_ad(int(0.6 * SR), 0.002, 0.15)
    tr.put(b["notMentioned"], norm(x, 1), db=-15)

    # counter tick roll 24.0-25.0, slowing as it lands on 0%
    t, gap = 24.0, 0.028
    while t < 25.0:
        tr.put(t, click(1.0, 3800), db=-30, pan=0.1)
        t += gap
        gap *= 1.09
    tr.put(25.0, click(1.0, 2600), db=-24)

    # dissolve shimmer 25.0-26.0: grains thinning out
    for _ in range(140):
        at = 25.0 + rng.uniform(0, 1.0) ** 1.6
        f = rng.uniform(3000, 8000)
        g = tone(f, 0.06, 0.02)
        tr.put(at, g, db=-38 - (at - 25.0) * 12, pan=rng.uniform(-0.8, 0.8))
    hiss = band(noise(1.0), 2500, 9000) * np.linspace(1, 0, int(SR)) ** 2
    tr.put(25.0, norm(hiss, 1), db=-36)

    # arrowhead blip 28.0 and its glow
    blip = tone(620, 0.14, 0.08, glide=1240)
    glow = tone(1174.66, 1.4, 0.55, ((1, 1.0), (2, 0.12)))
    tr.put(b["arrowhead"], norm(blip, 1), db=-20)
    tr.put(b["arrowhead"] + 0.06, norm(glow, 1), db=-27)

    # 32.0: sub boom and shockwave whoosh
    boom = tone(64, 1.8, 0.55, glide=30)
    tr.put(b["drop"], norm(boom, 1), db=-11)
    wave = sweep_band(noise(1.0), 5000, 400, q=1.2) * env_ad(int(SR), 0.004, 0.45, 3)
    tr.put(b["drop"], norm(wave, 1), db=-19, pan=np.linspace(-0.6, 0.6, int(SR)))
    tr.put(b["drop"] + 0.012, norm(wave, 1), db=-24, pan=np.linspace(0.6, -0.6, int(SR)))

    # whooshes into each station
    for k, at in enumerate(b["stations"]):
        w = whoosh(0.55, 400, 4200, peak_at=0.8)
        tr.put(at - 0.44, w, db=-21, pan=np.linspace(-0.7, 0.5, len(w)))

    # sticker peel 34.6
    d = 0.38
    crackle = band(noise(d), 1800, 7500) * (rng.random(int(d * SR)) < 0.25)
    x = crackle * np.linspace(0.3, 1, int(d * SR)) * env_ad(int(d * SR), 0.01, d, 2)
    tr.put(34.6, norm(x, 1), db=-23, pan=0.2)

    # funnel suck 38.4: falls in pitch, swells, then stops
    d = 0.5
    x = sweep_band(noise(d), 4000, 280, q=2.2) * np.linspace(0, 1, int(d * SR)) ** 2
    x[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    tr.put(38.4, x, db=-21, pan=np.linspace(0.4, 0.0, len(x)))

    # card shuffle 42.3
    for k in range(7):
        f = band(noise(0.035), 1000, 4500) * env_ad(int(0.035 * SR), 0.001, 0.015)
        tr.put(42.3 + k * 0.05 + rng.uniform(-0.008, 0.008), norm(f, 1), db=-26 + rng.uniform(-2, 2), pan=rng.uniform(-0.4, 0.4))

    # paper fold 48.6-49.6: two creases
    for at, d in ((48.6, 0.35), (49.1, 0.5)):
        crackle = band(noise(d), 1200, 6500) * (rng.random(int(d * SR)) < 0.35)
        x = crackle * env_ad(int(d * SR), 0.03, d, 2.5)
        tr.put(at, norm(x, 1), db=-25, pan=0.15)
        tr.put(at + d - 0.03, click(0.8, 2200), db=-25)

    # big whip whoosh 50.0
    w = whoosh(0.42, 700, 7000, peak_at=0.62)
    tr.put(b["ship"] - 0.25, w, db=-15, pan=np.linspace(-0.9, 0.9, len(w)))

    # soft morning chime 51.5: D6 F#6 A6
    x = np.zeros(int(2.0 * SR))
    for k, f in enumerate((1174.66, 1479.98, 1760.0)):
        s = bell(f, 1.8, 0.6)
        i = int(k * 0.07 * SR)
        x[i:i + len(s)] += s[: len(x) - i]
    tr.put(b["nextMorning"], norm(x, 1), db=-28)

    # 54.0: impact and the gold spark shimmer (E major sparkles)
    imp = norm(tone(56, 1.2, 0.4, glide=34), 1)
    crack = band(noise(0.3), 300, 4000) * env_ad(int(0.3 * SR), 0.001, 0.07)
    imp[: len(crack)] += 0.45 * norm(crack, 1)
    tr.put(b["finalDrop"], norm(imp, 1), db=-12)
    sparkle = (2637.0, 3322.4, 3951.1, 5274.0, 2489.0, 3951.1)  # E7 G#7 B7 E8 D#7 B7
    for k in range(26):
        at = b["finalDrop"] + 0.02 + k * 0.055 + rng.uniform(0, 0.02)
        f = sparkle[k % len(sparkle)] * (0.5 if k % 4 == 3 else 1)
        tr.put(at, bell(f, 0.7, 0.18), db=-30 - k * 0.5, pan=np.sin(k * 1.7) * 0.8)

    # bright major "booked" chime 56.5: B5 then E6
    x = np.zeros(int(1.6 * SR))
    for k, f in enumerate((987.77, 1318.51)):
        s = bell(f, 1.4, 0.5)
        i = int(k * 0.12 * SR)
        x[i:i + len(s)] += s[: len(x) - i]
    tr.put(b["demoBookedYou"], norm(x, 1), db=-20)

    # chevron sweep whoosh 58.0, rising
    w = whoosh(0.7, 250, 6000, peak_at=0.6)
    tr.put(b["close"] - 0.42, w, db=-17, pan=np.linspace(-0.3, 0.3, len(w)))

    out = tr.buf
    s0, s1 = int(b["silence"][0] * SR), int(b["silence"][1] * SR)
    out[s0:s1] = 0.0
    return out


def main() -> None:
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    out = build(tl)
    (ROOT / "public/audio").mkdir(parents=True, exist_ok=True)
    sf.write(ROOT / "public/audio/sfx.wav", out.astype(np.float32), SR, subtype="FLOAT")
    print(f"sfx peak {20 * np.log10(np.abs(out).max()):.1f} dBFS, {len(out) / SR:.2f} s")


if __name__ == "__main__":
    main()
