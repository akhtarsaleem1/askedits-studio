# Phase 2 - Speech & Transcript Engine

## Objective

Extract a clean analysis audio track from uploaded video, transcribe it with Faster-Whisper, and store structured transcript JSON that downstream editor and AI features can consume.

## Stage 2.1 - Audio Extraction

Deliver:

- FFmpeg-based audio extraction from uploaded source media
- Mono analysis track
- 16 kHz sample rate for speech workloads
- Stored audio artifact per asset

## Stage 2.2 - Multilingual Transcription

Deliver:

- Faster-Whisper transcription through a Python helper
- Automatic language detection by default
- Support for multilingual speech including English, Urdu, Pashto, Hindi, Arabic, and other Whisper-supported languages
- Word timestamps and VAD-enabled transcription

## Stage 2.3 - Transcript Formatting

Deliver:

- Structured JSON transcript artifact
- Word-level timestamps and confidences
- Sentence groups
- Pause classification
- Silence interval detection
- Inferred speaker sections
- Heuristic emotional emphasis metadata

## Current Implementation Notes

- Python runtime is resolved from `PYTHON_BIN`, the Codex bundled Python runtime, `python`, or `py -3`.
- Project-local Python packages can be installed under `.python-packages`.
- GPU auto-detection falls back to CPU when CUDA libraries are not usable.
- If the uploaded media has no audio stream, transcript generation is skipped and the asset still finishes processing.
