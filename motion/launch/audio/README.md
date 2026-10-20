# Launch film audio

Everything you hear in the film is built from code here and lined up to `src/timeline.json` (120 BPM, a bar is 2 s, 84 s total).

| Step | Script | Output |
|---|---|---|
| Voice | `vo.py <kokoro.onnx> <voices.bin>` | `public/audio/vo.wav` |
| Score | `score.py` | `build/midi/*.mid`, `build/stems/*.wav` |
| Sound design | `sfx.py` | `public/audio/sfx.wav` |
| Mix and master | `mix.py` | `public/audio/music.wav`, `public/audio/mix.wav`, `public/audio/mix.m4a` |

The film plays `public/audio/mix.m4a`. `music.wav` is the score after ducking, before mastering.

## Rebuild

```bash
apt-get install -y fluidsynth musescore-general-soundfont ffmpeg
python -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy mido pyloudnorm
.venv/bin/python audio/vo.py kokoro.onnx voices-v1.0.bin   # only when the script changes
.venv/bin/python audio/score.py
.venv/bin/python audio/sfx.py
.venv/bin/python audio/mix.py
```

## The song

- One song, start to finish: D major, 120 BPM, and one 4-bar loop, D | A/C# | Bm | G, with the bass walking down D, C#, B, G.
- One hook rides the loop. It climbs, holds on a "star" note and answers itself:
  - over D: A4 D5 E5 F#5, then A5 held
  - over A/C#: G5 F#5, then E5 held
  - over Bm: F#4 B4 C#5 D5, then F#5 held
  - over G: E5 F#5, then D5 held
- It grows by adding instruments and never stops:

  | Time | Section | What plays |
  |---|---|---|
  | 0-8 | Intro | Piano hook, glockenspiel on the held notes, soft low-passed kick and shaker |
  | 8-16 | Verse | Bass, light drums and muted guitar join |
  | 16-24 | Verse 2 | Eighth-note hats, strings, and a tom on each radar ping |
  | 24-28 | Breakdown | Drums drop out; piano, strings and bass keep the hook, darker |
  | 28-32 | Build | Kick on quarters, snare roll, timpani roll, and the filter opens |
  | 32-66 | Chorus | Full band; lead guitar plays the hook, a horn counter-line from 42 to 50, choir harmony from 56 to 66 |
  | 66-68 | Fill | Tom fill under the whip |
  | 68-72 | Lift | Half-time; the choir sings the answer into 72 |
  | 72-80 | Final chorus | Biggest: lead with a harmony a third under, brass stabs, choir |
  | 80-84 | Outro | Lands on D at 80 and rings out, with a fade from 82.5 |

- Instruments come from MuseScore General (MIT): Grand Piano 0, Glockenspiel 9, Muted Guitar 28, Overdrive Guitar 29, Distortion Guitar 30, Picked Bass 34, Timpani 47, Strings Slow Expr 17/49, Celli 40/49, Choir Aahs Expr 17/52, French Horns 60, Brass Section 61, Sine Wave 8/80, Power kit 128/16.
- The Expr presets follow CC2 for loudness, so swells are written on CC2.

## Mix targets

- Each section is set against the chorus: intro -7, verse -4.5, verse 2 -3.5, breakdown -7.5, build rising into the chorus, final chorus +1 (LU). Level changes glide into each boundary.
- The music ducks 5 dB under the voice, with a 60 ms attack and a 600 ms release.
- The master sits at -14 LUFS integrated with a true peak of -1.3 dBTP or lower, at 48 kHz stereo, exactly 84.0 s long.
