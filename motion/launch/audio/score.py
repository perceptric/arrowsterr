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
S16 = 0.125  # a sixteenth note at 120 BPM
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
    ost = part("ostinato", "Strings Fast", 48, channel=0, pan=84)
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

    def sixteenths(b: float):
        return [b + k * S16 for k in range(16)]

    # ---------- piano: the hook from the first bar; comping that grows with the song
    for t0 in (0.0, 8.0):
        for t, d, n in hook(t0):
            piano.add(t, d, n, (58 if t0 == 0 else 52) + rnd.randint(-3, 3))
    for t, d, n in hook(16.0):  # verse 2: an octave lower, under the voice
        piano.add(t, d, n - 12, 48 + rnd.randint(-3, 3))
    for t, d, n in hook(24.0, (0, 2)):  # breakdown: the first half, close and clear
        piano.add(t, d, n, 54 + rnd.randint(-3, 3))
    for t, d, n in hook(28.0, (2, 4)):  # build: the answer, louder each note
        piano.add(t, d, n, 56 + int((t - 28) * 5))
    for b, ch in bars(0.0, 32.0):  # left hand: root and fifth, then an offbeat chord from the verse
        lh = [p(BASS[ch]), p(BASS[ch]) + (7 if ch != "A" else 8)]
        v = 40 if b < 8 else 46 if b < 24 else 44
        piano.add(b, 1.9, lh, v)
        if b >= 8:
            piano.add(b + 1.0, 0.9, TRIAD[ch].split(), v - 6)
    for b, ch in bars(32.0, 84.0):  # chorus on: pounding eighths that get harder every 8 s
        lift = int((b - 32) / 8) * 3
        for k in range(8):
            piano.add(b + k * 0.25, 0.22, [p(BASS[ch]) + 12] + TRIAD[ch].split(), (64 if k % 2 == 0 else 54) + lift)

    # ---------- glockenspiel: the star notes at the top and in the final chorus (an octave up)
    for t, d, n in hook(0.0):
        if d >= 1.0:
            glock.add(t, 0.5, n + 12, 52)
    for t, d, n in hook(72.0):
        if d >= 1.0:
            glock.add(t, 0.5, n + 24, 70)
    glock.add(80.0, 1.5, ["D7", "A7"], 70, True)

    # ---------- the soft intro pulse: kick on 1 and 3 (low-passed in the mix) and a shaker
    for b, _ in bars(0.0, 8.0):
        for k in (0, 1):
            pulse.add(b + k * 1.0, 0.1, K, 72 - k * 6, True)
    for b, _ in bars(0.0, 16.0):
        for k in range(8):
            drums.add(b + k * 0.25, 0.05, SHAKER, (40 if k % 2 else 52) + (6 if b >= 8 else 0))

    # ---------- the 16th pulse: muted guitar from 8 s to the very end, never stopping
    for b, ch in bars(8.0, 84.0):
        root = p(BASS[ch if b < 80 else "D"]) + 12
        fifth = root + (7 if ch != "A" or b >= 80 else 8)
        base = 50 + min(28, int((b - 8) / 8) * 4)
        for k, t in enumerate(sixteenths(b)):
            note = [root, fifth] if k % 4 != 2 else [root + 12]
            mgtr.add(t, 0.11, note, base + (10 if k % 4 == 0 else 0))

    # ---------- drums
    for b, _ in bars(8.0, 16.0):  # verse: kick 1 and 3, side stick 2 and 4, hats on quarters
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else SS, 74 if k % 2 == 0 else 64)
            drums.add(b + k * .5, .05, CH, 50)
    for b, _ in bars(16.0, 24.0):  # verse 2: 16th hats, snare backbeat
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else S, 82 if k % 2 == 0 else 72)
        for k, t in enumerate(sixteenths(b)):
            drums.add(t, .04, CH, 60 if k % 4 == 0 else 48 if k % 2 == 0 else 38)
    for i, t in enumerate((18.0, 19.0, 20.0, 21.0, 22.0)):  # one tom per engine, climbing
        drums.add(t, .1, TOM[i], 80 + i * 5, True)
    for k, t in enumerate(sixteenths(24.0) + sixteenths(26.0)):  # breakdown: no kit, the shaker keeps time
        drums.add(t, .04, SHAKER, 34 + k)
    for k in range(8):  # 28-32 build: kick on quarters, 16th hats, snare roll
        drums.add(28.0 + k * .5, .05, K, 78 + k * 3, True)
    for k, t in enumerate(sixteenths(28.0) + sixteenths(30.0)):
        drums.add(t, .04, CH, 46 + k // 2)
    for k in range(4):
        drums.add(30.0 + k * .25, .05, S, 58 + k * 4)
    for k in range(8):
        drums.add(31.0 + k * .125, .05, S, 72 + k * 5)

    def floor(t0: float, t1: float, vel: int, ghosts: bool = True) -> None:
        """Double time: four on the floor, snare on 2 and 4 with ghosts, 16th hats, open hats on the off-beats."""
        for b, _ in bars(t0, t1):
            for k in range(4):
                drums.add(b + k * .5, .05, K, vel + 4, True)
                if k % 2:
                    drums.add(b + k * .5, .05, S, vel, True)
                drums.add(b + k * .5 + .25, .12, OH, vel - 24)
            if ghosts:
                for g in (.875, 1.625, 1.875):
                    drums.add(b + g, .04, S, vel - 52)
            for k, t in enumerate(sixteenths(b)):
                if k % 2 == 0:
                    drums.add(t, .04, CH, vel - (18 if k % 4 == 0 else 30))
                else:
                    drums.add(t, .04, CH, vel - 42)

    def fill(t0: float, t1: float, v0: int) -> None:
        n = int(round((t1 - t0) / S16))
        for k in range(n):
            drums.add(t0 + k * S16, .05, TOM[max(0, 5 - (k * 6) // n)], v0 + k * 2, True)

    for blk, (a, b) in enumerate(((32.0, 40.0), (40.0, 48.0), (48.0, 56.0), (56.0, 66.0))):
        floor(a, b, 92 + blk * 4)
        drums.add(a, .1, CR, 104 + blk * 4, True)
        if blk:
            drums.add(a, .1, CR2, 96 + blk * 4, True)
    for t in (41.5, 49.5, 55.5):
        fill(t, t + .5, 88)
    for b in (57.5, 59.5, 61.5, 63.5):  # 56 on: a tom fill closing every bar
        fill(b, b + .5, 92)
    floor(66.0, 68.0, 106, ghosts=False)  # under the whip: the floor keeps going, a snare roll swells
    for k in range(16):
        drums.add(66.0 + k * S16, .04, S, 54 + k * 3)
    drums.add(64.0, .1, CR, 112, True)
    # 68-72 pre-chorus build: kick on quarters, snare 8ths -> 16ths -> 32nds, kick out for the last beat
    for k in range(7):
        drums.add(68.0 + k * .5, .05, K, 100 + k * 2, True)
    for k, t in enumerate(sixteenths(68.0) + sixteenths(70.0)):
        drums.add(t, .04, CH, 60 + k // 2)
    for k in range(4):
        drums.add(68.0 + k * .5, .05, S, 76 + k * 2, True)
    for k in range(8):
        drums.add(70.0 + k * .125, .05, S, 84 + k * 2, True)
    for k in range(16):
        drums.add(71.0 + k * .0625, .04, S, 96 + k * 2, True)
    drums.add(68.0, .1, CR2, 104, True)
    floor(72.0, 84.0, 110)  # final chorus and outro: everything, and it never lets up
    drums.add(72.0, .1, CR, 127, True)
    drums.add(72.0, .1, CR2, 124, True)
    drums.add(72.0, .1, 52, 118, True)  # china
    drums.add(80.0, .1, CR, 124, True)
    drums.add(80.0, .1, CR2, 120, True)
    for t in (73.5, 75.5, 77.5):
        fill(t, t + .5, 100)
    fill(79.5, 80.0, 104)

    # ---------- bass: verse roots, then driving 8ths in octaves from 28
    for b, ch in bars(8.0, 16.0):
        bass.add(b, .95, BASS[ch], 74)
        bass.add(b + 1.0, .95, BASS[ch], 68)
    for b, ch in bars(16.0, 24.0):
        for k in range(4):
            bass.add(b + k * .5, .45, BASS[ch], 80 if k % 2 == 0 else 72)
    for b, ch in bars(24.0, 28.0):
        for k in range(4):
            bass.add(b + k * .5, .45, BASS[ch], 70)
    for b, ch in bars(28.0, 84.0):
        c = ch if b < 80 else "D"
        lift = min(26, int((b - 28) / 8) * 4)
        for k in range(8):
            bass.add(b + k * .25, .22, p(BASS[c]) + (12 if k % 2 else 0), (84 if k % 2 == 0 else 76) + lift)
    for b, ch in bars(32.0, 84.0):  # sub weight under the chorus
        sub.add(b, 1.95, p(BASS[ch if b < 80 else "D"]) - 12, 72)

    # ---------- power chords: eighths from 32, sixteenths from 56
    for b, ch in bars(32.0, 84.0):
        c = ch if b < 80 else "D"
        step = .25 if b < 56 else S16
        n = int(BAR / step)
        lift = min(20, int((b - 32) / 8) * 4)
        for k in range(n):
            for g in (gtr_l, gtr_r):
                g.add(b + k * step, step - .02, POWER[c].split(), (86 if k % 2 == 0 else 76) + lift)

    # ---------- lead guitar: the hook every 8 s from 32, harmony from 56, an octave up at 72
    for t0 in (32.0, 40.0, 48.0, 56.0):
        for t, d, n in hook(t0):
            lead.add(t, d, n, 92, True)
            if t0 >= 56:
                harm.add(t, d, third_below(n, t), 86, True)
            if d >= 1.0:
                lead.vibrato(t, t + d)
                if t0 >= 56:
                    harm.vibrato(t, t + d, depth=380, rate=5.1)
    for t, d, n in hook(64.0, (0, 2)):  # answers the voice across the whip, 64.7-67.6
        lead.add(t, d, n, 94, True)
        harm.add(t, d, third_below(n, t), 88, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
    for t, d, n in hook(72.0):  # the final chorus: the hook an octave up, harmony a third under it
        lead.add(t, d, n + 12, 104, True)
        harm.add(t, d, third_below(n + 12, t), 96, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
            harm.vibrato(t, t + d, depth=380, rate=5.1)
    for t, d, n in hook(76.0, (2, 4)):  # the tag: the answer once more, landing on D at 80
        lead.add(t, d, n + 12, 102, True)
        harm.add(t, d, third_below(n + 12, t), 94, True)
    lead.add(80.0, 4.0, "D6", 104, True)
    harm.add(80.0, 4.0, "A5", 96, True)
    lead.vibrato(80.0, 84.0)
    harm.vibrato(80.0, 84.0, depth=380, rate=5.1)

    # ---------- strings: pad from verse 2; a 16th ostinato from 40
    for b, ch in bars(16.0, 84.0):
        c = ch if b < 80 else "D"
        pad.add(b, 1.95, PAD[c].split(), 80)
        celli.add(b, 1.95, p(BASS[c]), 76)
    pad.swell(15.0, 18.0, 0, 62)
    celli.swell(15.0, 18.0, 0, 58)
    pad.swell(23.5, 25.0, 62, 80)  # the breakdown leans on the strings
    pad.swell(28.0, 32.0, 80, 100)
    celli.swell(28.0, 32.0, 58, 96)
    pad.swell(32.0, 80.0, 100, 120, steps=96)
    celli.swell(32.0, 80.0, 96, 120, steps=96)
    for b, ch in bars(40.0, 84.0):
        c = ch if b < 80 else "D"
        tones = [p(x) for x in TRIAD[c].split()]
        arp = [tones[0], tones[1], tones[2], tones[0] + 12]
        lift = min(24, int((b - 40) / 8) * 6)
        for k, t in enumerate(sixteenths(b)):
            ost.add(t, .11, arp[k % 4] + (12 if b >= 72 else 0), (70 if k % 4 == 0 else 58) + lift)

    # ---------- choir: pad from 48, harmony on the hook 56-66, the answer at 68, the hook at 72
    for b, ch in bars(48.0, 84.0):
        choir.add(b, 1.95, CHOIR[ch if b < 80 else "D"].split(), 88)
    choir.swell(47.0, 49.0, 0, 70)
    choir.swell(49.0, 80.0, 70, 118, steps=80)
    for t, d, n in hook(56.0) + hook(64.0, (0, 2)):
        choir_h.add(t, d, third_below(n, t), 90, True)
    for t, d, n in hook(68.0, (2, 4)) + hook(72.0) + hook(76.0, (2, 4)):
        choir_h.add(t, d, n, 100, True)
    choir_h.add(80.0, 4.0, ["D5", "F#5"], 104, True)
    choir_h.swell(55.0, 57.0, 0, 84)
    choir_h.swell(57.0, 80.0, 84, 118, steps=60)

    # ---------- horns: the counter-line 42-50, then a line under the build
    for t, d, n in [(42.0, 1.5, "E4"), (43.5, 0.5, "F#4"), (44.0, 1.5, "D4"), (45.5, 0.5, "C#4"),
                    (46.0, 2.0, "B3"), (48.0, 1.5, "A3"), (49.5, 0.25, "B3"), (49.75, 0.25, "C#4")]:
        horns.add(t, d, n, 86)
    for b, ch in bars(68.0, 84.0):
        horns.add(b, 1.95, [p(x) for x in CHOIR[ch if b < 80 else "D"].split()[:2]], 84 + min(16, int((b - 68) / 4) * 4))

    # ---------- brass: stabs on the off-beats from 48
    for b, ch in bars(48.0, 80.0):
        lift = min(18, int((b - 48) / 8) * 6)
        for off in (.75, 1.75) if b < 72 else (.25, .75, 1.25, 1.75):
            brass.add(b + off, .14, POWER[ch].split()[1:] + [TRIAD[ch].split()[1]], 86 + lift, True)
    brass.add(80.0, 3.8, ["D4", "F#4", "A4", "D5"], 108, True)

    # ---------- timpani: rolls into 32 and 72, hits on the big arrivals
    for k in range(32):
        timp.add(30.0 + k * .0625, .07, "A2", 40 + k * 2)
    for k in range(32):
        timp.add(70.0 + k * .0625, .07, "A2", 50 + k * 2)
    for t in (32.0, 48.0, 64.0, 72.0, 80.0):
        timp.add(t, 1.5, "D3", 100 + (10 if t >= 72 else 0), True)

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
