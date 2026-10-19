# ASKEdits Studio

A local video-editing prototype that connects a React studio to an Express upload API and an FFmpeg media pipeline. Import footage, create editing proxies, and prepare transcript-driven editing workflows.

![ASKEdits Studio](docs/images/studio.png)

## Try it

Requires Node.js 22 or newer.

~~~sh
npm ci
npm run build
npm start
~~~

Open http://127.0.0.1:8787. Select **Preview sample video** to inspect the browser preview and style selection without an API key. The original, silent sample is included in this repository. This preview does not demonstrate a completed AI edit.

For development, use npm run dev. It starts the API and Vite and prints their ports. If another app uses the default ports, the development launcher chooses available ones.

## Process your own footage

1. Install FFmpeg and ffprobe and make them available on PATH.
2. Copy .env.example to .env. Set custom binary paths if needed.
3. For local transcription and vision, use Python 3.11 and install python -m pip install -r python/requirements.txt. Set PYTHON_BIN to that interpreter. Model files may download on the first transcription.
4. Configure your own optional Groq, OpenRouter, or stock-media keys for the corresponding features. Keys stay on the server.
5. Import a short video with speech, choose a style, and follow processing in the studio.

## Engineering highlights

- Shared browser/server file validation for MP4, MOV, WebM, and MKV, up to 2 GB.
- Fixed-size chunk uploads with per-chunk size checks, retry handling, and serialized metadata updates.
- Atomic metadata replacement prevents readers from seeing partially written JSON.
- Asset identifier and thumbnail filename validation protects filesystem boundaries.
- Original footage, proxies, thumbnails, audio, and transcripts use separate asset folders.
- Keyboard-accessible upload selection, visible focus, and reduced-motion support.

## Architecture

~~~mermaid
flowchart LR
  Studio[React studio] --> API[Express upload API]
  API --> Store[Local asset folders and metadata]
  API --> Media[FFmpeg and ffprobe]
  Media --> Speech[Groq or local Faster-Whisper]
  Speech --> Plan[Analysis and edit planning]
  Plan --> Render[Render queue and FFmpeg]
  Render --> Studio
~~~

src/frontend contains the studio. src/backend owns uploads, media processing, and rendering. src/shared holds validation and formatting. python contains optional speech and vision entry points.

## Verification

~~~sh
npm test
npm run build
~~~

Nine automated tests cover validation, transcripts, invalid paths, incomplete uploads, parallel chunks, retries, and HTTP error codes. GitHub Actions is configured to run tests and a production build. See [VALIDATION.md](VALIDATION.md) for what was actually verified locally.

## Current limits

This is a single-user local prototype. It has no authentication, tenant isolation, durable job broker, upload expiry, or cross-process locking. Keep the default loopback binding for local use. Advanced AI editing, GPU encoding, and cloud integrations need their own runtimes and credentials. Full media processing and live cloud calls were not verified in this portfolio pass. Documentation under docs/phases includes design plans and should not be read as a list of completed features.
