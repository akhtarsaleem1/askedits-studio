# ASKEdits Studio

A local video editing studio: upload footage, choose a template, refine the timeline, and export a finished MP4. React handles the workspace; Express, FFmpeg, and optional local Faster-Whisper perform the media work.

![ASKEdits Studio workspace](docs/images/studio.png)

## From footage to finished edit

The workspace has four separate pages, with one task per page:

| Page                         | What you do                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projects** · `/projects`   | Upload footage, try the narrated demo, or reopen a saved project.                                                                                   |
| **Templates** · `/templates` | Browse the seven editing recipes and choose a style.                                                                                                |
| **Editor** · `/editor`       | Refine the timeline and captions, then render a short 540p preview. Framing, pacing, captions, visuals, and audio each have their own settings tab. |
| **Exports** · `/exports`     | Review the edit, choose 720p or 1080p, and download MP4, SRT, JSON, and media credits. Revisit earlier renders.                                     |

Navigation preserves the current edit and background renders. Project links include a project identifier, so refresh and browser Back/Forward restore the correct workspace. You can choose a template before uploading footage. The studio builds a shot plan and retimes captions around the cuts.

| Template          | Editing recipe                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Tech Brief        | Presenter panel, supporting footage, animated section cards, lime word captions, original sound effects |
| Creator Punch     | Pause removal, bold captions, alternating punch-ins, vertical framing                                   |
| Cinematic Story   | Distributed montage shots, dissolves, gentle movement, filmic color, music                              |
| Podcast Spotlight | Short speech excerpt, pause removal, clean captions, subtle reframing                                   |
| Clean Interview   | Natural color, restrained captions, optional motion, tighter pauses                                     |
| Product Launch    | Short shots, crisp color, square framing, rhythmic music                                                |
| Travel Journal    | Warm color, relaxed movement, soft transitions, vertical framing                                        |

Every recipe is adjustable. Use blurred fit or a crop with a manual focal point; choose vertical, landscape, square, or portrait output. Edit caption text and source timestamps, import SRT, and choose four caption styles. Audio controls include speech cleanup, source level, three original generated music beds, custom audio upload, and automatic music ducking under speech.

Drafts, original footage, and export history are stored locally. Reopen recent projects, retry preparation, and cancel queued or active renders. The timeline displays actual shot decisions, caption timing, and source audio peaks.

## Reference-inspired explainer editing

