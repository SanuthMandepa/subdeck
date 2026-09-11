# Subdeck

A subtitle editor that runs entirely in your browser. Load a video, let Whisper
transcribe it, fix the lines by hand, then export an `.srt`/`.vtt` — or a new
video file with the captions burned into the picture.

Nothing is uploaded. There is no account, no server, no quota and no watermark.

## Run it

```
npm install
npm run dev
```

That opens <http://localhost:5173>. On Windows, `start.cmd` does both steps for
you.

Serving it over localhost isn't cosmetic: the dev server sets the COOP/COEP
headers that switch on cross-origin isolation, which lets the speech model run
multi-threaded. On a machine without WebGPU that is a large speed difference.
`vite.config.ts` is where those headers live.

| | |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check and build to `dist/` |
| `npm run preview` | serve `dist/` with the same headers |
| `npm test` | unit tests for the timecode, subtitle and word-timing logic |
| `npm run lint` | ESLint |

## Deploy it

It builds to a static `dist/` — no server code. Push to GitHub, import the repo
on Vercel, done; the Vite preset picks up `npm run build` on its own.

The one thing that matters is [`vercel.json`](vercel.json): it reproduces the
COOP/COEP headers. Without them the deployed site loses cross-origin isolation
and CPU transcription slows down a lot. Any other static host works too, as long
as you can set those two headers (Netlify and Cloudflare Pages via `_headers`;
GitHub Pages **cannot** — it gives you no header control, so transcription there
falls back to single-threaded).

## How it is put together

React owns the chrome — panels, cue list, dialogs. It does **not** own the
engine: the canvas renderer, the timeline, the export pipeline and the Whisper
runner are plain TypeScript modules that React mounts and otherwise stays out of
the way of. A 60 fps render loop has no business going through a component tree.

```
src/
  engine/     canvas renderer, timeline, media, ASR, export pipeline
  lib/        pure logic — timecode, subtitles, word timing, storage (tested)
  state/      the zustand store both sides read
  components/ the React UI
```

The store is zustand rather than context specifically so the render loop and the
exporters can read state from outside React via `getState()`. The playhead is
deliberately *not* in the store — `video.currentTime` is read straight off the
element, and the timecode readout is written to a DOM ref, so nothing re-renders
per frame.

## What it does

**Auto-transcribe** — Whisper (tiny / base / small) via `transformers.js`,
running on WebGPU where available and CPU otherwise. The model downloads once
from the Hugging Face CDN (40–250 MB depending on size) and is then cached by
the browser, so later runs work offline. Handles ~30 languages and can translate
to English.

**Edit** — a waveform timeline with draggable cue blocks: drag the middle to
move a caption, drag an edge to trim it. Type timecodes directly, split a cue at
the playhead, merge it into the next one. Overlaps and zero-length cues get
flagged. Every edit is undoable with `Ctrl+Z`.

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

**Multiple videos** — load as many as you like, one after another. Cues are
saved per filename (the 20 most recent), so switching back to an earlier video
brings its captions back. Styling is shared across all of them.

**Export**
- `.srt`, `.vtt`, or a plain transcript — instant.
- Burn-in, two engines:
  - **Precise** (WebCodecs) steps the video frame by frame and stamps each one,
    so audio and picture cannot drift. Usually faster than real time, the tab can
    lose focus, and it always writes MP4 (H.264 + AAC).
  - **Real-time** (`MediaRecorder`) is the fallback where WebCodecs is missing.
    It takes exactly as long as the video and the tab must stay visible.

Cues and styling are saved to `localStorage`, so a refresh doesn't lose your
work. You just re-pick the video file, because browsers never let a page hold
onto one.

## Shortcuts

| | |
|---|---|
| `Space` | play / pause |
| `←` `→` | nudge 1s (`Shift` 5s, `Alt` 0.1s) |
| `N` | new cue at the playhead |
| `[` `]` | set the selected cue's in / out point |
| `S` | split the selected cue at the playhead |
| `Del` | delete the selected cue |
| `Ctrl+Z` | undo (`Ctrl+Shift+Z` to redo) |
| `Ctrl+S` | download the `.srt` |

## Is it really free?

Yes, and it stays free, because none of the expensive parts are on a server:

| | |
|---|---|
| Video decode & playback | your browser |
| Speech recognition | Whisper, on your own CPU/GPU |
| Model weights | free, Apache-2.0, from a public CDN |
| Video encoding | WebCodecs, built into your browser |
| Hosting | a static file |

## Limits worth knowing

- Burn-in is a re-encode, so it's mildly lossy. Sidecar `.srt` files are lossless
  and reversible; prefer them unless the platform demands burned-in captions.
- The real-time engine is bound to wall-clock time — a 3-minute clip takes about
  3 minutes. Precise has no such limit; use it wherever it is offered.
- Whisper transcription is good but not perfect — proper nouns, overlapping
  speech and heavy accents need a review pass. That's what the editor is for.
- Very long files (over ~1 hour) will use a lot of memory, since the whole audio
  track is decoded to 16 kHz PCM up front.
- Chrome or Edge give the best results (WebGPU + MP4 output).
