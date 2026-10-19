# Phase 4 — Scene Analysis System

Phase 4 adds computer-vision and audio-level analysis to the ASKEdits pipeline, running **after** transcription and **before** AI analysis.

## Architecture

### Stage 4.1 — Scene Detection
- **Engine**: PySceneDetect with ContentDetector
- **Script**: `python/scene_detect.py`
- **Service**: `src/backend/services/scene-detection-service.js`
- **Output**: `{assetRoot}/ai/scene-detection.json`
- Detects camera cuts, transitions, and major visual changes
- Reports real-time progress via stderr `PROGRESS:XX` markers

### Stage 4.2 — Face Detection
- **Engine**: MediaPipe FaceDetection (model_selection=0, fast mode)
- **Script**: `python/face_detect.py`
- **Service**: `src/backend/services/face-detection-service.js`
- **Output**: `{assetRoot}/ai/face-detection.json`
- Samples frames at 1 FPS for lightweight per-scene face summary
- Cross-references with scene detection data for per-scene face position tracking
- Reports dominant face position (left/center/right) for future auto-reframing

### Stage 4.3 — Silence & Pause Detection
- **Engine**: FFmpeg `silencedetect` filter (pure JS, no Python)
- **Service**: `src/backend/services/silence-detection-service.js`
- **Output**: `{assetRoot}/ai/silence-detection.json`
- Classifies intervals as: dead-air (≥2.0s), pause (≥1.0s), micro-pause (≥0.5s)
- Runs in addition to the transcript-based silence detection (different purposes)

## Pipeline Progress Mapping

| Stage | Progress Range |
|---|---|
| Probing | 0–5% |
| Video Derivatives | 5–15% |
| Audio Extraction | 15–45% |
| Transcription | 45–60% |
| Scene Detection | 60–70% |
| Face Detection | 70–78% |
| Silence Detection | 78–85% |
| AI Analysis | 85–100% |

## Frontend

- **Scene Analysis tab** in UploadStudio (default tab)
- **SceneAnalysisPanel.jsx** displays:
  - Scene timeline with color-coded segments
  - Face detection summary with per-scene speaker focus
  - Silence/pause map with dead-air, pause, micro-pause classification
- **PipelineTracker** updated with Phase 4 stages (amber color theme)

## Dependencies

- `opencv-python` — Video frame reading
- `scenedetect` — Scene boundary detection
- `mediapipe` — Face detection
- All installed to `.python-packages` directory
