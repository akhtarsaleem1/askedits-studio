# Phase 8: Rendering System

This phase enhances the FFmpeg-based rendering pipeline to support various export formats and quality tiers, making the output suitable for different social media platforms.

## Stage 8.1: Enhanced FFmpeg Pipeline

The rendering engine (`src/backend/services/auto-edit-engine.js`) integrates all previous stages (cuts, captions, zooms, filters, B-roll, audio enhancement, SFX) into a complex FFmpeg filter graph.

### Key features:
- **Audio/Video Synchronization**: Precisely maps audio and video pads through the complex filter to ensure sync is maintained even after multiple trims and overlays.
- **Progress Tracking**: Real-time progress is reported back to the frontend through status polling.

## Stage 8.2: Multi-Format Export Presets

We support automatic aspect ratio conversion and resolution scaling for major platforms.

### Supported Formats (`src/backend/services/export-presets.js`):
- **TikTok/Shorts/Reels (9:16)**: 1080x1920
- **YouTube Landscape (16:9)**: 1920x1080
- **Instagram Square (1:1)**: 1080x1080
- **Twitter/X (16:9 720p)**: 1280x720

### Letterboxing/Pillarboxing:
The system uses the `scale` and `pad` filters to ensure that the video is correctly fitted into the target resolution without stretching, adding black bars where necessary.

## Stage 8.3: Quality Tiers

Users can choose between different encoding speeds and output qualities.

| Tier | CRF | Preset | Description |
| :--- | :--- | :--- | :--- |
| **Draft** | 28 | `ultrafast` | Fastest possible render for quick checking. |
| **Standard**| 23 | `fast` | Balanced quality and speed (default). |
| **High** | 18 | `medium` | Visually lossless quality for final uploads. |
| **Max** | 15 | `slow` | Maximum archival quality. |

These settings are integrated into the UI presets in `src/frontend/components/EditorPanel.jsx`.
