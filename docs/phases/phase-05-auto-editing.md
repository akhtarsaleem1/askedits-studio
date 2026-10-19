# Phase 5 — Automatic Editing Engine

The Automatic Editing Engine completes the AI lifecycle in ASKEdits, transforming raw uploaded media + analysis metadata into polished, ready-to-publish videos entirely automatically.

## Architecture

Unlike the processing pipeline (Phases 1-4) which runs linearly on upload, Phase 5 operates on an **on-demand rendering model**. A user selects a preset from the Editor UI, clicks "Render", and the backend generates a customized video using FFmpeg filter chains.

### The Orchestrator: `auto-edit-engine.js`

Coordinates all sub-engines and builds a massive `complex_filter` graph for FFmpeg.
- Handles reading all intermediate JSON artifacts (Edit Plan, Silence Detection, Face Data)
- Manages output file creation (`renders/render_{id}.mp4`)
- Real-time progress tracking via standard FFmpeg output parsing

### 1. Cut Engine (`cut-engine.js`)

Dynamically generates FFmpeg `trim` and `concat` filters to remove unwanted segments.
- **Modes**: `silence_only`, `smart_cuts`, `ai_driven`
- Inverts dead-air / pause detection points into "keep" segments
- Chunks video/audio streams and recombines them synchronously

### 2. Caption Engine (`caption-engine.js`)

Converts the word-level transcript into ASS (Advanced SubStation Alpha) subtitle files.
- **Karaoke Timing**: Uses `{\k}` timing tags for dynamic word-by-word highlighting
- **Styles**: TikTok (bold pop), Hormozi (impact upper), Cinematic, Documentary, Podcast, Gaming, News, Minimalist.
- Renders directly into the video stream via the `ass` FFmpeg filter

### 3. Zoom Engine (`zoom-engine.js`)

Applies dynamic camera motion over static clips.
- **Modes**: `punch_in` (static crop), `slow_push` (gradual zoompan), `ken_burns` (drift and zoom)
- Generates parameterized FFmpeg `zoompan` or `crop` filters
- Integrates with Phase 4 Face Detection to ensure dominant speakers remain centered

### 4. Filter Engine (`filter-engine.js`)

Applies cinematic color grades and VFX.
- Manipulates Luma/Chroma via `eq` and `colorchannelmixer` filters
- Adds stylized visual effects using `vignette`, `unsharp` (sharpening), and `noise` (film grain)
- Presets: Vibrant Pop, Warm Golden, Cool Teal, Moody Dark, Film Noir, Sunset Glow

## Editor UI (`EditorPanel.jsx`)

The frontend component allows users to trigger edits:
1. **Presets**: 1-click workflows that auto-configure cuts, captions, zooms, and filters (e.g., "TikTok Viral", "Hormozi").
2. **Active Settings**: Summary of what will be applied to the render.
3. **Render Control**: Trigger render, view real-time progress bar, preview the final video, and download.
