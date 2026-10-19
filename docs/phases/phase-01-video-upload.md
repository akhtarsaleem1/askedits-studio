# Phase 1 - Video Upload System

## Objective

Allow users to upload supported video files, validate them, extract trustworthy media metadata, and generate lightweight preview assets that future editing features can consume.

## Stage 1.1 - Upload UI

Deliver:

- Drag-and-drop upload zone
- File picker fallback
- Upload progress feedback
- File size display
- Detected duration display
- Thumbnail preview
- Supported formats messaging
- Inline validation feedback
- Mobile-friendly responsive layout

## Stage 1.2 - Backend Upload Processing

Deliver:

- Upload session creation
- Chunk upload endpoints
- Chunk assembly into original file
- FFmpeg/ffprobe validation
- Automatic optimized transcode
- Metadata extraction for duration, resolution, frame rate, and codecs
- Storage layout that keeps originals and derived assets separated

## Stage 1.3 - Video Preview Generation

Deliver:

- Low-resolution proxy MP4
- Poster thumbnail image
- Status polling support so the UI can react to processing changes

## Acceptance Criteria

- A supported video can be selected from desktop or mobile.
- The UI rejects unsupported or oversized files before upload.
- Upload progress is visible while chunks are sent.
- The backend stores each upload under its own asset directory.
- Upload completion triggers metadata probing and derivative generation.
- Status polling eventually reports either `ready` or `failed`.
- The original upload stays untouched after processing.

## Current Limitations

- Asset state is stored on disk instead of a database.
- Processing runs inside the web process rather than a dedicated job queue.
- Resume logic for partially uploaded sessions is not yet implemented across page reloads.
- Cloud object storage and signed URLs are future work.
