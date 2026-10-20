"""Score: "Navigator", one song for the whole Arrowsterr launch film, rendered to one stem per instrument.

One key (D major), one tempo (120 BPM, a bar is 2.0 s), one 4-bar loop from the first bar to the last:
    D | A/C# | Bm | G          (the bass walks down D, C#, B, then G)
One hook rides the loop. It climbs like the arrow, holds on a "star" note, and answers itself:
    D     A4 D5 E5 F#5 (eighths), A5 held
    A/C#  G5 F#5, E5 held
    Bm    F#4 B4 C#5 D5 (eighths), F#5 held
    G     E5 F#5, D5 held
The song never stops and never changes key. It grows by adding instruments:
    0-8 intro (piano and glockenspiel, soft pulse), 8-16 verse (bass, light drums, muted guitar),
    16-24 verse 2 (eighth hats, toms under the radar pings), 24-28 breakdown (no drums),
    28-32 build (kick on quarters, snare roll, timpani), 32-66 chorus (full band),
    66-68 fill, 68-72 lift (choir), 72-77 final chorus, 77-84 outro (tag, lands on D at 80).

Run: python audio/score.py   (needs fluidsynth and the MuseScore General soundfont)
Writes audio/build/midi/<stem>.mid and audio/build/stems/<stem>.wav (48 kHz stereo).
"""
from __future__ import annotations

import math
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
END = 84.0
BAR = 2.0
NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
         "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def p(name: str) -> int:
    """'D4' -> 62, 'C#2' -> 37."""
    letter = name[:-1] if name[-1].isdigit() else name
    return 12 * (int(name[len(letter):]) + 1) + NAMES[letter]


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
            self.notes.append(Note(t, d, p(x) if isinstance(x, str) else x, int(vel), accent))

    def swell(self, t0: float, t1: float, v0: int, v1: int, ctl: int = 2, steps: int = 40) -> None:
        for i in range(steps + 1):
            f = i / steps
            self.cc.append((t0 + (t1 - t0) * f, ctl, int(round(v0 + (v1 - v0) * f))))

    def vibrato(self, t0: float, t1: float, depth: int = 420, rate: float = 5.4, delay: float = 0.3) -> None:
        t = t0 + delay
        while t < t1 - 0.02:
            ramp = min(1.0, (t - t0 - delay) / 0.35)
            self.bends.append((t, int(depth * ramp * math.sin(2 * math.pi * rate * (t - t0)))))
            t += 0.02
        self.bends.append((t1, 0))


# ---------------------------------------------------------------- the loop and the hook

LOOP = ["D", "A", "Bm", "G"]
BASS = {"D": "D2", "A": "C#2", "Bm": "B1", "G": "G1"}  # the walk down
ROOT_NOTE = {"D": "D", "A": "A", "Bm": "B", "G": "G"}
TRIAD = {"D": "D4 F#4 A4", "A": "C#4 E4 A4", "Bm": "D4 F#4 B4", "G": "D4 G4 B4"}
PAD = {"D": "D3 A3 D4 F#4", "A": "C#3 A3 C#4 E4", "Bm": "B2 F#3 B3 D4", "G": "G2 D3 G3 B3"}
CHOIR = {"D": "F#4 A4 D5", "A": "E4 A4 C#5", "Bm": "F#4 B4 D5", "G": "G4 B4 D5"}
POWER = {"D": "D3 A3 D4", "A": "A2 E3 A3", "Bm": "B2 F#3 B3", "G": "G2 D3 G3"}
SCALE = [p(n) for o in range(2, 8) for n in (f"D{o}", f"E{o}", f"F#{o}", f"G{o}", f"A{o}", f"B{o}", f"C#{o}")]
CHORD_TONES = {"D": {2, 6, 9}, "A": {9, 1, 4}, "Bm": {11, 2, 6}, "G": {7, 11, 2}}


