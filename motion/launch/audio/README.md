# Launch film audio

Everything you hear in the film is built from code here and lined up to `src/timeline.json` (120 BPM, a bar is 2 s, 64 s total).

| Step | Script | Output |
|---|---|---|
| Voice | `vo.py <kokoro.onnx> <voices.bin>` | `public/audio/vo.wav` |
| Score | `score.py` | `build/midi/*.mid`, `build/stems/*.wav` |
| Sound design | `sfx.py` | `public/audio/sfx.wav` |
| Mix and master | `mix.py` | `public/audio/music.wav`, `public/audio/mix.wav` |

The film plays `public/audio/mix.wav`. `music.wav` is the score after ducking, before mastering.

## Rebuild

```bash
apt-get install -y fluidsynth musescore-general-soundfont
python -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy mido pyloudnorm
.venv/bin/python audio/vo.py kokoro.onnx voices-v1.0.bin   # only when the script changes
.venv/bin/python audio/score.py
.venv/bin/python audio/sfx.py
.venv/bin/python audio/mix.py
```

## The music

- One motif carries the film: A4 D5 E5 F5, then A5 held. It climbs, then holds on the star note. Its answer climbs the same way over F: C5 F5 G5 A5, then C6.
- Every section keeps the root motion D, Bb, F, C. The opening plays in D minor. It turns major at 28 s, steps up to E major at 54 s and closes on D, A, E.
- Instruments come from MuseScore General (MIT): Grand Piano 0, Strings Slow Expr 17/49, Strings Fast 48, Strings Trem Expr 17/44, Celli 40/49, Pizzicato 45, Picked Bass 34, Sine Wave 8/80, Power kit 128/16, Timpani 47, Distortion Guitar 30, Overdrive Guitar 29 (rhythm, lead, harmony), Choir Aahs Expr 17/52, French Horns 60, Brass Section 61.
- The Expr presets follow CC2 for loudness, so swells are written on CC2.

## Mix targets

- The music ducks 9 dB under the voice, with a 40 ms attack and a 300 ms release.
- All sound cuts to silence from 27.0 to 28.0 s.
- The master sits at -14 LUFS integrated with a true peak of -1.3 dBTP or lower, at 48 kHz stereo, exactly 64.0 s long.
