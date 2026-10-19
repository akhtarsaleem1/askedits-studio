# Validation — 19 October 2026

## Verified locally

- Windows, Node.js 24.13.1, FFmpeg/ffprobe 8.0.1, Chrome, and Python 3.13.
- **17 unit and API tests passed**, including deterministic planning, preview/final consistency, silence removal, caption retiming, Unicode SRT, invalid inputs, concurrent chunks, and HTTP errors.
- **3 media integration tests passed**: all six template recipes encoded valid fast-start H.264/AAC MP4s with the planned dimensions and duration; silent video with music and burned captions; pause cuts and retimed SRT; actual 1920×1080 export; HTTP upload/preparation/waveform/plan/render/download/cancel workflow.
- **Browser workflow passed** using the narrated demo: upload and preparation, template selection, manual SRT import and editing, square framing, music, a real 540p preview, a final 720p export, MP4 and SRT downloads, saved settings after refresh, recent projects, stale-render detection, and 390px mobile layout without horizontal overflow. No JavaScript exceptions.
- **Local automatic captions verified separately** on the 22.6-second narrated demo using Faster-Whisper tiny on CPU: 43 words were returned, then retimed and burned into a 12-second Creator Punch preview. Transcript accuracy still requires review.
- Production build passed with Vite 8.3.4. Fresh dependency installation completed. npm audit reported **0 vulnerabilities** after compatible dependency updates and the qs override.
- FFmpeg checks use generated test fixtures and temporary storage. The browser test also isolates its project storage and cleans it up.

## Continuous verification

GitHub Actions installs dependencies, FFmpeg 8.1 (with checksum verification), fonts, and Chromium, then runs unit/API tests, the build, media integration tests, and the browser workflow. Browser screenshots are uploaded as a workflow artifact. Live cloud services are not used by these checks.

## Practical limits

The studio is intended for one user on a local machine. Multiple source files in one timeline, face tracking, beat detection, and reference-video style extraction are outside this release. Excerpt suggestions are deterministic heuristics. CPU rendering of long videos and large exports takes longer; the 2 GB upload limit is a validation bound, not a tested performance benchmark. Automatic captions need an installed model and fonts suitable for the selected language. Legacy cloud/vision modules and GPU rendering were not verified in this release.

FFmpeg 6 on the Linux runner stalled during music/motion rendering. This release requires FFmpeg 8+ and checks that version before rendering. Parallel filter scheduling also stalled a Windows montage; the engine now uses one filter worker, verified through the full browser export.

## Multi-page workflow verification

The interface now has Projects, Templates, Editor, and Exports routes. A complete Chrome check passed with real preview/final rendering, template selection before upload, settings and SRT persistence across pages, continued export while navigating, saved project refresh, Back/Forward, direct project links in an isolated browser context, recent-project reopening, and keyboard navigation through settings tabs. All four pages were checked at 390px without horizontal overflow or JavaScript exceptions. Screenshots use the synthetic demo in temporary test storage.
