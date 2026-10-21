# Launch film audio

Everything you hear in the film is built from code here and lined up to `src/timeline.json` (120 BPM, a bar is 2 s, 98 s total).

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
- It never stops and only climbs from the drop at 24 s. A 16th-note muted-guitar pulse runs from 8 s to the end. Before the final chorus the loop turns G, A, D (IV, V, I); the band pushes onto D a beat early at 81.5, with the picture's impact at 81.6. The ending is stop-time: a drum fill from 96.0, then everyone lands on D with the logo strike at 96.5.

  | Time | Section | What it adds |
  |---|---|---|
  | 0-8 | Intro | Piano hook, glockenspiel on the held notes, soft low-passed kick and shaker |
  | 8-14 | Verse | Bass, light drums and the 16th pulse |
  | 14-18 | Verse 2 | Tension: 16th hi-hats, snare, strings, a low tom each bar |
  | 18-20 | Dip | No kit; the pulse and shaker keep going, a riser starts, the bed goes darker |
  | 20-24 | Build | Kick on quarters, 8th bass in octaves, snare roll, timpani roll, the filter opens |
  | 24-40 | Chorus 1-2 | The drop. Double time: four on the floor, snare with ghosts, 16th hats, open hats on the off-beats; power chords, piano 8ths; the lead plays the hook |
  | 40-48 | + strings | A 16th string ostinato; horn counter-line |
  | 48-56 | + choir, brass | Choir pad, brass stabs on the off-beats |
  | 56-64 | + harmony | Lead harmony a third below, tom fills, choir harmony |
  | 64-75 | + drive | 16th power chords |
  | 75-78 | Whip | Tom fill, crash, riser starts |
  | 78-81.5 | Pre-chorus | Over G then A: snare 8ths, 16ths, then 32nds; the choir sings; a rising high-pass |
  | 81.5-96 | Final chorus | The push onto D, the hook an octave up with harmony, every layer, the tag D, A, G |
  | 96-98 | Strike | A drum fill, then the whole band on D at 96.5, ringing out under the fade from 96.8 |

- The lead steps back 6 dB under every voice line from 24 s and plays full in the gaps.
- Instruments come from MuseScore General (MIT): Grand Piano 0, Glockenspiel 9, Muted Guitar 28, Overdrive Guitar 29, Distortion Guitar 30, Picked Bass 34, Timpani 47, Strings Slow Expr 17/49, Celli 40/49, Choir Aahs Expr 17/52, French Horns 60, Brass Section 61, Sine Wave 8/80, Power kit 128/16.
- The Expr presets follow CC2 for loudness, so swells are written on CC2.

## Mix targets

- Sections are set against the first chorus block: intro -7, verse -5, verse 2 -4, dip -5.5, build -3 (LU). From 24 s a bar-by-bar ride puts every 2 s bar on a rising line, up to +5.6 LU in the final chorus.
- The peak sits at -16.5 LUFS before ducking, so the voice stays about 6 dB on top.
- The music ducks 5 dB under the voice, with a 60 ms attack and a 600 ms release.
- The master sits at -14 LUFS integrated with a true peak of -1.3 dBTP or lower, at 48 kHz stereo, exactly 98.0 s long.
