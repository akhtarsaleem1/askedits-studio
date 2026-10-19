# Phase 3 — AI Video Understanding: Documentation & Final Polish

The core implementation of Phase 3 is complete. This document outlines the architecture and features of the AI-augmented ASKEdits pipeline.

## Architecture Summary

### 1. AI Intelligence (Groq Integration)
- **Engine**: Llama 3.3 (70B) for deep reasoning and Llama 3.1 (8B) for fast classification.
- **Client**: `groq-client.js` uses native `fetch` with exponential backoff retry.
- **Schema**: Standardized JSON outputs for viral moments, editing style, and timeline planning.

### 2. Pipeline Progress System
- **Granular Tracking**: Every backend stage (Probing, Derivatives, Extraction, Transcription, AI) now reports a `processingProgress` percentage.
- **Frontend Sync**: `PipelineTracker.jsx` maps these backend percentages to individual step progress bars.

## Improved Phase 1 & 2 Features

### Phase 1 (Upload)
- **File Intel**: Real-time validation and metadata extraction before upload.
- **Chunked Resilience**: 5MB chunked transport with status feedback.

### Phase 2 (Transcription)
- **Rich Data**: Transcription now includes emphasis scores (based on word timings) passed to the AI for better moment detection.
- **Detailed Stats**: Words per minute, speaker count, and language detection are prominently displayed.

## UI Interaction
The `UploadStudio` provides a multi-tab view of AI results:
- **Viral Moments**: Detection of hooks, peaks, and short-form segments.
- **Style Analysis**: Classification into 8 editing styles with specific recommendations.
- **Edit Plan**: Actionable timeline JSON including:
  - **Cuts & Zooms**: Based on pacing and emotional emphasis.
  - **B-Roll**: Precise stock video keyword extraction and placement.
  - **SFX**: Strategic sound effect placement (swooshes, pops, impacts) with AI-generated search queries for Pixabay.

