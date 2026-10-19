# Phase 11: Performance Optimization

Phase 11 focuses on infrastructure upgrades to dramatically speed up editing, rendering, and processing.

## Stage 11.1: Proxy Video System
- **Adaptive Quality Selection:** Dynamically chooses between Low (360p), Medium (480p), and High (720p) proxy tiers based on original source resolution.
- **Proxy-Aware Frontend:** The frontend seamlessly serves the proxy file during manual timeline editing and AI playback review, drastically reducing browser memory and network strain.
- **GPU Proxy Generation:** Utilizes fast hardware-accelerated encoding (e.g. `ultrafast` or `p1` presets) when generating the proxy file to ensure minimal wait times during the initial upload pipeline.

## Stage 11.2: Background Queue Processing
- **In-Memory Render Queue:** Replaces ad-hoc `Promise` chains with a structured background job queue (`render-queue.js`) for FFmpeg render jobs.
- **Concurrency Control:** Configurable concurrency limits (default: 2) prevent CPU/GPU exhaustion when processing multiple tasks.
- **Job Lifecycle & Polling:** Frontend reliably polls queue status. Jobs run through states: `queued -> processing -> ready | failed`. 
- **Queue Introspection API:** Allows fetching active, pending, and completed job statistics.

## Stage 11.3: GPU Optimization
- **Hardware Detection Engine:** The backend auto-probes FFmpeg on startup for capabilities like CUDA, NVENC, VAAPI, QSV, and VideoToolbox.
- **Optimal Encoder Selection:** Dynamically builds FFmpeg arguments to utilize hardware encoding whenever available (`h264_nvenc`, `h264_qsv`, etc.).
- **Graceful CPU Fallback:** Automatically reverts to `libx264` if no suitable GPU accelerator is detected on the host machine.
