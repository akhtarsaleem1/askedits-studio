# ASKEdits - AI Handoff

## Product Intent

ASKEdits is an AI-assisted video workflow product. The current implementation provides a dependable upload and preprocessing pipeline that completely analyzes media (audio, text, visuals, scenes) and enables fully automated, dynamic video editing based on AI insights.

## Current Repo State

- The project is a React + Express app using Vite and Node.js.
- **Phase 1** handles frontend upload UX, upload/session APIs, and FFmpeg-based preview generation.
- **Phase 2** handles clean audio extraction plus Faster-Whisper transcript generation through a Python helper.
- **Phase 3** introduces AI Video Understanding, passing the transcript to Groq's LLMs to detect viral moments, analyze editing styles, and generate structured editing plans.
- **Phase 4** adds Scene Analysis, utilizing PySceneDetect (camera cuts), OpenCV/HaarCascades (face detection tracking), and FFmpeg (silence detection) to build a rich visual/audio context map.
- **Phase 5** acts as the Automatic Editing Engine. It takes all metadata from Phases 1-4 and uses on-demand FFmpeg filter chains to apply smart cuts, animated captions (8 styles), dynamic zoom effects, and cinematic color grades.
- **Phase 6** introduces B-Roll Automation, fetching free stock footage via Pexels and Pixabay APIs based on AI-generated keywords and intelligently overlaying them during rendering.
- **Phase 7** introduces Audio Enhancement, including voice cleanup (RNNoise/FFT-based) and AI-driven Sound Effects (SFX) fetched from Pixabay API.
- **Phase 8** implements the Rendering System with multi-format export presets (TikTok, YouTube, Instagram) and quality tiers (Draft to Max).
- **Phase 9** provides an AI Preview System for instant playback and approval of AI-generated edits.
- **Phase 10** introduces a Manual Editing System with a visual timeline, interactive track editing, and AI-powered regeneration tools.
- **Phase 11** implements Performance Optimization, featuring an adaptive proxy video system, an in-memory background render queue, and automatic GPU hardware acceleration detection (CUDA/NVENC).
- **Phase 12** (SaaS Expansion) is currently planned for the future and is NOT implemented.
- **Phase 13** integrates Advanced AI Features, including an AI thumbnail generator, psychological hook rewriter, AI-generated B-roll clips via external APIs, and a natural language Co-Editor Chat interface.
- There is no database. Upload state and metadata are stored as JSON on disk per asset.

## Architectural Rules To Preserve

- Never overwrite the original uploaded file.
- Treat `ffprobe` metadata as the source of truth for duration, resolution, frame rate, and codecs.
- Keep upload completion separate from processing completion.
- Generated derivatives must live beside the asset in clearly separated folders.
- Structured JSON artifacts (transcript, viral-moments, scene-detection, etc.) are the canonical source for rendering.
- All rendering operations run on FFmpeg filter chains to avoid complex Python video-processing dependencies.

## Storage Model

Each upload is stored in its own asset directory:

- `chunks/`: temporary uploaded parts
- `original/`: untouched source media
- `optimized/`: compressed derivative
- `proxy/`: lower-resolution preview video
- `thumbnails/`: poster image
- `audio/`: extracted mono analysis track
- `transcripts/`: structured transcript JSON and raw transcription output
- `ai/`: viral moments, style analysis, edit plan, scene detection, face detection, silence detection
- `broll/`: cached B-roll stock video clips (including user-uploaded custom clips)
- `sfx/`: cached sound effects from Pixabay
- `renders/`: output directories containing rendered `.mp4` videos, `.ass` subtitle files, and `.json` EDL metadata
- `metadata.json`: canonical asset state

## Phase Registry

- **Phase 1: Video Upload System**
  - Stage 1.1: Upload UI
  - Stage 1.2: Backend Upload Processing
  - Stage 1.3: Video Preview Generation
