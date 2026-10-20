"""Score: the Arrowsterr launch theme, written note by note, rendered to one stem per instrument.

One 2-bar motif carries the whole film. It climbs (5, 1, 2, 3) and lands on a held "star" note:
    A4 D5 E5 F5 | A5 (held)      in D minor, over Dm and Bb
It answers itself a third higher over F (C5 F5 G5 A5 | C6), turns major at 28 s (F becomes F#),
drives the drop in D major, climbs a whole step to E major at 54 s, and closes on a D-A-E cadence.
The root motion D-Bb-F-C is the same in every section.

Grid: 120 BPM, 4/4, a bar is 2.0 s, 32 bars is 64.0 s. All times below are in seconds.

Run: python audio/score.py   (needs fluidsynth and the MuseScore General soundfont)
Writes audio/build/midi/<stem>.mid and audio/build/stems/<stem>.wav (48 kHz stereo).
"""
from __future__ import annotations

import random
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SF = "/usr/share/sounds/sf3/MuseScore_General_Full.sf3"
TPB = 480
TICKS_PER_SEC = TPB * 2  # 120 BPM: 2 beats a second
END = 64.0
NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
         "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def p(name: str) -> int:
    """'D4' -> 62, 'Bb2' -> 46."""
    letter = name[:-1] if name[-1].isdigit() else name
    octave = int(name[len(letter):])
    return 12 * (octave + 1) + NAMES[letter]


def ps(names: str) -> list[int]:
    return [p(n) for n in names.split()]


@dataclass
class Note:
    t: float
    d: float
    pitch: int
    vel: int
    accent: bool = False  # accents stay exactly on the grid


@dataclass
class Part:
    name: str
    program: int
    bank: int = 0
    channel: int = 0
    pan: int = 64  # MIDI CC10, 0 left, 64 centre, 127 right
    notes: list[Note] = field(default_factory=list)
    cc: list[tuple[float, int, int]] = field(default_factory=list)
    bends: list[tuple[float, int]] = field(default_factory=list)

    def add(self, t: float, d: float, pitches, vel: int, accent: bool = False) -> None:
        if isinstance(pitches, (int, str)):
            pitches = [pitches]
        for x in pitches:
            self.notes.append(Note(t, d, p(x) if isinstance(x, str) else x, vel, accent))

    def swell(self, t0: float, t1: float, v0: int, v1: int, ctl: int = 2, steps: int = 40) -> None:
        for i in range(steps + 1):
            f = i / steps
            self.cc.append((t0 + (t1 - t0) * f, ctl, int(round(v0 + (v1 - v0) * f))))

    def vibrato(self, t0: float, t1: float, depth: int = 520, rate: float = 5.6, delay: float = 0.28) -> None:
        import math
        t = t0 + delay
        while t < t1 - 0.02:
            ramp = min(1.0, (t - t0 - delay) / 0.35)
            self.bends.append((t, int(depth * ramp * math.sin(2 * math.pi * rate * (t - t0)))))
            t += 0.02
        self.bends.append((t1, 0))


# ---------------------------------------------------------------- harmony helpers

SCALES = {  # the scale used over each chord, for harmony lines
    "D": "D E F# G A B C#", "Bb": "Bb C D Eb F G A", "F": "F G A Bb C D E", "C": "C D E F G A Bb",
    "E": "E F# G# A B C# D#", "A": "A B C# D E F# G#", "G": "G A B C D E F#",
    "Dm": "D E F G A Bb C", "Gm": "G A Bb C D Eb F", "B7": "B C# D# E F# G# A",
}


def below(pitch: int, chord: str, steps: int) -> int:
    """The scale tone `steps` scale degrees under `pitch` (2 = a third, 4 = a fifth)."""
    pcs = sorted(NAMES[n] for n in SCALES[chord].split())
    pool = [o * 12 + pc for o in range(1, 9) for pc in pcs]
    if pitch in pool:
        return [x for x in pool if x < pitch][-steps]
    tries = {2: (4, 3), 4: (7, 8)}[steps]  # a colour note over this chord: plain major/minor third or fifth
    return next((pitch - k for k in tries if pitch - k in pool), pitch - tries[0])


def octave(name: str, k: int) -> str:
    """'F1', +1 -> 'F2'."""
    return name[:-1] + str(int(name[-1]) + k)


