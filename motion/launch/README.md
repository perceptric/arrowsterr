# Arrowsterr launch film

"You need a navigator": a 98-second film shot as one continuous camera move. A blue route line with an arrowhead flies from "invisible" to "recommended", across a blueprint line-grid map, at 1920 × 1080 and 30 fps.

## How it fits together

- `src/timeline.json` is the single source of timing. It holds every voiceover line with its start time, plus every story beat. The voice, the music, the sound effects and the picture all read it.
- `src/Camera.tsx` holds the camera: where it looks (`KEYS`), its angle all the way through (`ANG`: orbit, tilt and dutch roll, plus a handheld drift), a wider lens while the arrow travels, and the floating marks that give the map depth. `src/layout.ts` sets where everything sits on the map.
- `src/Captions.tsx` draws the subtitles from `src/captions.json`. After the voice changes, run `python audio/captions.py` to time every word again.
- `src/world/` holds the scenes: tonight's AI answer, the engine check, the logo, the four stations, the paper arrow and the win. `src/world/Platforms.tsx` holds the ChatGPT, Google, Calendly and Salesforce look-alikes. `src/Close.tsx` is the Night close.
- `audio/` builds the sound. See `audio/README.md`.

## Story

| Time | Voice | Picture |
|---|---|---|
| 0:00 | Quick question. | Cursor blinks in an empty AI prompt, 11:42 PM |
| 0:02 | When your buyers need new software, what do they do? | The prompt decodes from scrambled characters |
| 0:06 | They ask AI. And AI hands them a shortlist. | Revora, Guestly and Plateful deal in on the beat |
| 0:10 | So. Are you on it? | A ghost of tablely.com flickers in slot 4 |
| 0:12 | | The buyer clicks Revora. "Demo booked" |
| 0:14 | They just booked a demo. With your competitor. | |
| 0:17 | Let's check. ChatGPT. Claude. Gemini. Perplexity. Google's AI. | Pull back, radar sweep, a beam to each engine |
| 0:23 | Not a single mention. You're invisible. | Every engine: Not mentioned. The ghost dissolves. 0% |
| 0:27 | | One second of silence |
| 0:28 | Good news. You just need a navigator. | The arrowhead appears and the route draws |
| 0:32 | Meet Arrowsterr. | The route sweeps up into the mark, the logo builds |
| 0:34 | It shows where AI recommends your competitors instead of you. | 01 See: gap rows peel off like stickers, 14 gaps |
| 0:38 | Then it turns every gap into keywords people search. | 02 Find: a gap goes into a funnel and comes out as keywords |
| 0:42 | Its agent ranks them by revenue and plans your month. | 03 Plan: topics sort by value into the calendar, $8.4k/mo |
| 0:46 | And writes the pages. Built for Google. Built for AI. | 04 Create: the page writes itself, 92 and 88, folds into a paper arrow |
| 0:50 | Ship it. | The paper arrow launches and the camera whips after it |
| 0:51 | Next morning. Same question. | 9:04 AM, same buyer, same prompt, slot #2 is open |
| 0:54 | There you are. | The arrow dives in, tablely.com locks in at #2, the gold Spark bursts, 60% |
| 0:56 | That one's yours. | The buyer clicks you. "Demo booked" with the Spark |
| 0:58 | Arrowsterr. Get recommended in AI answers. Start free today. | A giant Climb sweeps up to the Night close |

"Arrowsterr" is said "Arrows-ter", with "ter" as in "Inter". The phonemes live in `timeline.json` under `pronounce`.

## Run it

```bash
npm install
npm run studio                        # preview
npm run render                        # out/arrowsterr-launch.mp4
node scripts/stills.mjs 3.5 32 54.3   # spot-check frames as PNGs in out/stills
```

In a sandbox without Remotion's own Chrome, set `REMOTION_CHROME` to a local headless Chrome first.

## Brand notes

Colours, type, corners, tags, the Notch, Target ticks and the flight grid follow `docs/brand.md`. Gold shows up once, for the win. For this film the website motion rules are relaxed for the camera moves, the radar sweep and the page fold. Everything still moves up or right, and nothing bounces.

Engine logos in `public/engines` come from the same sources the app uses (`src/components/Engines.tsx`). Fonts are the Google Fonts variable files, shipped in `public/fonts`.

## Sales team photos

`public/people/sales-1.jpg` to `sales-3.jpg` are stand-ins taken from the AdminLTE package's sample avatars, since stock photo sites can't be reached from the build machine. Their license isn't confirmed. Swap in three licensed stock headshots with the same file names before publishing.
