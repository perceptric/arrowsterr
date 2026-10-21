"""Score: "Navigator", one song for the whole Arrowsterr launch film, rendered to one stem per instrument.

One key (D major), one tempo (120 BPM, a bar is 2.0 s), one 4-bar loop from the first bar to the last:
    D | A/C# | Bm | G          (the bass walks down D, C#, B, then G)
One hook rides the loop. It climbs like the arrow, holds on a "star" note, and answers itself:
    D     A4 D5 E5 F#5 (eighths), A5 held
    A/C#  G5 F#5, E5 held
    Bm    F#4 B4 C#5 D5 (eighths), F#5 held
    G     E5 F#5, D5 held
The song never stops, never changes key, and from the drop it only climbs:
    0-8 intro (piano, glockenspiel, soft pulse), 8-14 verse (bass, light drums, the 16th pulse),
    14-18 verse 2 (16th hats, tension), 18-20 dip (no kit, pulse and riser), 20-24 build,
    24 drop into a double-time chorus (24-32 under the logo) that adds a layer every 8 s (40 strings,
    48 choir and brass, 56 lead harmony and toms), 63.4 whip, 66-70 pre-chorus build, 70 final chorus
    with the hook an octave up, 84 the tonic, ringing out to 86. From 64 the loop turns to A, G, D so
    70 and 84 land on D.

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
import numpy as np

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SF = "/usr/share/sounds/sf3/MuseScore_General_Full.sf3"
TPB = 480
TICKS_PER_SEC = TPB * 2  # 120 BPM: 2 beats a second
END = 86.0
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


# Section starts (s). The loop runs bar after bar; G is held one extra bar before the final chorus
# (64-66) and again before the tonic (74-76), so both land on D.
VERSE, V2, DIP, BUILDUP, DROP = 8.0, 14.0, 18.0, 20.0, 24.0
L1, L2, L3 = 40.0, 48.0, 56.0  # a new layer enters at each
WHIP_HIT, WHIP, PRE_GRID, FINAL, TONIC = 63.4, 64.0, 66.0, 70.0, 84.0
# From 64 s the loop turns to A, G, D (V, IV, I) so the final chorus (70) and the tonic (84) land on D.
HELD = {32: "D", 33: "A", 34: "G", 35: "D", 36: "A", 37: "Bm", 38: "G", 39: "D", 40: "A", 41: "G", 42: "D"}


def chord_at(t: float) -> str:
    i = int(t // BAR)
    return HELD.get(i, LOOP[i % 4]) if i < 32 or i in HELD else "D"


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

    def block(t: float) -> int:
        """Which 8 s chorus block t is in, from the drop: 0, 1, 2, 3 (4 from the whip on)."""
        return max(0, min(4, int((t - DROP) // 8)))

    # ---------- piano: the hook from the first bar; comping that grows with the song
    for t, d, n in hook(0.0):
        piano.add(t, d, n, 58 + rnd.randint(-3, 3))
    for t, d, n in hook(8.0):
        piano.add(t, d, n if t < V2 else n - 12, (52 if t < V2 else 48) + rnd.randint(-3, 3))
    for t, d, n in hook(16.0):  # under the tension line, through the dip, the answer rising into the drop
        piano.add(t, d, n - 12 if t < DIP else n, (48 if t < DIP else 54 + int(max(0, t - BUILDUP) * 5)) + rnd.randint(-2, 2))
    for b, ch in bars(0.0, DROP):  # left hand: root and fifth, then an offbeat chord from the verse
        lh = [p(BASS[ch]), p(BASS[ch]) + (7 if ch != "A" else 8)]
        v = 40 if b < VERSE else 46
        piano.add(b, 1.9, lh, v)
        if b >= VERSE:
            piano.add(b + 1.0, 0.9, TRIAD[ch].split(), v - 6)
    for b, ch in bars(DROP, END):  # chorus on: pounding eighths that get harder every 8 s
        for k in range(8):
            piano.add(b + k * 0.25, 0.22, [p(BASS[ch]) + 12] + TRIAD[ch].split(), (64 if k % 2 == 0 else 54) + block(b) * 3)

    # ---------- glockenspiel: the star notes at the top and in the final chorus (two octaves up)
    for t, d, n in hook(0.0):
        if d >= 1.0:
            glock.add(t, 0.5, n + 12, 52)
    for t, d, n in hook(FINAL):
        if d >= 1.0:
            glock.add(t, 0.5, n + 24, 70)
    glock.add(TONIC, 1.5, ["D7", "A7"], 70, True)

    # ---------- the soft intro pulse: kick on 1 and 3 (low-passed in the mix) and a shaker
    for b, _ in bars(0.0, VERSE):
        for k in (0, 1):
            pulse.add(b + k * 1.0, 0.1, K, 72 - k * 6, True)
    for b, _ in bars(0.0, V2):
        for k in range(8):
            drums.add(b + k * 0.25, 0.05, SHAKER, (40 if k % 2 else 52) + (6 if b >= VERSE else 0))

    # ---------- the 16th pulse: muted guitar from the verse to the very end, never stopping
    for b, ch in bars(VERSE, END):
        root = p(BASS[ch]) + 12
        fifth = root + (7 if ch != "A" else 8)
        base = 50 + min(28, int((b - VERSE) / 6) * 4)
        for k, t in enumerate(sixteenths(b)):
            mgtr.add(t, 0.11, [root, fifth] if k % 4 != 2 else [root + 12], base + (10 if k % 4 == 0 else 0))

    # ---------- drums
    for b, _ in bars(VERSE, V2):  # verse: kick 1 and 3, side stick 2 and 4, hats on quarters
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else SS, 74 if k % 2 == 0 else 64)
            drums.add(b + k * .5, .05, CH, 50)
    for b, _ in bars(V2, DIP):  # verse 2, the tension: 16th hats, snare backbeat, a tom on each bar
        for k in range(4):
            drums.add(b + k * .5, .05, K if k % 2 == 0 else S, 84 if k % 2 == 0 else 74)
        for k, t in enumerate(sixteenths(b)):
            drums.add(t, .04, CH, 62 if k % 4 == 0 else 50 if k % 2 == 0 else 40)
        drums.add(b, .1, TOM[0], 80, True)
    for k, t in enumerate(sixteenths(DIP)):  # the dip: no kit, the shaker keeps time
        drums.add(t, .04, SHAKER, 40 + k)
    for k in range(8):  # build: kick on quarters, 16th hats, snare roll
        drums.add(BUILDUP + k * .5, .05, K, 80 + k * 3, True)
    for k, t in enumerate(sixteenths(BUILDUP) + sixteenths(BUILDUP + 2)):
        drums.add(t, .04, CH, 48 + k // 2)
    for k in range(4):
        drums.add(DROP - 2 + k * .25, .05, S, 60 + k * 4)
    for k in range(8):
        drums.add(DROP - 1 + k * .125, .05, S, 74 + k * 5)

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
                drums.add(t, .04, CH, vel - (18 if k % 4 == 0 else 30 if k % 2 == 0 else 42))

    def fill(t0: float, t1: float, v0: int) -> None:
        n = int(round((t1 - t0) / S16))
        for k in range(n):
            drums.add(t0 + k * S16, .05, TOM[max(0, 5 - (k * 6) // n)], v0 + k * 2, True)

    for blk, (a, b) in enumerate(((DROP, DROP + 8), (DROP + 8, L1), (L1, L2), (L2, L3), (L3, PRE_GRID))):
        floor(a, b, 90 + blk * 4)
    for k, t in enumerate((DROP, DROP + 8, L1, L2, L3, WHIP)):  # a crash on every 8 s from the drop
        drums.add(t, .1, CR, 104 + min(k, 4) * 4, True)
        if k:
            drums.add(t, .1, CR2, 96 + min(k, 4) * 4, True)
    for t in (DROP + 8 - .5, L1 - .5, L2 - .5):
        fill(t, t + .5, 88)
    for b in np.arange(L3 + 1.5, WHIP_HIT, 2.0):  # from 56: a tom fill closing every bar
        fill(float(b), float(b) + .5, 92)
    fill(WHIP_HIT - .4, WHIP, 96)  # the whip
    # pre-chorus build: kick on quarters, snare 8ths -> 16ths -> 32nds, kick out for the last beat
    for k in range(9):
        drums.add(PRE_GRID + k * .5, .05, K, 100 + k * 2, True)
    for k, t in enumerate(sixteenths(PRE_GRID) + sixteenths(PRE_GRID + 2)):
        drums.add(t, .04, CH, 60 + k // 2)
    for k in range(4):
        drums.add(PRE_GRID + k * .5, .05, S, 76 + k * 2, True)
    for k in range(8):
        drums.add(PRE_GRID + 2 + k * .125, .05, S, 84 + k * 2, True)
    for k in range(16):
        drums.add(FINAL - 1 + k * .0625, .04, S, 96 + k * 2, True)
    drums.add(PRE_GRID, .1, CR2, 104, True)
    floor(FINAL, END, 110)  # final chorus and outro: everything, and it never lets up
    drums.add(FINAL, .1, CR, 127, True)
    drums.add(FINAL, .1, CR2, 124, True)
    drums.add(FINAL, .1, 52, 118, True)  # china
    drums.add(FINAL + 8, .1, CR, 118, True)
    drums.add(TONIC, .1, CR, 124, True)
    drums.add(TONIC, .1, CR2, 120, True)
    for t in (FINAL + 1.5, FINAL + 3.5, FINAL + 5.5):
        fill(t, t + .5, 100)
    fill(TONIC - .5, TONIC, 104)

    # ---------- bass: verse roots, then driving 8ths in octaves from the build
    for b, ch in bars(VERSE, V2):
        bass.add(b, .95, BASS[ch], 74)
        bass.add(b + 1.0, .95, BASS[ch], 68)
    for b, ch in bars(V2, BUILDUP):
        for k in range(4):
            bass.add(b + k * .5, .45, BASS[ch], (80 if k % 2 == 0 else 72) - (8 if b >= DIP else 0))
    for b, ch in bars(BUILDUP, END):
        lift = min(26, int((b - BUILDUP) / 8) * 5)
        for k in range(8):
            bass.add(b + k * .25, .22, p(BASS[ch]) + (12 if k % 2 else 0), (84 if k % 2 == 0 else 76) + lift)
    for b, ch in bars(DROP, END):  # sub weight under the chorus
        sub.add(b, 1.95, p(BASS[ch]) - 12, 72)

    # ---------- power chords: eighths from the drop, sixteenths from 48
    for b, ch in bars(DROP, END):
        step = .25 if b < L3 else S16
        lift = min(20, block(b) * 4 + (4 if b >= FINAL else 0))
        for k in range(int(BAR / step)):
            for g in (gtr_l, gtr_r):
                g.add(b + k * step, step - .02, POWER[ch].split(), (86 if k % 2 == 0 else 76) + lift)

    # ---------- lead guitar: the hook every 8 s from the drop, harmony from 48, an octave up at 66
    for t0 in (DROP, DROP + 8, L1, L2, L3, WHIP):
        for t, d, n in hook(t0):
            if t >= PRE_GRID or (t0 == WHIP and t >= WHIP + BAR):
                break
            lead.add(t, d, n, 92, True)
            if t0 >= L3:
                harm.add(t, d, third_below(n, t), 86, True)
            if d >= 1.0:
                lead.vibrato(t, t + d)
                if t0 >= L3:
                    harm.vibrato(t, t + d, depth=380, rate=5.1)
    for t, d, n in hook(FINAL):  # the final chorus: the hook an octave up, harmony a third under it
        lead.add(t, d, n + 12, 104, True)
        harm.add(t, d, third_below(n + 12, t), 96, True)
        if d >= 1.0:
            lead.vibrato(t, t + d)
            harm.vibrato(t, t + d, depth=380, rate=5.1)
    tag = hook(FINAL + 8, (0, 2)) + hook(FINAL + 12, (3, 4))  # D, A, then G: the tag into the tonic
    for t, d, n in tag:
        lead.add(t, d, n + 12, 102, True)
        harm.add(t, d, third_below(n + 12, t), 94, True)
    lead.add(TONIC, END - TONIC, "D6", 104, True)
    harm.add(TONIC, END - TONIC, "A5", 96, True)
    lead.vibrato(TONIC, END)
    harm.vibrato(TONIC, END, depth=380, rate=5.1)

    # ---------- strings: pad from verse 2; a 16th ostinato from 32
    for b, ch in bars(V2, END):
        pad.add(b, 1.95, PAD[ch].split(), 80)
        celli.add(b, 1.95, p(BASS[ch]), 76)
    pad.swell(V2 - 1, V2 + 1, 0, 70)
    celli.swell(V2 - 1, V2 + 1, 0, 64)
    pad.swell(DIP - .5, DIP + .5, 70, 82)  # the dip leans on the strings
    pad.swell(BUILDUP, DROP, 82, 100)
    celli.swell(BUILDUP, DROP, 64, 96)
    pad.swell(DROP, FINAL, 100, 120, steps=96)
    celli.swell(DROP, FINAL, 96, 120, steps=96)
    for b, ch in bars(L1, END):
        tones = [p(x) for x in TRIAD[ch].split()]
        arp = [tones[0], tones[1], tones[2], tones[0] + 12]
        lift = min(24, int((b - L1) / 8) * 6)
        for k, t in enumerate(sixteenths(b)):
            ost.add(t, .11, arp[k % 4] + (12 if b >= FINAL else 0), (70 if k % 4 == 0 else 58) + lift)

    # ---------- choir: pad from 40, harmony on the hook from 48, the answer in the build, the hook at 66
    for b, ch in bars(L2, END):
        choir.add(b, 1.95, CHOIR[ch].split(), 88)
    choir.swell(L2 - 1, L2 + 1, 0, 70)
    choir.swell(L2 + 1, FINAL, 70, 118, steps=80)
    for t, d, n in hook(L3):
        choir_h.add(t, d, third_below(n, t), 90, True)
    for t, d, n in hook(PRE_GRID, (1, 2)) + hook(PRE_GRID + 2, (3, 4)):  # the pre-chorus, over A then G
        choir_h.add(t, d, n, 100, True)
    for t, d, n in hook(FINAL):
        choir_h.add(t, d, n, 104, True)
    for t, d, n in tag:
        choir_h.add(t, d, n, 104, True)
    choir_h.add(TONIC, END - TONIC, ["D5", "F#5"], 106, True)
    choir_h.swell(L3 - 1, L3 + 1, 0, 84)
    choir_h.swell(L3 + 1, FINAL, 84, 118, steps=60)

    # ---------- horns: the counter-line in the second block, then a line under the build
    for t, d, n in [(0.0, 1.5, "E4"), (1.5, 0.5, "F#4"), (2.0, 1.5, "D4"), (3.5, 0.5, "C#4"),
                    (4.0, 2.0, "B3"), (6.0, 1.5, "A3"), (7.5, 0.25, "B3"), (7.75, 0.25, "C#4")]:
        horns.add(L1 + 2 + t, d, n, 86)  # starts on the A/C# bar
    for b, ch in bars(WHIP, END):
        horns.add(b, 1.95, [p(x) for x in CHOIR[ch].split()[:2]], 84 + min(16, int((b - WHIP) / 4) * 4))

    # ---------- brass: stabs on the off-beats from 40, every off-beat from 66
    for b, ch in bars(L2, TONIC):
        lift = min(18, int((b - L2) / 8) * 6)
        for off in (.75, 1.75) if b < FINAL else (.25, .75, 1.25, 1.75):
            brass.add(b + off, .14, POWER[ch].split()[1:] + [TRIAD[ch].split()[1]], 86 + lift, True)
    brass.add(TONIC, END - TONIC - .2, ["D4", "F#4", "A4", "D5"], 108, True)

    # ---------- timpani: rolls into the drop and the final chorus, hits on the big arrivals
    for t1 in (DROP, FINAL):
        for k in range(32):
            timp.add(t1 - 2 + k * .0625, .07, "A2", 44 + k * 2)
    for t in (DROP, L2, FINAL, TONIC):
        timp.add(t, 1.5, "D3", 100 + (10 if t >= FINAL else 0), True)

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