def add_harmony(pt: "Part", t: float, d: float, melody: int, changes, steps: int, vel: int) -> None:
    """A harmony voice under a melody note, re-voiced at every chord change the note is held across."""
    cuts = [t] + [c for c, _ in changes if t + 1e-6 < c < t + d - 1e-6] + [t + d]
    for a, b in zip(cuts, cuts[1:]):
        pt.add(a, b - a, below(melody, chord_at(a, changes), steps), vel, True)


def chord_at(t: float, changes: list[tuple[float, str]]) -> str:
    cur = changes[0][1]
    for when, name in changes:
        if when <= t + 1e-6:
            cur = name
    return cur


# ---------------------------------------------------------------- the motif

def motif(t0: float, key: str) -> list[tuple[float, float, str]]:
    """Climb and star, 2 bars from t0. key 'm' = D minor, 'M' = D major, 'E' = E major."""
    if key == "E":
        return [(t0, .25, "B4"), (t0 + .25, .25, "E5"), (t0 + .5, .25, "F#5"), (t0 + .75, .25, "G#5"), (t0 + 1, 2.0, "B5")]
    third = "F5" if key == "m" else "F#5"
    return [(t0, .25, "A4"), (t0 + .25, .25, "D5"), (t0 + .5, .25, "E5"), (t0 + .75, .25, third), (t0 + 1, 2.0, "A5")]


def answer(t0: float) -> list[tuple[float, float, str]]:
    """The motif's sequence, a third higher over F (starts at t0, the F bar)."""
    return [(t0, .25, "C5"), (t0 + .25, .25, "F5"), (t0 + .5, .25, "G5"), (t0 + .75, .25, "A5"), (t0 + 1, 1.5, "C6")]


def phrase(t0: float, key: str, ending: str) -> list[tuple[float, float, str]]:
    """4 bars over D(m)-Bb-F-C starting at t0."""
    n = motif(t0, key)
    if ending == "A":
        n += [(t0 + 3.0, .25, "G5"), (t0 + 3.25, .25, "F5"), (t0 + 3.5, .5, "D5")]
        n += answer(t0 + 4)
        n += [(t0 + 6.5, .25, "Bb5"), (t0 + 6.75, .25, "A5"), (t0 + 7.0, .5, "G5"), (t0 + 7.5, .5, "E5")]
    else:  # B: the lift, climbs to E6 over C
        n += [(t0 + 3.0, .5, "Bb5"), (t0 + 3.5, .5, "A5")]
        n += answer(t0 + 4)[:4] + [(t0 + 5.0, .5, "C6"), (t0 + 5.5, .5, "D6")]
        n += [(t0 + 6.0, 1.0, "E6"), (t0 + 7.0, .5, "D6"), (t0 + 7.5, .5, "C6")]
    return n


# ---------------------------------------------------------------- the arrangement

