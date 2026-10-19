# Phase 7: Audio Enhancement

This phase focuses on improving the audio quality of the edited videos through AI-driven voice cleanup and the intelligent insertion of sound effects.

## Stage 7.1: Voice Cleanup

We use FFmpeg's built-in audio filters to enhance the voice recording and remove background noise.

### Key Components:
- **`src/backend/services/audio-enhance-engine.js`**: Generates the FFmpeg audio filter chain.
- **Filters Used**:
    - `highpass=f=80`: Removes low-frequency rumble and mic thumps.
    - `lowpass=f=13000`: Removes high-frequency hiss.
    - `afftdn=nr=12:nf=-40`: FFT-based noise reduction to eliminate background hum.
    - `acompressor`: Normalizes voice levels, ensuring consistent volume.

## Stage 7.2: AI-Driven SFX (Pixabay API)

Instead of using static placeholders, the system dynamically fetches sound effects based on the content of the video.

### Workflow:
1. **AI Analysis (Phase 3)**: The Groq LLM identifies key moments (transitions, emphasis points) and generates an `sfx` array in the edit plan. Each entry includes a `timeSec` and a `suggestedQuery` (e.g., "cinematic swoosh").
2. **Search (Pixabay API)**: The `src/backend/services/sfx-search-service.js` queries the Pixabay Sound Effects API using the suggested keyword.
3. **Download & Cache**: The audio file is downloaded to the asset's `sfx/` directory. MD5 hashing of keywords ensures that duplicate sound requests are served from the local cache.
4. **Mixing**: The `src/backend/services/sfx-engine.js` uses FFmpeg's `adelay` and `amix` filters to precisely place and mix the sound effects with the cleaned voice track.

### Repetition Prevention:
The AI is instructed to suggest a variety of sound types, and the search service fetches the best match from Pixabay's extensive library, ensuring unique audio textures for every video.
