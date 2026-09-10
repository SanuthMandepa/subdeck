# Subdeck

A subtitle editor that runs entirely in your browser. Load a video, let Whisper
transcribe it, fix the lines by hand, then export an `.srt`/`.vtt` — or a new
video file with the captions burned into the picture.

Nothing is uploaded. There is no account, no server, no quota, and no watermark.

## Run it

```
start.cmd
```

That opens <http://localhost:8080>. (It uses Node if you have it, Python
otherwise, and falls back to opening `index.html` directly.)

Serving it over localhost isn't cosmetic: the server sets the COOP/COEP headers
that switch on cross-origin isolation, which lets the speech model run
multi-threaded. On a machine without WebGPU that's a large speed difference.

To pick a different port: `node serve.mjs 8081`

## Deploy it

It's a static site — no build step, no server code. Push to GitHub, import the
repo on Vercel, done.

The one thing that matters is [`vercel.json`](vercel.json): it reproduces the
COOP/COEP headers that `serve.mjs` sets locally. Without them the deployed site
loses cross-origin isolation and CPU transcription slows down a lot. Any other
static host works too, as long as you can set those two headers (Netlify via
`_headers`, Cloudflare Pages via `_headers`, GitHub Pages **cannot** — it gives
you no header control, so transcription there falls back to single-threaded).

## What it does

**Auto-transcribe** — Whisper (tiny / base / small) via `transformers.js`, running
on WebGPU where available and CPU otherwise. The model downloads once from the
Hugging Face CDN (40–250 MB depending on size) and is then cached by the browser,
so later runs work offline. Handles ~30 languages and can translate to English.

**Edit** — a waveform timeline with draggable cue blocks: drag the middle to move
a caption, drag an edge to trim it. Type timecodes directly, split a cue at the
playhead, merge it into the next one. Overlaps and zero-length cues get flagged.

**Style** — two caption modes:

- *Classic* — the whole line appears at once. Exports to `.srt`/`.vtt` too.
- *Word pop* — words rise up into place one at a time as they're spoken, each in
  its own colour from an editable palette. Driven by Whisper's word-level
  timings; on hand-typed cues the words are spaced evenly across the cue.
  Burn-in only, since `.srt` has no way to express it.

Both give you font, size, weight, text colour, outline colour and width,
background plate colour and opacity, alignment, height, sideways offset and max
width — plus five presets. **You can also just drag the caption around on the
video** to place it; the sliders follow.

The preview is drawn by the same canvas code that writes the export, so what you
see is exactly what gets encoded.

**Multiple videos** — load as many as you like, one after another. Cues are saved
per filename (the 20 most recent), so switching back to an earlier video brings
its captions back. Styling is shared across all of them.

**Export**
- `.srt`, `.vtt`, or a plain transcript — instant.
- Burn-in: re-encodes locally with `MediaRecorder`. Chrome/Edge produce MP4
  (H.264/AAC); Firefox produces WebM. This renders in **real time** — a 3-minute
  clip takes about 3 minutes — so leave the tab in the foreground.

Cues and styling are saved to `localStorage`, so a refresh doesn't lose your work.
You just re-pick the video file, because browsers never let a page hold onto one.

## Shortcuts

| | |
|---|---|
| `Space` | play / pause |
| `←` `→` | nudge 1s (`Shift` 5s, `Alt` 0.1s) |
| `N` | new cue at the playhead |
| `[` `]` | set the selected cue's in / out point |
| `S` | split the selected cue at the playhead |
| `Del` | delete the selected cue |
| `Ctrl+S` | download the `.srt` |

## Is it really free?

Yes, and it stays free, because none of the expensive parts are on a server:

| | |
|---|---|
| Video decode & playback | your browser |
| Speech recognition | Whisper, on your own CPU/GPU |
| Model weights | free, Apache-2.0, from a public CDN |
| Video encoding | `MediaRecorder`, built into your browser |
| Hosting | a local file |

The only network traffic is the one-time model download and the webfonts.

## Limits worth knowing

- **Burn-in is real time.** There's no way around that with `MediaRecorder`. For
  faster-than-real-time encoding you'd need `ffmpeg.wasm` or desktop ffmpeg —
  which is also free, and easy to add later if you want it.
- Burn-in is a re-encode, so it's mildly lossy. Sidecar `.srt` files are lossless
  and reversible; prefer them unless the platform demands burned-in captions.
- Whisper transcription is good but not perfect — proper nouns, overlapping
  speech and heavy accents need a review pass. That's what the editor is for.
- Very long files (over ~1 hour) will use a lot of memory, since the whole audio
  track is decoded to 16 kHz PCM up front.
- Chrome or Edge give the best results (WebGPU + MP4 output).