def build() -> dict[str, list[Part]]:
    rnd = random.Random(7)
    stems: dict[str, list[Part]] = {}

    def part(stem, name, program, bank=0, channel=0, pan=64):
        pt = Part(name, program, bank, channel, pan)
        stems.setdefault(stem, []).append(pt)
        return pt

    piano = part("piano", "Grand Piano", 0)
    pad = part("strings", "Strings Slow Expr", 49, bank=17, channel=0)
    ost = part("strings", "Strings Fast", 48, channel=1, pan=80)
    trem = part("strings", "Strings Trem Expr", 44, bank=17, channel=2)
    low = part("strings", "Celli Slow", 49, bank=40, channel=3, pan=50)
    pizz = part("pizz", "Strings Pizzicato", 45)
    bass = part("bass", "Picked Bass", 34)
    sub = part("sub", "Sine Wave", 80, bank=8)
    drums = part("drums", "Power kit", 16, channel=9)
    timp = part("timpani", "Timpani", 47)
    gtr_l = part("gtr_l", "Distortion Guitar", 30)
    gtr_r = part("gtr_r", "Overdrive Guitar", 29)
    lead = part("lead", "Overdrive Guitar lead", 29, channel=0)
    harm = part("lead", "Overdrive Guitar harmony", 29, channel=1, pan=88)
    harm2 = part("lead", "Overdrive Guitar 5th", 29, channel=2, pan=40)
    choir = part("choir", "Choir Aahs Expr", 52, bank=17)
    horns = part("horns", "French Horns", 60)
    brass = part("brass", "Brass Section", 61)

    for pt in stems["strings"] + [choir]:  # the Expr presets follow CC2 (breath) for loudness
        pt.cc.append((0.0, 2, 100))

    # ---------- 0-8 Hook: solo piano, the motif in D minor (Dm Bb F C)
    for t, d, n in phrase(0.0, "m", "A"):
        piano.add(t, d, n, 52 + rnd.randint(-4, 4))
    for t, ch in [(0, "D2 D3"), (2, "Bb1 Bb2"), (4, "F2 F3"), (6, "C2 C3")]:
        piano.add(t, 2.0, ch.split(), 44)
    for t, ch in [(0.5, "F3 A3"), (2.5, "F3 Bb3"), (4.5, "F3 A3 C4"), (6.5, "E3 G3")]:
        piano.add(t, 1.5, ch.split(), 36)

    # ---------- 6-10 Shortlist: low strings pad and sub pulse come in
    pad.add(6.0, 2.0, "C3 E3 G3".split(), 50)
    low.add(6.0, 2.0, "C2", 55)
    pad.add(8.0, 2.0, "D3 F3 A3".split(), 54)
    low.add(8.0, 2.0, "D2", 58)
    for b in range(6, 10):  # half-second pulse
        sub.add(float(b), 0.45, "C1" if b < 8 else "D1", 70)
        sub.add(b + 0.5, 0.45, "C1" if b < 8 else "D1", 58)
    for t in (8.0, 8.5, 9.0):  # card snaps
        piano.add(t, 0.18, "D4 F4 A4 D5".split(), 78, accent=True)
        piano.add(t, 0.18, "D2", 70, accent=True)
        pizz.add(t, 0.2, "D3 A3 F4 D5".split(), 96, accent=True)
    piano.add(9.5, 0.5, "A4", 50)

    # ---------- 10-12 Ghost: thin, bass out for the first beat
    pad.add(10.0, 2.0, "Bb2 D3 F3".split(), 42)
    sub.add(10.5, 0.45, "Bb1", 52)
    sub.add(11.0, 0.45, "Bb1", 52)
    sub.add(11.5, 0.45, "Bb1", 52)
    piano.add(10.0, 1.0, "D6", 34)
    piano.add(10.75, 1.25, "F5", 30)

    # ---------- 12-16 Loss: Gm, then Bb to A, low hits at 12.5 and 13.0
    pad.add(12.0, 2.0, "G2 Bb2 D3".split(), 56)
    low.add(12.0, 2.0, "G1", 64)
    for t in (12.5, 13.0):
        piano.add(t, 0.9, "G1 G2".split(), 86, accent=True)
        timp.add(t, 0.9, "G2", 84, accent=True)
    sub.add(12.5, 1.4, "G1", 70)
    pad.add(14.0, 1.0, "Bb2 D3 F3".split(), 54)
    pad.add(15.0, 1.0, "A2 C#3 E3".split(), 58)
    low.add(14.0, 1.0, "Bb1", 60)
    low.add(15.0, 1.0, "A1", 64)
    for t, d, n in [(14.0, .25, "A3"), (14.25, .25, "D4"), (14.5, .25, "E4"), (14.75, .25, "F4"), (15.0, 1.0, "E4")]:
        piano.add(t, d, n, 46)

    # ---------- 16-27 Check: D pedal in 8ths, strings ostinato, drums build; minor stab at 23
    check = [(16, "Dm"), (18, "Bb"), (20, "Gm"), (22, "Bb"), (23, "Dm"), (24, "A")]
    voic = {"Dm": "D4 F4 A4", "Bb": "D4 F4 Bb4", "Gm": "D4 G4 Bb4", "A": "C#4 E4 A4"}
    ost_pat = {"Dm": "D5 A4 F5 A4", "Bb": "D5 Bb4 F5 Bb4", "Gm": "D5 Bb4 G5 Bb4", "A": "E5 A4 C#5 A4"}
    pad_v = {"Dm": "D3 F3 A3", "Bb": "D3 F3 Bb3", "Gm": "D3 G3 Bb3", "A": "C#3 E3 A3"}
    for i, (t0, ch) in enumerate(check):
        t1 = check[i + 1][0] if i + 1 < len(check) else 27.0
        pad.add(t0, t1 - t0, pad_v[ch].split(), 62 + i * 6)
        low.add(t0, t1 - t0, "A1" if ch == "A" else "D2", 72)
    t = 16.0
    while t < 26.99:  # bass: driving 8ths, D pedal, A from 24
        k = (t - 16.0) / 11.0
        bass.add(t, 0.22, "A1" if t >= 24.0 else "D2", int(72 + 40 * k) + rnd.randint(-5, 5), accent=(t % 1.0 == 0))
        t += 0.25
    for t in [x * 0.5 for x in range(32, 54)]:
        sub.add(t, 0.45, "A1" if t >= 24.0 else "D1", 76)
    t = 16.0
    while t < 26.99:  # string ostinato: 8ths, 16ths from 20
        ch = chord_at(t, check)
        step = 0.25 if t < 20.0 else 0.125
        pat = ost_pat[ch].split()
        idx = int(round((t - 16.0) / step)) % 4
        ost.add(t, step * 0.8, pat[idx], int(58 + 50 * (t - 16.0) / 11.0) + rnd.randint(-6, 6))
        t += step
    # drums build
    K, S, CH, OH, CR, CR2, RIDE, T1, T2, T3, T4 = 36, 38, 42, 46, 49, 57, 51, 41, 43, 45, 47
    for t in (16.0, 17.0):
        drums.add(t, .1, K, 84, True)
    drums.add(17.75, .1, T1, 70)
    for t in (18.0, 18.5, 19.0, 19.5):
        drums.add(t, .1, K, 92, True)
    for t in [18 + x * .25 for x in range(8)]:
        drums.add(t, .1, T1, 60 + rnd.randint(-6, 6))
    for t in [20 + x * .5 for x in range(4)]:
        drums.add(t, .1, K, 98, True)
    for t in (20.5, 21.5):
        drums.add(t, .1, S, 96, True)
    for t in [20 + x * .25 for x in range(8)]:
        drums.add(t, .1, T2 if (t * 4) % 2 else T1, 66 + rnd.randint(-6, 6))
    for t in [22 + x * .5 for x in range(4)]:
        drums.add(t, .1, K, 104, True)
    drums.add(22.5, .1, S, 100, True)
    drums.add(23.5, .1, S, 104, True)
    drums.add(23.0, .1, CR, 112, True)
    for t in [22 + x * .25 for x in range(8)]:
        drums.add(t, .1, CH, 70 + rnd.randint(-8, 8))
    for i, t in enumerate([24 + x * .25 for x in range(8)]):  # snare 8ths then 16ths crescendo
        drums.add(t, .1, S, 74 + i * 3)
    for t in [24 + x * .5 for x in range(4)]:
        drums.add(t, .1, K, 108, True)
    for i, t in enumerate([26 + x * .0625 for x in range(16)]):
        drums.add(t, .05, S, 80 + i * 2)
    for i, t in enumerate([26 + x * .25 for x in range(4)]):
        drums.add(t, .1, [T4, T3, T2, T1][i], 104)
        drums.add(t, .1, K, 110, True)
    # minor stab at 23.0
    brass.add(23.0, 0.45, "D3 A3 D4 F4 A4".split(), 118, True)
    piano.add(23.0, 0.5, "D2 D3 A3 D4 F4 A4 D5".split(), 112, True)
    timp.add(23.0, 0.8, "D2", 118, True)
    ost.add(23.0, 0.3, "D4 F4 A4 D5".split(), 112, True)
    # timpani pulses in the build
    for t in (16.0, 18.0, 20.0, 22.0, 24.0, 25.0, 26.0, 26.5):
        timp.add(t, 0.45, "A1" if t >= 24 else "D2", 70 + int((t - 16) * 4), True)
    # riser 24.5-27: strings tremolo on A, crescendo
    trem.add(24.5, 2.5, "A3 C#4 E4 A4".split(), 100)
    trem.swell(24.5, 26.98, 20, 127)
    trem.cc.append((27.0, 2, 0))

    # ---------- 28-32 Navigator: the first major chord, the motif in major, run-up Bb C to D
    piano.add(28.0, 2.0, "D2 D3".split(), 80, True)
    piano.add(28.0, 2.0, "A3 D4 F#4".split(), 62, True)
    for t, d, n in motif(28.0, "M")[:4] + [(29.0, 1.0, "A5")]:
        piano.add(t, d, n, 70 + rnd.randint(-3, 3))
    choir.add(28.0, 2.0, "D4 F#4 A4 D5".split(), 96, True)
    choir.swell(28.0, 31.98, 46, 118)
    pad.add(28.0, 2.0, "D3 F#3 A3 D4".split(), 84, True)
    pad.swell(28.0, 31.98, 40, 120)
    low.add(28.0, 2.0, "D2", 80, True)
    for t, ch_p, ch_c, ch_b in [(30.0, "Bb2 D3 F3 Bb3", "D4 F4 Bb4 D5", "Bb1"), (31.0, "C3 E3 G3 C4", "E4 G4 C5 E5", "C2")]:
        piano.add(t, 1.0, ch_p.split() + [ch_b, octave(ch_b, 1)], 92, True)
        choir.add(t, 1.0, ch_c.split(), 104, True)
        pad.add(t, 1.0, ch_p.split(), 96, True)
        low.add(t, 1.0, ch_b, 90, True)
        bass.add(t, 1.0, ch_b, 96, True)
    for i, t in enumerate([30 + x * .0625 for x in range(32)]):  # timpani and snare rolls
        timp.add(t, .06, "D2" if t < 31 else "C2", 50 + int(i * 2.2))
        drums.add(t, .05, S, 44 + int(i * 2.4))

    # ---------- 32-50 The drop, D major: full band
    drop = [(32, "D"), (34, "Bb"), (36, "F"), (38, "C"), (40, "D"), (42, "Bb"), (44, "F"), (46, "C"), (48, "Bb"), (49, "C")]
    power = {"D": "D2 A2 D3", "Bb": "Bb1 F2 Bb2", "F": "F2 C3 F3", "C": "C2 G2 C3", "E": "E2 B2 E3", "A": "A1 E2 A2", "B7": "B1 F#2 B2"}
    bass_root = {"D": "D2", "Bb": "Bb1", "F": "F1", "C": "C2", "E": "E2", "A": "A1", "B7": "B1"}
    piano_rh = {"D": "D4 F#4 A4", "Bb": "D4 F4 Bb4", "F": "C4 F4 A4", "C": "C4 E4 G4", "E": "E4 G#4 B4", "A": "C#4 E4 A4"}
    choir_v = {"D": "D4 F#4 A4 D5", "Bb": "D4 F4 Bb4 D5", "F": "C4 F4 A4 C5", "C": "C4 E4 G4 C5",
               "E": "E4 G#4 B4 E5", "A": "C#4 E4 A4 C#5"}
    choir_hi = {"D": "F#5 A5", "Bb": "F5 Bb5", "F": "F5 A5", "C": "E5 G5", "E": "G#5 B5", "A": "E5 A5"}

    def band(t0: float, t1: float, changes, intensity: float, hi_choir: bool) -> None:
        t = t0
        while t < t1 - 1e-6:
            ch = chord_at(t, changes)
            on_beat = abs(t - round(t * 2) / 2) < 1e-6
            v = int(88 + 22 * intensity)
            for g, side in ((gtr_l, 0), (gtr_r, 1)):
                g.add(t + (0 if on_beat else rnd.uniform(-.006, .006)), 0.21, power[ch].split(), v - (0 if on_beat else 14) + rnd.randint(-4, 4), on_beat)
            bass.add(t, 0.22, bass_root[ch], v - 4 + rnd.randint(-4, 4), on_beat)
            piano.add(t, 0.2, piano_rh[ch].split(), v - 18 - (0 if on_beat else 10) + rnd.randint(-4, 4), on_beat)
            t += 0.25
        for i, (ct, ch) in enumerate(changes):
            if not (t0 - 1e-6 <= ct < t1):
                continue
            nt = next((c[0] for c in changes[i + 1:]), t1)
            nt = min(nt, t1)
            choir.add(ct, nt - ct, choir_v[ch].split(), int(90 + 20 * intensity), True)
            if hi_choir:
                choir.add(ct, nt - ct, choir_hi[ch].split(), int(80 + 20 * intensity), True)
            pad.add(ct, nt - ct, (choir_v[ch].split()[:3]), int(80 + 20 * intensity), True)
            low.add(ct, nt - ct, bass_root[ch], 88, True)
            piano.add(ct, min(1.0, nt - ct), [bass_root[ch], octave(bass_root[ch], 1)], 96, True)

    def rock_beat(t0: float, t1: float, crashes: set[float], vel: int) -> None:
        t = t0
        while t < t1 - 1e-6:
            beat = int((t - t0) * 2 + 1e-6) % 4
            frac = round((t * 2) % 1, 3)
            if frac == 0:
                if beat in (0, 2):
                    drums.add(t, .1, K, vel, True)
                if beat in (1, 3):
                    drums.add(t, .1, S, vel + 4, True)
            elif beat == 2:
                drums.add(t, .1, K, vel - 16)
            hat = OH if (beat == 3 and frac) else CH
            if round(t, 3) not in crashes:
                drums.add(t + (0 if frac == 0 else rnd.uniform(-.006, .006)), .1, hat, (vel - 20 if frac else vel - 8) + rnd.randint(-6, 6))
            t += 0.25
        for c in crashes:
            drums.add(c, .1, CR, 118, True)
            drums.add(c, .1, CR2, 100, True)
            drums.add(c, .1, K, vel + 6, True)

    band(32.0, 40.0, drop, 0.7, hi_choir=False)
    band(40.0, 48.0, drop, 0.9, hi_choir=True)
    rock_beat(32.0, 48.0, {32.0, 34.0, 38.0, 42.0, 46.0, 40.0}, 104)
    # tom fills at the end of each phrase
    for i, t in enumerate([39.5 + x * .125 for x in range(4)]):
        drums.add(t, .1, [T4, T3, T2, T1][i], 108)
    for i, t in enumerate([47.0 + x * .125 for x in range(8)]):
        drums.add(t, .1, [T4, T4, T3, T3, T2, T2, T1, T1][i], 100 + i * 2)
    # the accents on 34, 38, 42, 46: timpani + brass stab
    for t in (34.0, 38.0, 42.0, 46.0):
        ch = chord_at(t, drop)
        timp.add(t, 0.8, octave(bass_root[ch], 2 - int(bass_root[ch][-1])), 112, True)
        brass.add(t, 0.5, [octave(x, 1) for x in power[ch].split()], 104, True)
    # 48-50: Bb then C run-up, band keeps going, snare 16ths into 50
    band(48.0, 50.0, drop, 0.85, hi_choir=True)
    for i, t in enumerate([48 + x * .5 for x in range(2)]):
        drums.add(t, .1, K, 108, True)
        drums.add(t + .5, .1, S, 108, True)
    for i, t in enumerate([49 + x * .0625 for x in range(16)]):
        drums.add(t, .05, S, 76 + i * 3)
    drums.add(48.0, .1, CR, 110, True)

    # lead guitar: phrase A alone, phrase B with harmony in thirds; horns double B an octave down
    for t, d, n in phrase(32.0, "M", "A"):
        lead.add(t, d, n, 104 + rnd.randint(-4, 4), True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
    for t, d, n in phrase(40.0, "M", "B"):
        lead.add(t, d, n, 108 + rnd.randint(-4, 4), True)
        add_harmony(harm, t, d, p(n), drop, 2, 96 + rnd.randint(-4, 4))
        horns.add(t, d, p(n) - 12, 92, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
            harm.vibrato(t, t + d, depth=480, rate=5.2)
    for t, d, n in [(48.0, 1.0, "D6"), (49.0, 1.0, "E6"), (50.0, 1.5, "D6")]:
        lead.add(t, d, n, 110, True)
        add_harmony(harm, t, d, p(n), drop + [(50, "D")], 2, 98)
        lead.vibrato(t, t + d)
        harm.vibrato(t, t + d, depth=480, rate=5.2)

    # ---------- 50-52 "Ship it": half-time on D
    for g in (gtr_l, gtr_r):
        g.add(50.0, 2.0, power["D"].split() + ["F#3"], 112, True)
    bass.add(50.0, 2.0, "D2", 108, True)
    piano.add(50.0, 2.0, "D2 D3 A3 D4 F#4 A4".split(), 100, True)
    choir.add(50.0, 2.0, (choir_v["D"] + " " + choir_hi["D"]).split(), 108, True)
    pad.add(50.0, 2.0, "D3 F#3 A3 D4".split(), 96, True)
    low.add(50.0, 2.0, "D2", 92, True)
    drums.add(50.0, .1, K, 120, True)
    drums.add(50.0, .1, CR, 122, True)
    drums.add(50.0, .1, CR2, 110, True)
    drums.add(51.0, .1, S, 118, True)
    drums.add(51.5, .1, K, 96)
    timp.add(50.0, 1.5, "D2", 120, True)

    # ---------- 52-54 piano motif alone in major, B7 pivot, fill and riser into E
    for t, d, n in motif(52.0, "M")[:4] + [(53.0, 1.0, "A5")]:
        piano.add(t, d, n, 78 + rnd.randint(-3, 3), True)
    piano.add(52.0, 1.0, "D2 D3 A3 F#4".split(), 60, True)
    piano.add(53.0, 1.0, "B1 B2 A3 D#4 F#4".split(), 72, True)
    pad.add(52.0, 1.0, "D3 F#3 A3".split(), 58)
    trem.add(52.5, 1.5, "B3 D#4 F#4 A4".split(), 100)
    trem.swell(52.5, 53.98, 24, 127)
    trem.cc.append((54.0, 2, 100))
    low.add(53.0, 1.0, "B1", 80)
    for i, t in enumerate([53 + x * .125 for x in range(8)]):
        drums.add(t, .1, [T4, T4, T3, T3, T2, T2, T1, T1][7 - i] if i < 4 else S, 84 + i * 5)
    for i, t in enumerate([53.5 + x * .0625 for x in range(8)]):
        drums.add(t, .05, S, 96 + i * 3)
    drums.add(53.5, .1, K, 104)
    drums.add(53.75, .1, K, 110)

    # ---------- 54-58 Final drop, E major: everything, choir high, 3-part guitar harmony
    final = [(54, "E"), (56, "C")]
    band(54.0, 58.0, final, 1.0, hi_choir=True)
    rock_beat(54.0, 58.0, {54.0, 55.0, 56.0, 57.0}, 112)
    for t in (56.0, 56.5):  # accents
        brass.add(t, 0.35, "C4 E4 G4 C5".split(), 120, True)
        timp.add(t, 0.5, "C2", 120, True)
        drums.add(t, .1, CR, 122, True)
        drums.add(t, .1, K, 122, True)
    timp.add(54.0, 1.0, "E2", 124, True)
    brass.add(54.0, 0.6, "E3 B3 E4 G#4 B4".split(), 124, True)
    fin_lead = motif(54.0, "E") + [(57.0, .25, "A5"), (57.25, .25, "G5"), (57.5, .5, "E5")]
    for t, d, n in fin_lead:
        lead.add(t, d, n, 116, True)
        add_harmony(harm, t, d, p(n), final, 2, 104)
        add_harmony(harm2, t, d, p(n), final, 4, 98)
        horns.add(t, d, p(n) - 12, 100, True)
        if d >= 1.0:
            for g, dep, r in ((lead, 520, 5.6), (harm, 480, 5.2), (harm2, 460, 5.9)):
                g.vibrato(t, t + d, depth=dep, rate=r)

    # ---------- 58-64 Close: D - A - E, the motif one last time, the star rings out
    close = [(58, "D"), (60, "A"), (62, "E")]
    close_lead = motif(58.0, "M")[:4] + [(59.0, 1.5, "A5"), (60.5, .5, "G#5"), (61.0, .5, "C#6"), (61.5, .5, "B5"), (62.0, 2.0, "B5")]
    for t, d, n in close_lead:
        lead.add(t, d, n, 112, True)
        add_harmony(harm, t, d, p(n), close, 2, 100)
        if t >= 61.0:
            add_harmony(harm2, t, d, p(n), close, 4, 94)
        horns.add(t, d, p(n) - 12, 92, True)
        if d >= 1.0:
            for g, dep, r in ((lead, 520, 5.6), (harm, 480, 5.2), (harm2, 460, 5.9)):
                g.vibrato(t, t + d, depth=dep, rate=r)
    for i, (t0, ch) in enumerate(close):
        d = 2.0
        last = ch == "E"
        for g in (gtr_l, gtr_r):
            g.add(t0, d, power[ch].split(), 110 if not last else 116, True)
        bass.add(t0, d, bass_root[ch] if ch != "E" else "E1", 108, True)
        piano.add(t0, d, [octave(bass_root[ch], -1), bass_root[ch]] + piano_rh[ch].split() + [octave(piano_rh[ch].split()[0], 1)], 104, True)
        choir.add(t0, d, (choir_v[ch] + " " + choir_hi[ch]).split(), 112, True)
        pad.add(t0, d, choir_v[ch].split(), 104, True)
        low.add(t0, d, bass_root[ch], 96, True)
        drums.add(t0, .1, K, 118, True)
        drums.add(t0, .1, CR, 120, True)
        timp.add(t0, 1.0 if not last else 2.0, octave(bass_root[ch], 2 - int(bass_root[ch][-1])), 118, True)
        if not last:
            drums.add(t0 + 1.0, .1, S, 116, True)
            for k in range(4):
                drums.add(t0 + k * 0.5, .1, RIDE, 92)
    for i, t in enumerate([61.5 + x * .0625 for x in range(8)]):
        drums.add(t, .05, S, 100 + i * 3)
    choir.swell(62.0, 63.9, 118, 70)
    pad.swell(62.0, 63.9, 120, 70)

    return stems


# ---------------------------------------------------------------- MIDI out and render

def humanize(parts: list[Part], seed: int) -> None:
    rnd = random.Random(seed)
    for pt in parts:
        for n in pt.notes:
            if not n.accent:
                n.t = max(0.0, n.t + rnd.uniform(-0.008, 0.008))
                n.vel = max(1, min(127, n.vel + rnd.randint(-6, 6)))


def write_midi(stem: str, parts: list[Part], path: Path) -> None:
    mid = mido.MidiFile(type=1, ticks_per_beat=TPB)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    mid.tracks.append(meta)
    for pt in parts:
        tr = mido.MidiTrack()
        ev: list[tuple[int, int, mido.Message]] = []
        ch = pt.channel
        ev.append((0, 0, mido.Message("control_change", channel=ch, control=0, value=pt.bank if ch != 9 else 0)))
        ev.append((0, 0, mido.Message("program_change", channel=ch, program=pt.program)))
        ev.append((0, 0, mido.Message("control_change", channel=ch, control=7, value=110)))
        ev.append((0, 0, mido.Message("control_change", channel=ch, control=10, value=pt.pan)))
        ev.append((0, 0, mido.Message("control_change", channel=ch, control=91, value=0)))
        ev.append((0, 0, mido.Message("control_change", channel=ch, control=93, value=0)))
        for t, c, v in pt.cc:
            ev.append((int(t * TICKS_PER_SEC), 1, mido.Message("control_change", channel=ch, control=c, value=max(0, min(127, v)))))
        for t, b in pt.bends:
            ev.append((int(t * TICKS_PER_SEC), 1, mido.Message("pitchwheel", channel=ch, pitch=max(-8192, min(8191, b)))))
        for n in pt.notes:
            if n.t >= END:
                continue
            on = int(round(n.t * TICKS_PER_SEC))
            off = int(round(min(n.t + n.d, END) * TICKS_PER_SEC))
            ev.append((on, 3, mido.Message("note_on", channel=ch, note=n.pitch, velocity=max(1, min(127, n.vel)))))
            ev.append((max(on + 1, off), 2, mido.Message("note_off", channel=ch, note=n.pitch, velocity=0)))
        ev.sort(key=lambda e: (e[0], e[1]))
        last = 0
        for tick, _, msg in ev:
            tr.append(msg.copy(time=tick - last))
            last = tick
        mid.tracks.append(tr)
    mid.save(path)


def render(midi: Path, wav: Path) -> None:
    subprocess.run(
        ["fluidsynth", "-ni", "-q", "-F", str(wav), "-r", "48000", "-g", "0.5", "-o", "audio.file.format=float",
         "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0", "-o", "synth.polyphony=512",
         SF, str(midi)],
        check=True,
    )


def main() -> None:
    (BUILD / "midi").mkdir(parents=True, exist_ok=True)
    (BUILD / "stems").mkdir(parents=True, exist_ok=True)
    stems = build()
    for i, (stem, parts) in enumerate(stems.items()):
        humanize(parts, seed=100 + i)
        mid = BUILD / "midi" / f"{stem}.mid"
        write_midi(stem, parts, mid)
        render(mid, BUILD / "stems" / f"{stem}.wav")
        print(f"{stem:10s} {sum(len(pt.notes) for pt in parts):5d} notes")
    # one crash hit, reversed later for the cymbal swells
    one = Part("crash", 16, channel=9)
    one.add(0.0, 0.1, 49, 120, True)
    one.add(0.0, 0.1, 57, 110, True)
    write_midi("crash_one", [one], BUILD / "midi" / "crash_one.mid")
    render(BUILD / "midi" / "crash_one.mid", BUILD / "stems" / "crash_one.wav")


if __name__ == "__main__":
    main()