def chord_at(t: float) -> str:
    return LOOP[int(t // BAR) % 4]


# The 4-bar hook, as (beat offset in seconds from the loop start, length, note).
HOOK = [
    (0.00, .25, "A4"), (0.25, .25, "D5"), (0.50, .25, "E5"), (0.75, .25, "F#5"), (1.00, 1.00, "A5"),
    (2.00, .50, "G5"), (2.50, .50, "F#5"), (3.00, 1.00, "E5"),
    (4.00, .25, "F#4"), (4.25, .25, "B4"), (4.50, .25, "C#5"), (4.75, .25, "D5"), (5.00, 1.00, "F#5"),
    (6.00, .50, "E5"), (6.50, .50, "F#5"), (7.00, 1.00, "D5"),
]


def hook(t0: float, bars: tuple[int, int] = (0, 4), shift: int = 0) -> list[tuple[float, float, int]]:
    """The hook from loop bar bars[0] up to (not incl.) bars[1], starting at t0 (which is that bar's start)."""
    lo, hi = bars[0] * BAR, bars[1] * BAR
    return [(t0 + o - lo, d, p(n) + shift) for o, d, n in HOOK if lo <= o < hi]


def third_below(pitch: int, t: float) -> int:
    """The scale tone a third under `pitch`, nudged to a chord tone when the plain third clashes."""
    below = [x for x in SCALE if x < pitch]
    cand = below[-2] if len(below) >= 2 else pitch - 4
    tones = CHORD_TONES[chord_at(t)]
    if cand % 12 not in tones and (below[-1] % 12) in tones and pitch - below[-1] > 2:
        return below[-1]
    return cand


# ---------------------------------------------------------------- the arrangement

K, KS, S, SS, CH, PH, OH, CR, CR2, RIDE = 36, 35, 38, 37, 42, 44, 46, 49, 57, 51
TOM = [41, 43, 45, 47, 48, 50]  # low to high
SHAKER, TAMB = 82, 54


def build() -> dict[str, list[Part]]:
    rnd = random.Random(7)
    stems: dict[str, list[Part]] = {}

    def part(stem, name, program, bank=0, channel=0, pan=64):
        pt = Part(name, program, bank, channel, pan)
        stems.setdefault(stem, []).append(pt)
        return pt

    piano = part("piano", "Grand Piano", 0)
    glock = part("glock", "Glockenspiel", 9)
    pulse = part("pulse", "Kick (low-passed in the mix)", 16, channel=9)
    drums = part("drums", "Power kit", 16, channel=9)
    bass = part("bass", "Picked Bass", 34)
    sub = part("sub", "Sine Wave", 80, bank=8)
    mgtr = part("mgtr", "Muted Guitar", 28)
    gtr_l = part("gtr_l", "Distortion Guitar", 30)
    gtr_r = part("gtr_r", "Overdrive Guitar", 29)
    lead = part("lead", "Overdrive Guitar lead", 29, channel=0)
    harm = part("lead", "Overdrive Guitar harmony", 29, channel=1, pan=92)
    pad = part("strings", "Strings Slow Expr", 49, bank=17, channel=0)
    celli = part("strings", "Celli Slow", 49, bank=40, channel=1, pan=48)
    choir = part("choir", "Choir Aahs Expr", 52, bank=17, channel=0)
    choir_h = part("choir", "Choir Aahs harmony", 52, bank=17, channel=1, pan=84)
    horns = part("horns", "French Horns", 60)
    brass = part("brass", "Brass Section", 61)
    timp = part("timpani", "Timpani", 47)

    for pt in (pad, celli, choir, choir_h):  # the Expr presets follow CC2 (breath) for loudness
        pt.cc.append((0.0, 2, 0))

    def bars(t0: float, t1: float):
        b = t0
        while b < t1 - 1e-6:
            yield b, chord_at(b)
            b += BAR

    # ---------- piano: the hook from the first bar, comping that grows with the song
    for t0 in (0.0, 8.0):
        for t, d, n in hook(t0):
            piano.add(t, d, n, (58 if t0 == 0 else 50) + rnd.randint(-3, 3))
    for t, d, n in hook(16.0):  # verse 2: an octave lower, under the voice
        piano.add(t, d, n - 12, 46 + rnd.randint(-3, 3))
    for t, d, n in hook(24.0, (0, 2)):  # breakdown: the first half, soft and close
        piano.add(t, d, n, 50 + rnd.randint(-3, 3))
    for t, d, n in hook(28.0, (2, 4)):  # build: the answer, rising in loudness
        piano.add(t, d, n, 52 + int((t - 28) * 5))
    for b, ch in bars(0.0, 32.0):  # left hand: root and fifth, then a soft offbeat chord
        lh = [p(BASS[ch]), p(BASS[ch]) + (7 if ch != "A" else 8)]
        v = 40 if b < 8 else 46 if b < 24 else 42
        piano.add(b, 1.9, lh, v)
        if b >= 8:
            piano.add(b + 1.0, 0.9, TRIAD[ch].split(), v - 6)
    for b, ch in bars(32.0, 66.0):  # chorus: pounding eighths, a little lighter under the voice
        for k in range(8):
            piano.add(b + k * 0.25, 0.22, [p(BASS[ch]) + 12] + TRIAD[ch].split(), 66 if k % 2 == 0 else 56)
    for b, ch in bars(66.0, 72.0):
        piano.add(b, 1.9, [p(BASS[ch]), p(BASS[ch]) + 12] + TRIAD[ch].split(), 64)
    for b, ch in bars(72.0, 80.0):
        for k in range(8):
            piano.add(b + k * 0.25, 0.22, [p(BASS[ch]) + 12] + TRIAD[ch].split(), 74 if k % 2 == 0 else 62)
    piano.add(80.0, 4.0, ["D2", "D3", "A3", "D4", "F#4", "A4", "D5"], 82, True)

    # ---------- glockenspiel: the star notes, sparkling at the top and the end
    for t, d, n in hook(0.0):
        if d >= 1.0:
            glock.add(t, 0.5, n + 12, 52)
    for t, d, n in hook(72.0):
        if d >= 1.0:
            glock.add(t, 0.5, n + 12, 64)
    glock.add(80.0, 1.5, ["D6", "A6"], 66, True)

    # ---------- the soft pulse in the intro: a kick on 1 and 3 (low-passed in the mix) and a shaker
    for b, _ in bars(0.0, 8.0):
        for k in (0, 1):
            pulse.add(b + k * 1.0, 0.1, K, 70 + k * -6, True)
    for b, _ in bars(0.0, 24.0):
        for k in range(8):
            drums.add(b + k * 0.25, 0.05, SHAKER, (40 if k % 2 else 52) + (6 if b >= 8 else 0))

    # ---------- drums
    for b, _ in bars(8.0, 16.0):  # verse: kick 1 and 3, side stick 2 and 4, hats on quarters
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else SS, 72 if k % 2 == 0 else 64)
            drums.add(b + k * .5, .05, CH, 48)
    for b, _ in bars(16.0, 24.0):  # verse 2: hats in eighths, snare backbeat, toms under the pings
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else S, 80 if k % 2 == 0 else 70)
        for k in range(8):
            drums.add(b + k * .25, .05, CH, 58 if k % 2 == 0 else 44)
    for i, t in enumerate((18.0, 19.0, 20.0, 21.0, 22.0)):  # one tom per engine, climbing
        drums.add(t, .1, TOM[i], 76 + i * 5, True)
    drums.add(23.5, .05, TOM[0], 60)  # a soft roll off into the breakdown
    drums.add(23.75, .05, TOM[0], 52)
    # 24-28 breakdown: no drums
    for k in range(8):  # 28-32 build: kick on quarters
        drums.add(28.0 + k * .5, .05, K, 70 + k * 3, True)
    for k in range(4):
        drums.add(30.0 + k * .25, .05, S, 52 + k * 4)
    for k in range(8):
        drums.add(31.0 + k * .125, .05, S, 66 + k * 5)

    def rock(t0: float, t1: float, vel: int, crash_on: set[float], ride: bool = False) -> None:
        for b, _ in bars(t0, t1):
            for k in range(4):
                bt = b + k * .5
                drums.add(bt, .05, K if k % 2 == 0 else S, vel if k % 2 == 0 else vel - 2, True)
                if k == 2:
                    drums.add(bt - .25, .05, K, vel - 18)
            for k in range(8):
                drums.add(b + k * .25, .05, RIDE if ride else CH, (vel - 26) if k % 2 else (vel - 16))
            if b in crash_on:
                drums.add(b, .1, CR, vel + 4, True)
                drums.add(b, .1, K, vel + 4, True)

    def fill(t0: float, t1: float, v0: int) -> None:
        n = int(round((t1 - t0) / .125))
        for k in range(n):
            drums.add(t0 + k * .125, .05, TOM[max(0, 5 - (k * 6) // n)], v0 + k * 2, True)

    rock(32.0, 66.0, 96, {32.0, 42.0, 50.0, 56.0})
    for t in (41.5, 49.5, 55.5):
        fill(t, t + .5, 86)
    fill(66.0, 68.0, 80)  # under the whip
    for k in range(4):  # 68-72 lift: half-time, building into the final chorus
        b = 68.0 + k * 1.0
        drums.add(b, .05, K, 84, True)
        drums.add(b + .5, .05, S, 80, True)
        drums.add(b, .05, CH, 60)
        drums.add(b + .5, .05, CH, 52)
    drums.add(68.0, .1, CR2, 92, True)
    for k in range(8):
        drums.add(71.0 + k * .125, .05, S, 72 + k * 4, True)
    rock(72.0, 80.0, 104, {72.0, 76.0}, ride=True)
    drums.add(78.0, .1, CR2, 96, True)
    fill(79.5, 80.0, 92)
    drums.add(80.0, .1, CR, 110, True)
    drums.add(80.0, .1, CR2, 104, True)
    drums.add(80.0, .1, K, 112, True)

    # ---------- bass: enters in the verse, drives the chorus
    for b, ch in bars(8.0, 16.0):
        bass.add(b, .95, BASS[ch], 74)
        bass.add(b + 1.0, .95, BASS[ch], 68)
    for b, ch in bars(16.0, 24.0):
        for k in range(4):
            bass.add(b + k * .5, .45, BASS[ch], 78 if k % 2 == 0 else 70)
    for b, ch in bars(24.0, 28.0):
        bass.add(b, 1.95, BASS[ch], 66)
    for b, ch in bars(28.0, 32.0):
        for k in range(8):
            bass.add(b + k * .25, .22, BASS[ch], 70 + int((b + k * .25 - 28) * 4))
    for b, ch in bars(32.0, 66.0):
        for k in range(8):
            bass.add(b + k * .25, .22, BASS[ch], 92 if k % 2 == 0 else 82)
    for b, ch in bars(66.0, 72.0):
        bass.add(b, 1.95, BASS[ch], 86)
    for b, ch in bars(72.0, 80.0):
        for k in range(8):
            bass.add(b + k * .25, .22, BASS[ch], 98 if k % 2 == 0 else 88)
    bass.add(80.0, 4.0, "D1", 100, True)
    for b, ch in bars(32.0, 80.0):  # sub weight under the chorus
        sub.add(b, 1.95, p(BASS[ch]) - 12, 72)
    sub.add(80.0, 4.0, "D1", 76, True)

    # ---------- muted guitar: eighths in the verses
    for b, ch in bars(8.0, 24.0):
        root = p(BASS[ch]) + 12
        for k in range(8):
            mgtr.add(b + k * .25, .2, [root, root + (7 if ch != "A" else 8)], (62 if k % 2 == 0 else 52) + (8 if b >= 16 else 0))

    # ---------- power chords: chorus, lift (long), final
    for b, ch in bars(32.0, 66.0):
        for k in range(8):
            for g in (gtr_l, gtr_r):
                g.add(b + k * .25, .22, POWER[ch].split(), 92 if k % 2 == 0 else 80)
    for b, ch in bars(66.0, 72.0):
        for g in (gtr_l, gtr_r):
            g.add(b, 1.95, POWER[ch].split(), 86)
    for b, ch in bars(72.0, 80.0):
        for k in range(8):
            for g in (gtr_l, gtr_r):
                g.add(b + k * .25, .22, POWER[ch].split(), 100 if k % 2 == 0 else 88)
    for g in (gtr_l, gtr_r):
        g.add(80.0, 4.0, POWER["D"].split(), 100, True)

    # ---------- lead guitar: the hook every 4 bars in the chorus, with harmony at the end
    for t0 in (32.0, 40.0, 48.0, 56.0):
        for t, d, n in hook(t0):
            lead.add(t, d, n, 92, True)
            if d >= 1.0:
                lead.vibrato(t, t + d)
    for t, d, n in hook(64.0, (0, 2)):  # answers the voice across the whip, 64.7-67.6
        lead.add(t, d, n, 90, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
    for t, d, n in hook(72.0):
        lead.add(t, d, n, 100, True)
        harm.add(t, d, third_below(n, t), 92, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
            harm.vibrato(t, t + d, depth=380, rate=5.1)
    for t, d, n in hook(76.0, (2, 4)):  # outro tag: the answer once more, landing on D at 80
        lead.add(t + 0.0, d, n, 96, True)
        harm.add(t, d, third_below(n, t), 88, True)
    lead.add(80.0, 4.0, "D5", 96, True)
    harm.add(80.0, 4.0, "A4", 88, True)
    lead.vibrato(80.0, 84.0)
    harm.vibrato(80.0, 84.0, depth=380, rate=5.1)
    lead.bends.append((84.0, 0))

    # ---------- strings: a pad from verse 2, the bed of the breakdown and build
    for b, ch in bars(16.0, 84.0):
        d = 4.0 if b >= 80 else 1.95
        pad.add(b, d, PAD[ch].split(), 80)
        celli.add(b, d, p(BASS[ch]), 76)
        if b >= 80:
            break
    pad.swell(15.0, 18.0, 0, 62)
    celli.swell(15.0, 18.0, 0, 58)
    pad.swell(23.5, 25.0, 62, 78)  # the breakdown leans on the strings
    pad.swell(28.0, 32.0, 78, 104)
    celli.swell(28.0, 32.0, 58, 96)
    pad.swell(32.0, 33.0, 104, 88)
    pad.swell(66.0, 72.0, 88, 112)
    celli.swell(66.0, 72.0, 96, 112)
    pad.swell(80.0, 84.0, 112, 70)
    celli.swell(80.0, 84.0, 112, 70)

    # ---------- choir: pads in the chorus, harmony on the hook 56-66, lift and final
    for b, ch in bars(32.0, 80.0):
        choir.add(b, 1.95, CHOIR[ch].split(), 86)
    choir.add(80.0, 4.0, "F#4 A4 D5 F#5".split(), 96, True)
    choir.swell(31.0, 33.0, 0, 60)
    choir.swell(55.0, 57.0, 60, 84)
    choir.swell(66.0, 72.0, 84, 112)
    choir.swell(72.0, 80.0, 112, 116)
    choir.swell(80.0, 84.0, 116, 70)
    for t, d, n in hook(56.0) + hook(64.0, (0, 1)):
        choir_h.add(t, d, third_below(n, t), 90, True)
    for t, d, n in hook(68.0, (2, 4)) + hook(72.0):  # the lift sings the answer, the final chorus sings it all
        choir_h.add(t, d, n, 100, True)
    choir_h.swell(55.0, 57.0, 0, 82)
    choir_h.swell(66.0, 72.0, 82, 108)
    choir_h.swell(72.0, 80.0, 108, 112)
    choir_h.swell(80.0, 84.0, 112, 0)

    # ---------- horns: the counter-line 42-50, and a swell into the final chorus
    # a falling line under the voice, one bar per chord: E, D, B, then A climbing back
    for t, d, n in [(42.0, 1.5, "E4"), (43.5, 0.5, "F#4"), (44.0, 1.5, "D4"), (45.5, 0.5, "C#4"),
                    (46.0, 2.0, "B3"), (48.0, 1.5, "A3"), (49.5, 0.25, "B3"), (49.75, 0.25, "C#4")]:
        horns.add(t, d, n, 84)
    for b, ch in bars(68.0, 72.0):
        horns.add(b, 1.95, [p(x) for x in CHOIR[ch].split()[:2]], 80)
    for b, ch in bars(72.0, 80.0):
        brass.add(b, 0.4, POWER[ch].split()[1:] + [TRIAD[ch].split()[1]], 96, True)
        brass.add(b + 1.5, 0.4, POWER[ch].split()[1:] + [TRIAD[ch].split()[1]], 88, True)
    brass.add(80.0, 3.5, ["D4", "F#4", "A4", "D5"], 100, True)

    # ---------- timpani: a roll in the build, hits on the big arrivals
    for k in range(32):
        timp.add(30.0 + k * .0625, .07, "A2", 40 + k * 2)
    for t, n in ((32.0, "D3"), (72.0, "D3"), (80.0, "D3")):
        timp.add(t, 1.5, n, 110, True)
    for k in range(16):
        timp.add(71.0 + k * .0625, .07, "A2", 50 + k * 3)

    return stems


# ---------------------------------------------------------------- MIDI out and render

def humanize(parts: list[Part], seed: int) -> None:
    rnd = random.Random(seed)
    for pt in parts:
        for n in pt.notes:
            if not n.accent:
                n.t = max(0.0, n.t + rnd.uniform(-0.007, 0.007))
                n.vel = max(1, min(127, n.vel + rnd.randint(-5, 5)))


def write_midi(parts: list[Part], path: Path) -> None:
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
            if n.t >= END or n.vel <= 0:
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
    for old in (BUILD / "stems").glob("*.wav"):
        old.unlink()
    stems = build()
    for i, (stem, parts) in enumerate(stems.items()):
        humanize(parts, seed=100 + i)
        mid = BUILD / "midi" / f"{stem}.mid"
        write_midi(parts, mid)
        render(mid, BUILD / "stems" / f"{stem}.wav")
        print(f"{stem:8s} {sum(len(pt.notes) for pt in parts):5d} notes")
    one = Part("crash", 16, channel=9)  # one crash hit, reversed in the mix for the swells
    one.add(0.0, 0.1, CR, 120, True)
    one.add(0.0, 0.1, CR2, 110, True)
    write_midi([one], BUILD / "midi" / "crash_one.mid")
    render(BUILD / "midi" / "crash_one.mid", BUILD / "stems" / "crash_one.wav")


if __name__ == "__main__":
    main()
