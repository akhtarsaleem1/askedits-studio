# Phase 9: AI Preview System

This phase provides the bridge between AI analysis and final export, allowing users to quickly verify the generated edits before committing to a full render.

## Stage 9.1: Fast Preview Rendering

The system uses specialized FFmpeg settings to generate lightweight preview videos.

### Optimization Strategies:
- **Fast Encoding**: Uses the `ultrafast` preset to minimize CPU time.
- **Lower Resolution**: Scales the video to a proxy-like resolution (e.g., 480p) during the preview phase.
- **High CRF**: Uses a higher Constant Rate Factor (CRF 28) to prioritize speed over visual perfection.
- **Cached Derivatives**: Reuses the proxy video generated in Phase 1 as the source for filters to avoid re-decoding high-resolution master files.

## Stage 9.2: Edit Approval UI

The **Auto Editor** tab in the `UploadStudio.jsx` serves as the primary approval screen.

### Features:
- **Preset Selection**: Users can swap between 8+ editing styles (Hormozi, TikTok Viral, Cinematic, etc.) and see the configuration update instantly.
- **Real-time Status**: A progress bar tracked via polling (`PipelineTracker.jsx`) shows the rendering status.
- **Instant Playback**: Once rendered, the preview video is loaded into a native HTML5 player for review.
- **One-Click Download**: Users can download the preview or trigger a high-quality "Standard" or "Max" render if they are satisfied.