**Tech Brief** takes its visual direction from the [reference Short](https://youtube.com/shorts/JlMzLG-ZFwk): a presenter below supporting visuals, bold lime word captions, numbered sections, and animated contour graphics. See [the implementation notes](docs/reference-style.md) for the observed details and limits.

Choose **Tech Brief → Editor → Visuals → Build reference sequence**. The corrected layout keeps the presenter large and creates topic cards across the full edit, rather than leaving the visual panel empty after the opening. Chapter titles are editable. Upload video or images, or click **Try original motion sample**, then adjust each placement on the edited timeline. B-roll audio is muted so narration continues. The library supports 24 assets per project (80 MB each), with up to 12 placements. Set a video source in-point, label each visual, or use auto-place to spread clips across the edit. Images fit inside the visual panel; videos fill it.

Choose cuts, dissolves, slides, wipes, or flashes in Pacing. Set headline and animated graphics in Visuals, word captions in Captions, and original synthesized whoosh/impact/click cues in Audio. Preview and final export use the same plan. Exports include a poster and media credits.

![Tech Brief final export](docs/images/tech-brief-exports.png)

The stock picker searches Wikimedia Commons without a key, or Pexels with a server-side PEXELS_API_KEY. Only your entered search keywords are sent. Imported files retain source and license metadata in the credits download. Stock access requires an internet connection; provider DNS was unavailable on the development machine, so live search is unverified. Local uploads and the bundled original sample work independently.

For a cutout presenter over the graphics, set PYTHON_BIN and run **npm run setup:visuals**, then restart the server and enable **Remove presenter background**. This installs MediaPipe locally and a checksum-verified Google selfie model; footage stays on your computer. The first render prepares a reusable person mask. If your source already has burned captions, enable **Crop existing source captions** and adjust its top/bottom crop while reviewing framing. Cropping removes that part of the image; it does not reconstruct what was underneath.

This preset does not extract another video's footage or soundtrack. Topic cards use transcript keyword heuristics and can be edited. It does not infer arbitrary video styles from a URL or automatically find semantically matching stock footage.

## Run locally

Requires Node.js **22.12+** and **FFmpeg 8+** with ffprobe, H.264/AAC encoders, and the ASS subtitle filter. FFmpeg 8 was tested on Windows; CI uses the [BtbN 8.1 Linux build](https://github.com/BtbN/FFmpeg-Builds/releases/tag/latest) with checksum verification. Install fonts with coverage for your caption language.

```sh
npm ci
```

Copy .env.example to .env. Set FFMPEG_BIN and FFPROBE_BIN if they are not on PATH. Then:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:8787**. No API key is required for the template editor, rendering, or manual captions. The included demo contains original graphics and synthetic narration so you can try the entire workflow.

For automatic captions, install Python 3.11+ and the optional speech dependency:

```sh
python -m pip install -r python/requirements.txt
```

Set PYTHON_BIN to that interpreter. The default tiny model downloads on first transcription; larger Faster-Whisper models trade speed and memory for accuracy. Select the source language or automatic detection before upload. Captions remain editable, and an unavailable model never prevents template editing or SRT import. Core editing and local transcription do not send footage to a cloud AI service.

For development, npm run dev starts Vite and the API and chooses available ports. Media and generated files live under the ignored storage/ directory; keep that directory when moving an installation.

## Engineering

```mermaid
flowchart LR
  UI[React editing workspace] --> API[Express API]
  API --> Upload[Validated chunk uploads]
  Upload --> Prepare[FFmpeg proxy, waveform and silence analysis]
  Prepare --> Speech[Optional local speech transcription]
  API --> Planner[Shared deterministic edit planner]
  Planner --> Queue[Cancellable render queue]
  Queue --> FFmpeg[FFmpeg video, captions and audio filters]
  FFmpeg --> Artifacts[MP4, SRT, JSON and media credits]
  API --> Store[Local metadata and draft storage]
```

- Shared browser/server validation and chunk transport for files up to 2 GB.
- A deterministic planner maps source timestamps into output timestamps after trims, pause cuts, and transitions. Preview shots match the beginning of the final edit.
- Real render progress, bounded process output, cancellation signals, partial-output cleanup, and restart recovery messages.
- Per-asset serialized metadata updates and atomic replacement with bounded retries for Windows file locks.
- Validated asset identifiers, generated artifact paths, audio stream inspection, and server-side credentials.
- Accessible controls, keyboard focus, reduced motion, and a responsive workspace.

The shared workspace state lives in src/frontend/Studio.jsx. ProjectsPage, TemplatesPage, EditorPage, and ExportsPage render the separate screens; StudioContext shares the active edit between them. Templates and planning live in src/shared/; the render engine is src/backend/services/template-renderer.js. Earlier experimental AI and vision modules remain separate from the template workflow. Design plans in docs/phases/ are historical, not a completed feature checklist.

## Verify

```sh
npm test
npm run build
npm run test:media
npx playwright install chromium
npm run test:ui
```

Media tests require FFmpeg/ffprobe. Browser checks start their own server and temporary storage, render a preview and final video, and check downloads, saved settings, and mobile layout. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an installed Chrome. See [VALIDATION.md](VALIDATION.md) for verified results.

## Scope

This is a single-user local application. Keep the loopback binding; public hosting requires authentication, tenant isolation, and a durable job service. Templates make reproducible editing decisions rather than judging a story like a human editor. Excerpt suggestions use transcript heuristics, or evenly spaced positions when speech is unavailable. Cropping uses your chosen focal point. Transcript quality depends on the model and recording; review captions and framing before publishing. Rendering uses CPU H.264; long or high-resolution footage needs more time and disk space.
