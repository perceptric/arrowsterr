"""Voiceover: renders every line in src/timeline.json with Kokoro and lays them on one track.

Run: python audio/vo.py <kokoro.onnx> <voices.bin>
Writes audio/build/vo_<id>.wav for each line and public/audio/vo.wav (48 kHz, the full film).
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
PLACEHOLDER = "Zubbleton"  # stands in for a brand name so we can swap in its phonemes


def phonemes_for(text: str, tok: Tokenizer, pronounce: dict[str, str]) -> str:
    for word in pronounce:
        text = text.replace(word, PLACEHOLDER)
    ph = tok.phonemize(text, "en-us")
    placeholder_ph = tok.phonemize(PLACEHOLDER, "en-us")
    for spoken in pronounce.values():
        ph = ph.replace(placeholder_ph, spoken, 1)
    return ph


def main() -> None:
    model, voices = sys.argv[1], sys.argv[2]
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    kokoro = Kokoro(model, voices)
    tok = Tokenizer()
    out = ROOT / "audio/build"
    out.mkdir(parents=True, exist_ok=True)

    track = np.zeros(int(tl["durationSec"] * SR), dtype=np.float32)
    cues = tl["vo"]
    report = []
    for i, cue in enumerate(cues):
        ph = phonemes_for(cue["text"], tok, tl["pronounce"])
        samples, sr = kokoro.create(ph, voice=tl["voice"], speed=cue.get("speed", 1.05), is_phonemes=True)
        samples = resample_poly(samples, SR, sr).astype(np.float32)
        sf.write(out / f"vo_{cue['id']}.wav", samples, SR)
        start = int(cue["at"] * SR)
        track[start : start + len(samples)] += samples[: len(track) - start]
        dur = len(samples) / SR
        nxt = cues[i + 1]["at"] if i + 1 < len(cues) else tl["durationSec"]
        report.append((cue["id"], cue["at"], round(dur, 2), round(nxt - cue["at"] - dur, 2), ph))

    peak = np.abs(track).max()
    track *= 0.89 / peak
    sf.write(ROOT / "public/audio/vo.wav", track, SR)
    (out / "vo_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for r in report:
        flag = "  OVERLAP" if r[3] < 0.05 else ""
        print(f"{r[0]} at {r[1]:>5}s  len {r[2]:>4}s  gap {r[3]:>5}s{flag}  {r[4]}")


if __name__ == "__main__":
    main()