- **Phase 2: Speech & Transcript Engine**
  - Stage 2.1: Audio Extraction
  - Stage 2.2: Multilingual Transcription
  - Stage 2.3: Transcript Formatting
- **Phase 3: AI Video Understanding**
  - Stage 3.1: LLM Integration (Groq)
  - Stage 3.2: Viral Moment Detection
  - Stage 3.3: Style & Pacing Analysis
  - Stage 3.4: Edit Plan Generation
- **Phase 4: Scene Analysis System**
  - Stage 4.1: Scene Detection (PySceneDetect)
  - Stage 4.2: Face Detection & Tracking (OpenCV Haar)
  - Stage 4.3: Silence & Pause Detection (FFmpeg)
- **Phase 5: Automatic Editing Engine**
  - Stage 5.1: Auto Cutting System
  - Stage 5.2: Dynamic Captions (.ass generation)
  - Stage 5.3: Auto Zooms & Camera Motion
  - Stage 5.4: Filters & Effects
- **Phase 6: B-Roll Automation**
  - Stage 6.1: Keyword Extraction
  - Stage 6.2: Free B-Roll Search
  - Stage 6.3: Smart B-Roll Placement
- **Phase 7: Audio Enhancement**
  - Stage 7.1: Voice Cleanup (FFmpeg afftdn/acompressor)
  - Stage 7.2: AI-Driven SFX (Pixabay API)
- **Phase 8: Rendering System**
  - Stage 8.1: Enhanced FFmpeg Pipeline
  - Stage 8.2: Multi-Format Export Presets
  - Stage 8.3: Quality Tiers (Draft to Max)
- **Phase 9: AI Preview System**
  - Stage 9.1: Fast Preview Rendering
  - Stage 9.2: Edit Approval UI
- **Phase 10: Manual Editing System**
  - Stage 10.1: Visual Timeline UI
  - Stage 10.2: Interactive Track Editing (Captions, B-roll, SFX)
  - Stage 10.3: Custom Asset Uploads
  - Stage 10.4: AI-Powered Timeline Regeneration (Groq)
- **Phase 11: Performance Optimization**
  - Stage 11.1: Proxy Video System
  - Stage 11.2: Background Queue Processing
  - Stage 11.3: GPU Optimization
- **Phase 12: SaaS Expansion** (Future)
  - Authentication, Collaboration, Templates
- **Phase 13: Future Advanced AI Features**
  - Stage 13.1: AI Thumbnail Generator
  - Stage 13.2: AI Hook Rewriter
  - Stage 13.3: AI Generated B-Rolls
  - Stage 13.4: AI Co-Editor Chat

## Implementation Notes For Future AI Work

- The backend uses local filesystem storage first so the workflow can mature before cloud storage is introduced.
- Processing currently runs in-process after upload completion. Move this to a queue worker before scaling.
- Face Detection in Phase 4 currently uses OpenCV Haar Cascades due to MediaPipe compatibility issues with Python 3.13.

## Deployment & Environment
- **Python 3.13+**: Required for `faster-whisper`, `scenedetect`, `opencv-python`. Local env is in `.python-packages`.
- **FFmpeg/FFprobe**: Must be in PATH for media derivatives, probing, and all Phase 5 renders.
- **Groq API Key**: Required for Phase 3 LLM features.
- **Stock Video APIs**: PEXELS_API_KEY and PIXABAY_API_KEY required for Phase 6.
- **CUDA**: Optional but highly recommended for fast Whisper transcription.

## Pipeline Progress (Asset Processing)
The pipeline reports progress via the `processingProgress` field.
- 5%: Probing
- 15%: Video Derivatives (Optimized/Proxy)
- 45%: Audio Extraction
- 50-60%: Transcription (Faster-Whisper)
- 60-70%: Scene Detection
- 70-78%: Face Detection
- 78-85%: Silence Detection
- 85-99%: AI Analysis (Groq)
- 100%: Complete
