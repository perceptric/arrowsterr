"""Subtitles: times every word of the voiceover and writes src/captions.json.

Run after vo.py: python audio/captions.py
Each line's audio is split at its pauses, the pauses are matched to the line's punctuation,
and words inside a phrase share its time by how long they take to say.
"""
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
HOP = 0.01


def syllables(word: str) -> float:
    w = word.lower()
    if re.search(r"\d", w):
        return 1.5 * len(re.findall(r"\d", w)) + 1
    groups = re.findall(r"[aeiouy]+", w)
    n = max(1, len(groups) - (1 if w.endswith("e") and len(groups) > 1 else 0))
    return n + 0.3


def voiced(path: Path):
    x, sr = sf.read(path)
    hop = int(sr * HOP)
    e = np.array([np.sqrt(np.mean(x[i : i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    on = e > 0.012
    idx = np.where(on)[0]
    return (idx[0] * HOP, (idx[-1] + 1) * HOP, on) if len(idx) else (0.0, len(x) / sr, on)


def gaps(on, start, end):
    """Silent stretches of 120 ms or more inside the line, as (from, to) in seconds."""
    out = []
    i = int(start / HOP)
    stop = int(end / HOP)
    while i < stop:
        if not on[i]:
            j = i
            while j < stop and not on[j]:
                j += 1
            if (j - i) * HOP >= 0.12:
                out.append((i * HOP, j * HOP))
            i = j
        else:
            i += 1
    return out


def main() -> None:
    tl = json.loads((ROOT / "src/timeline.json").read_text())
    words = []
    for cue in tl["vo"]:
        s0, s1, on = voiced(ROOT / f"audio/build/vo_{cue['id']}.wav")
        toks = cue["text"].split()
        # phrases end at punctuation
        phrases, cur = [], []
        for w in toks:
            cur.append(w)
            if re.search(r"[,.?!]$", w):
                phrases.append(cur)
                cur = []
        if cur:
            phrases.append(cur)
        g = sorted(gaps(on, s0, s1), key=lambda x: x[1] - x[0], reverse=True)[: len(phrases) - 1]
        g.sort()
        # if a line has fewer pauses than phrase breaks, merge the leftover phrases
        while len(g) < len(phrases) - 1:
            phrases[-2] = phrases[-2] + phrases[-1]
            phrases.pop()
        bounds = [s0] + [x for gap in g for x in gap] + [s1]
        for k, ph in enumerate(phrases):
            a, b = bounds[2 * k], bounds[2 * k + 1]
            wts = [syllables(w) for w in ph]
            total = sum(wts)
            t = a
            for w, wt in zip(ph, wts):
                d = (b - a) * wt / total
                words.append({"w": w, "s": round(cue["at"] + t, 3), "e": round(cue["at"] + t + d, 3), "line": cue["id"]})
                t += d
    # pages: up to four words, a new page after punctuation or a new line
    pages, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if len(cur) >= 4 or re.search(r"[,.?!]$", w["w"]) or not nxt or nxt["line"] != w["line"]:
            pages.append(cur)
            cur = []
    out = [{"s": p[0]["s"], "e": p[-1]["e"], "words": [{"w": w["w"], "s": w["s"], "e": w["e"]} for w in p]} for p in pages]
    (ROOT / "src/captions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(len(words), "words,", len(pages), "pages")


if __name__ == "__main__":
    main()
