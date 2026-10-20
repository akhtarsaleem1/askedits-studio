# Validation — 19 October 2026

## Verified locally

- Windows, Node.js 24.13.1, FFmpeg/ffprobe 8.0.1, Chrome, and Python 3.13.
- **30 unit and API tests passed**, including deterministic planning, preview/final consistency, silence removal, caption retiming, Unicode SRT, invalid inputs, concurrent chunks, and HTTP errors.
- **5 media integration tests passed**: all seven template recipes encoded valid fast-start H.264/AAC MP4s with the planned dimensions and duration; silent video with music and burned captions; pause cuts and retimed SRT; actual 1920×1080 export; HTTP upload/preparation/waveform/plan/render/download/cancel workflow.
- **Browser workflow passed** using the narrated demo: upload and preparation, template selection, manual SRT import and editing, square framing, music, a real 540p preview, a final 720p export, MP4 and SRT downloads, saved settings after refresh, recent projects, stale-render detection, and 390px mobile layout without horizontal overflow. No JavaScript exceptions.
- **Local automatic captions verified separately** on the 22.6-second narrated demo using Faster-Whisper tiny on CPU: 43 words were returned, then retimed and burned into a 12-second Creator Punch preview. Transcript accuracy still requires review.
- Production build passed with Vite 8.3.4. Fresh dependency installation completed. npm audit reported **0 vulnerabilities** after compatible dependency updates and the qs override.
- FFmpeg checks use generated test fixtures and temporary storage. The browser test also isolates its project storage and cleans it up.

## Continuous verification

GitHub Actions installs dependencies, FFmpeg 8.1 (with checksum verification), fonts, and Chromium, then runs unit/API tests, the build, media integration tests, and the browser workflow. Browser screenshots are uploaded as a workflow artifact. Live cloud services are not used by these checks.

## Practical limits

The studio is intended for one user on a local machine. Multiple primary narration clips, face tracking, beat detection, and reference-video style extraction are outside this release. Supporting video and image B-roll can be layered over one primary source. Excerpt suggestions are deterministic heuristics. CPU rendering of long videos and large exports takes longer; the 2 GB upload limit is a validation bound, not a tested performance benchmark. Automatic captions need an installed model and fonts suitable for the selected language. Legacy cloud/vision modules and GPU rendering were not verified in this release.

FFmpeg 6 on the Linux runner stalled during music/motion rendering. This release requires FFmpeg 8+ and checks that version before rendering. Parallel filter scheduling also stalled a Windows montage; the engine now uses one filter worker, verified through the full browser export.

## Multi-page workflow verification

The interface now has Projects, Templates, Editor, and Exports routes. A complete Chrome check passed with real preview/final rendering, template selection before upload, settings and SRT persistence across pages, continued export while navigating, saved project refresh, Back/Forward, direct project links in an isolated browser context, recent-project reopening, and keyboard navigation through settings tabs. All four pages were checked at 390px without horizontal overflow or JavaScript exceptions. Screenshots use the synthetic demo in temporary test storage.

## Explainer editing verification

The Tech Brief browser workflow covers uploaded original B-roll, editable output timing and source in-points, motion headline and word captions, slide transitions, sound cues, preview and 720p export, media credits, and stock connection error recovery. It retains the multi-page persistence, keyboard, and mobile checks.

The media test renders video and image overlays over a silent source. It samples encoded frame chroma to verify that each visual appears at the planned time, and audio statistics verify that synthesized sound cues are audible. All seven templates still render. Tests use generated footage and original bundled motion graphics.

Stock URL allowlists, Commons license parsing, and filtering are unit-tested. Live provider search/import could not be verified because provider DNS resolution failed on this machine. Browser search failure is deliberately mocked to verify recovery; it is not evidence of a working live provider connection. Pexels requires an optional server key.

## Reference composition correction

The earlier presenter layout left large gaps and made portrait recordings too small; supporting visuals ended after the opening and embedded source captions remained visible. The new Reference explainer layout enlarges the presenter, generates full-duration topic cards, spreads selected visuals through the edit, and provides source cropping for existing captions. Caption placement uses the lower presenter area.

A new media regression test samples encoded pixels to verify that a synthetic person mask replaces the background, retains the foreground, and removes a colored baked-caption strip through cropping. This test uses a generated mask, so CI does not download an ML model. Two unit tests cover full-duration chapter coverage, placements beyond the opening, editable titles and crop validation.

MediaPipe 0.10.35 and Google's square selfie model were separately tested locally on the user's actual portrait recording. A complete 1080×1920 export was reviewed at representative positions throughout its 53.4-second duration. That private footage and its review images are ignored and are not published in the repository. Segmentation can have soft edges or include a chair; review the result. Cropping is adjustable and can remove wanted image content.

The browser check also exercises the reference sequence builder, editable chapters, and crop controls. Live stock access remains outside these offline checks.

## Caption-directed editing

Five new planner tests cover subject-based selection independent of library order, exact spoken anchors, caption retiming and subject edits, exclusion of unrelated footage, sentence-score paraphrase matching, retiming after silence cuts, and identical preview/final decisions. The existing media integration case additionally renders automatically selected clips and samples encoded red/blue pixels at their caption-aligned times.

Local sentence matching was separately verified with the pinned MiniLM model: the introduction's company portfolio image enters at “ASK Envisionary” and the app grid at “Java and Flutter.” Unsupported topics retain the presenter rather than reusing unrelated images. Private clips and outputs remain ignored. CI tests keyword matching and deterministic sentence-score fixtures; it does not download model weights.

The browser workflow covers saved clip descriptions, switching to caption sync, decision explanations, a missing-footage query, and a real caption-directed preview. Media and browser checks run sequentially to avoid multiple full video exports competing for resources.
