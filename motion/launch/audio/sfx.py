"""Sound design: every effect is synthesized here from noise and sine waves, placed on the cue times.

Run: python audio/sfx.py
Writes public/audio/sfx.wav (48 kHz stereo, the length of the film).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
END = 86.0
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


def typing(tr: Track, t0: float, t1: float, db: float, max_rate: float = 16.0) -> None:
    """Soft key clicks at a natural, uneven rate between t0 and t1."""
    t = t0
    while t < t1:
        x = band(noise(0.02), 2000, 7000) * env_ad(int(0.02 * SR), 0.0005, 0.007)
        x[: int(0.006 * SR)] += click(0.5, 5000)[: int(0.006 * SR)]
        tr.put(t, norm(x, 1), db=db + rng.uniform(-3, 2), pan=rng.uniform(-0.25, 0.25))
        t += rng.uniform(1 / max_rate, 1.7 / max_rate) + (0.08 if rng.random() < 0.12 else 0.0)


def roll_ticks(tr: Track, t0: float, t1: float, n: int, db: float, f: float = 3800) -> None:
    """n ticks that start fast and slow down, the last one landing on t1."""
    w = np.cumsum(np.linspace(1.0, 4.0, n))
    for at in t0 + (t1 - t0) * w / w[-1]:
        tr.put(at, click(1.0, f), db=db, pan=0.1)


def chime(notes: tuple[float, ...], step: float, d: float, decay: float, lp: float | None = None) -> np.ndarray:
    x = np.zeros(int((d + step * len(notes)) * SR))
    for k, f in enumerate(notes):
        s = bell(f, d, decay)
        i = int(k * step * SR)
        x[i:i + len(s)] += s[: len(x) - i]
    return norm(band(x, None, lp) if lp else x, 1)


D6, E6, FS6, A6, D7 = 1174.66, 1318.51, 1479.98, 1760.0, 2349.32


def build(tl: dict) -> np.ndarray:
    tr = Track()
    b = tl["beats"]

    # intro: a soft tick per digit as 92% counts up, the stat line types, a tick as each AI logo pops
    roll_ticks(tr, b["statCount"][0], b["statCount"][1], 30, db=-33)
    typing(tr, b["statType"][0], b["statType"][1], db=-33)
    for k, at in enumerate(b["logos"]):
        tr.put(at, norm(bell((D6, E6, FS6, A6, D7)[k], 0.4, 0.08), 1), db=-34, pan=-0.5 + k * 0.25)
        tr.put(at, click(0.6, 4200), db=-32, pan=-0.5 + k * 0.25)
    # the buyer's prompt
    typing(tr, b["promptType"][0], b["promptType"][1], db=-31)

    # card snaps
    for k, at in enumerate(b["cards"]):
        crack = band(noise(0.05), 1200, 6500) * env_ad(int(0.05 * SR), 0.0004, 0.018, 5)
        thump = tone(150, 0.09, 0.03, glide=70)
        x = layer((1.0, norm(crack, 1)), (0.6, norm(thump, 1)))
        tr.put(at - 0.004, norm(x, 1), db=-21, pan=[-0.35, 0.0, 0.35][k])

    # glitch flicker, soft
    for k in range(7):
        d = 0.04
        car = np.sign(np.sin(2 * np.pi * rng.uniform(600, 1400) * secs(d)))
        crush = np.round(band(noise(d), 800, 6000) * 4) / 4
        x = (0.4 * car + crush) * env_ad(int(d * SR), 0.001, d * 0.7, 2)
        tr.put(b["ghost"] + k * 0.11 + (0.03 if k % 3 == 2 else 0), norm(x, 1), db=-32 - k * 1.2, pan=rng.uniform(-0.5, 0.5))

    # clicks: your competitor first, you at the end
    for at in (b["clickCompetitor"], b["clickYou"]):
        tr.put(at, click(1.0, 3000), db=-22)
        tr.put(at + 0.075, click(0.7, 3600), db=-25)

    # muted "booked" chime for the competitor (A5 then F#5, dark), bright one for you
    tr.put(b["demoBookedCompetitor"], chime((880.0, 739.99), 0.16, 1.2, 0.35, lp=2000), db=-26)
    tr.put(b["demoBookedYou"], chime((A6 / 2, D6, FS6), 0.09, 1.4, 0.5), db=-23)

    # the "missed pipeline" counter: low register ticks with a soft thump, speeding up
    m0, m1 = b["missed"]
    w = np.cumsum(np.linspace(2.2, 1.0, 34))
    for at in m0 + (m1 - m0) * (w - w[0]) / (w[-1] - w[0]):
        tk = layer((1.0, tone(880.0, 0.05, 0.015, ((1, 1.0), (2.7, 0.3)))), (0.6, tone(110.0, 0.06, 0.02)))
        tk[: int(0.006 * SR)] += click(0.5, 2200)[: int(0.006 * SR)]
        tr.put(at, norm(tk, 1), db=-31, pan=rng.uniform(-0.2, 0.2))

    # the ghost dissolves
    for _ in range(110):
        at = b["zero"] + rng.uniform(0, 1.0) ** 1.6
        g = tone(rng.uniform(3000, 8000), 0.06, 0.02)
        tr.put(at, g, db=-41 - (at - b["zero"]) * 12, pan=rng.uniform(-0.8, 0.8))

    # arrowhead blip and glow (D, in key)
    tr.put(b["arrowhead"], norm(tone(587.33, 0.14, 0.08, glide=1174.66), 1), db=-24)
    tr.put(b["arrowhead"] + 0.06, norm(tone(D6, 1.4, 0.55, ((1, 1.0), (2, 0.12))), 1), db=-31)

    # the drop: sub boom on D and a shockwave
    tr.put(b["drop"], norm(tone(73.4, 1.8, 0.55, glide=36.7), 1), db=-17)
    wave = sweep_band(noise(1.0), 5000, 400, q=1.2) * env_ad(int(SR), 0.004, 0.45, 3)
    tr.put(b["drop"], norm(wave, 1), db=-25, pan=np.linspace(-0.6, 0.6, int(SR)))

    # the arrow leaves the logo on its route: a soft launch whoosh
    w = whoosh(0.8, 300, 3000, peak_at=0.5)
    tr.put(b["drop"] + 7.2 - 0.4, w, db=-29, pan=np.linspace(-0.4, 0.6, len(w)))

    # into each station
    for at in b["stations"]:
        w = whoosh(0.55, 400, 4200, peak_at=0.8)
        tr.put(at - 0.44, w, db=-26, pan=np.linspace(-0.7, 0.5, len(w)))

    # topic pick: a click, then the brand tiles slide
    tr.put(b["topicPick"], click(1.0, 3200), db=-24)
    w = whoosh(0.9, 500, 2500, peak_at=0.45)
    tr.put(b["topicPick"] + 0.1, w, db=-30, pan=np.linspace(-0.3, 0.4, len(w)))

    # keyword sort: a short shuffle
    for k in range(8):
        f = band(noise(0.035), 1000, 4500) * env_ad(int(0.035 * SR), 0.001, 0.015)
        tr.put(b["keywordSort"] + k * 0.06 + rng.uniform(-0.008, 0.008), norm(f, 1), db=-30 + rng.uniform(-2, 2), pan=rng.uniform(-0.4, 0.4))

    # picks: a click and a rising note per keyword (D6 E6 F#6 A6)
    for k, at in enumerate(b["keywordPicks"]):
        tr.put(at, click(0.9, 3400), db=-27)
        tr.put(at + 0.01, norm(bell((D6, E6, FS6, A6)[k], 0.5, 0.16), 1), db=-31)

    # the calendar fills: soft ticks speeding up
    c0, c1 = b["calendarFill"]
    w = np.cumsum(np.linspace(2.0, 1.0, 18))
    for at in c0 + (c1 - c0) * (w - w[0]) / (w[-1] - w[0]):
        tr.put(at, click(0.8, 4200), db=-32, pan=rng.uniform(-0.4, 0.4))

    # the draft types itself
    typing(tr, b["draftType"][0], b["draftType"][1], db=-34)

    # content blocks drop in: a soft thump and a snap
    for k, at in enumerate(b["blocks"]):
        thump = tone(110, 0.15, 0.05, glide=70)
        snap = band(noise(0.03), 1500, 6000) * env_ad(int(0.03 * SR), 0.0005, 0.01)
        tr.put(at, norm(layer((1.0, norm(thump, 1)), (0.5, norm(snap, 1))), 1), db=-25, pan=(-0.2, 0.0, 0.2)[k])

    # "stand out": a bright hit as the article gets its ticks
    hit = layer((1.0, norm(bell(FS6, 0.9, 0.25), 1)), (0.7, norm(bell(A6, 0.9, 0.22), 1)), (0.5, click(1.0, 3000)))
    tr.put(b["standOut"], norm(hit, 1), db=-27)

    # paper fold: two creases
    f0 = b["fold"]
    for at, d in ((f0, 0.35), (f0 + 0.45, 0.45)):
        crackle = band(noise(d), 1200, 6500) * (rng.random(int(d * SR)) < 0.35)
        tr.put(at, norm(crackle * env_ad(int(d * SR), 0.03, d, 2.5), 1), db=-29, pan=0.15)
        tr.put(at + d - 0.03, click(0.8, 2200), db=-29)

    # big whip as the paper arrow launches
    w = whoosh(0.42, 700, 7000, peak_at=0.62)
    tr.put(b["ship"] - 0.25, w, db=-19, pan=np.linspace(-0.9, 0.9, len(w)))

    # the chart climbs: a soft rising shimmer, under the voice
    k0, k1 = b["climb"]
    d = k1 - k0
    t = secs(d)
    f = 440.0 * (1760.0 / 440.0) ** (t / d)
    rise = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.6 + 0.4 * band(noise(d), 3000, 9000)
    tr.put(k0, norm(rise * (t / d) ** 1.5 * np.exp(-np.clip(t - d + 0.15, 0, None) / 0.05), 1), db=-35)

    # the final chorus: impact and the gold spark shimmer (D major sparkles)
    imp = norm(tone(73.4, 1.2, 0.4, glide=36.7), 1)
    crack = band(noise(0.3), 300, 4000) * env_ad(int(0.3 * SR), 0.001, 0.07)
    imp[: len(crack)] += 0.45 * norm(crack, 1)
    tr.put(b["finalDrop"], norm(imp, 1), db=-16)
    sparkle = (D7, 2959.96, 3520.0, 4698.64, 2217.46, 3520.0)  # D7 F#7 A7 D8 C#7 A7
    for k in range(24):
        at = b["finalDrop"] + 0.02 + k * 0.055 + rng.uniform(0, 0.02)
        f = sparkle[k % len(sparkle)] * (0.5 if k % 4 == 3 else 1)
        tr.put(at, bell(f, 0.7, 0.18), db=-34 - k * 0.5, pan=np.sin(k * 1.7) * 0.8)

    # the deal card: a soft register "cha-ching" in key (a bell pair over a drawer thump)
    thump = tone(98.0, 0.18, 0.06, glide=73.4)
    ring = chime((D7, FS6 * 2), 0.07, 0.9, 0.3)
    cha = band(noise(0.06), 3000, 9000) * env_ad(int(0.06 * SR), 0.0005, 0.025)
    tr.put(b["deal"], norm(thump, 1), db=-26)
    tr.put(b["deal"] + 0.02, norm(cha, 1), db=-30)
    tr.put(b["deal"] + 0.05, ring, db=-27)

    # the handoff to sales: a confident two-note chime, A5 up to D6
    tr.put(b["sales"], chime((880.0, D6), 0.18, 1.4, 0.55), db=-24)

    # ---------- picture effects

    # glitch bursts: a digital tear, bit-crushed and stuttered, 140 ms each
    for k, at in enumerate(b.get("glitches", [])):
        d = 0.14
        n = int(d * SR)
        car = np.sign(np.sin(2 * np.pi * rng.uniform(300, 900) * secs(d)))
        crush = np.round(band(noise(d), 600, 8000) * 3) / 3
        x = 0.5 * car + crush
        hold = int(0.011 * SR)  # sample-and-hold stutter
        x = np.repeat(x[::hold], hold)[:n]
        gate = (np.floor(secs(d) / 0.023) % 2 == 0).astype(float) * 0.7 + 0.3
        x = x * gate * env_ad(n, 0.001, d, 1.5)
        tr.put(at, norm(x, 1), db=-27, pan=(-0.5, 0.4, -0.2, 0.5, -0.4, 0.2)[k % 6])

    # number slams: a tight snare crack, a low thump and a short white flash
    for at in b.get("slams", []):
        crack = band(noise(0.12), 900, 7000) * env_ad(int(0.12 * SR), 0.0005, 0.05, 5)
        body = tone(196.0, 0.12, 0.04, glide=150.0)
        thump = tone(80.0, 0.35, 0.12, glide=45.0)
        flash = band(noise(0.08), 4000, None) * env_ad(int(0.08 * SR), 0.0003, 0.03, 4)
        x = layer((1.0, norm(crack, 1)), (0.5, norm(body, 1)), (1.0, norm(thump, 1)), (0.4, norm(flash, 1)))
        tr.put(at - 0.003, norm(x, 1), db=-18)

    # kinetic words: a short "thock" per word, rising within each line, a soft air veil before each line
    def thock(f: float, big: bool = False) -> np.ndarray:
        d = 0.16 if big else 0.1
        x = layer((1.0, norm(tone(f, d, d / 3.5, ((1, 1.0), (2.1, 0.25)), glide=f * 0.7), 1)),
                  (0.6, norm(band(noise(0.02), 1500, 5000) * env_ad(int(0.02 * SR), 0.0003, 0.006), 1)))
        if big:
            x = layer((1.0, x), (0.8, norm(tone(70.0, 0.4, 0.14, glide=40.0), 1)))
        return norm(x, 1)

    for words in ((16.35, 16.75, 16.95), (61.05, 61.3), (73.45, 73.65, 74.3, 74.5), (77.6, 77.85, 78.05)):
        veil = band(noise(0.45), 2500, 10000) * np.sin(np.pi * secs(0.45) / 0.45) ** 2
        tr.put(words[0] - 0.15, norm(veil, 1), db=-36, pan=np.linspace(-0.3, 0.3, len(veil)))
        for k, at in enumerate(words):
            last_big = words[0] == 77.6 and k == len(words) - 1
            tr.put(at, thock(300.0 * 2 ** (k * 2 / 12), big=last_big), db=-22 if last_big else -25, pan=(k - 1) * 0.15)

    # 3D logo spin: a rising swoosh, then a metallic shimmer as the light sweeps across
    w = whoosh(0.9, 250, 5000, peak_at=0.9)
    tr.put(24.0, w, db=-26, pan=np.sin(np.linspace(0, 2 * np.pi, len(w))) * 0.6)
    shim = sum(bell(f, 0.6, 0.15) * 0.3 for f in (3520.0, 4698.64, 5919.9, 7040.0))
    shim = shim * np.clip(secs(0.6) / 0.05, 0, 1)
    tr.put(24.9, norm(band(shim, 2500, None), 1), db=-31, pan=np.linspace(-0.6, 0.6, len(shim)))

    # pin drops: a soft sonar bloop with a ripple echo
    for at in (32.0, 40.0, 48.0, 54.0):
        bl = tone(330.0, 0.4, 0.12, ((1, 1.0), (2, 0.15)), glide=520.0)
        x = np.zeros(len(bl) + int(0.32 * SR))
        x[: len(bl)] += bl
        x[int(0.16 * SR):int(0.16 * SR) + len(bl)] += 0.35 * bl
        x[int(0.32 * SR):] += 0.12 * bl[: len(x) - int(0.32 * SR)]
        tr.put(at, norm(x, 1), db=-27)

    # speed-ramp travels: a fast whoosh that decays into a slow-motion tail
    for t0, t1 in ((30.8, 32.0), (39.2, 40.1), (47.2, 48.1), (53.2, 54.1)):
        d = t1 - t0
        fast = whoosh(0.35, 800, 7000, peak_at=0.7)
        tail_d = d - 0.25
        tail = sweep_band(noise(tail_d), 2500, 180, q=1.4) * np.exp(-secs(tail_d) / (tail_d * 0.45))
        tail += 0.4 * tone(110.0, tail_d, tail_d * 0.4, glide=55.0)
        x = np.zeros(int(d * SR) + 1)
        x[: len(fast)] += norm(fast, 1)
        i = int(0.25 * SR)
        x[i:i + len(tail)] += 0.6 * norm(tail, 1)[: len(x) - i]
        tr.put(t0, x, db=-26, pan=np.linspace(-0.6, 0.5, len(x)))

    # closed won: a short, bright major chime (D6 F#6 A6 D7)
    tr.put(77.2, chime((D6, FS6, A6, D7), 0.05, 0.9, 0.3), db=-24)

    # logo strike at 84: a big cinematic hit with the final chord, and a ring tail
    boom = tone(73.4, 2.0, 0.7, glide=36.7)
    crack = band(noise(0.4), 200, 5000) * env_ad(int(0.4 * SR), 0.001, 0.12)
    ring = sum(bell(f, 2.0, 0.9) * a for f, a in ((587.33, 1.0), (880.0, 0.7), (1174.66, 0.5), (1479.98, 0.3)))
    hit = layer((1.0, norm(boom, 1)), (0.6, norm(crack, 1)), (0.45, norm(ring, 1)))
    tr.put(84.0, norm(hit, 1), db=-15)

    # the giant chevron sweeps up
    w = whoosh(0.7, 250, 6000, peak_at=0.6)
    tr.put(b["close"] - 0.42, w, db=-21, pan=np.linspace(-0.3, 0.3, len(w)))

    return tr.buf


def main() -> None:
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    assert tl["durationSec"] == END, tl["durationSec"]
    out = build(tl)
    (ROOT / "public/audio").mkdir(parents=True, exist_ok=True)
    sf.write(ROOT / "public/audio/sfx.wav", out.astype(np.float32), SR, subtype="FLOAT")
    print(f"sfx peak {20 * np.log10(np.abs(out).max()):.1f} dBFS, {len(out) / SR:.2f} s")


if __name__ == "__main__":
    main()
