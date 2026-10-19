# Phase 10: Manual Editing System

This phase introduces a deep manual editing layer, transforming ASKEdits from an automated tool into a full-featured online video editor.

## Stage 10.1: Visual Timeline UI

A comprehensive **Timeline Editor** tab provides a multi-track view of the AI-generated edit plan.

### Key Components:
- **`TimelineEditor.jsx`**: Orchestrates the state of the modified edit plan.
- **`TimelineRuler.jsx`**: Provides a frame-accurate time reference.
- **`TimelineTrack.jsx`**: Renders parallel tracks for **Cuts, B-Roll, Captions, Zooms, and SFX**.
- **`TimelineClip.jsx`**: Individual interactive blocks that can be clicked to edit.

## Stage 10.2: Interactive Track Editing

Users can precisely control every element of the timeline through specialized modals.

### Caption Editor (`CaptionEditModal.jsx`):
- **Text Override**: Change caption wording or split sentences.
- **Timing Control**: Adjust start/end times with 0.1s precision.
- **Style Templates**: Switch individual captions between templates (TikTok, Hormozi, etc.).
- **Animations**: Choose from multiple motion presets (Pop In, Fade Up, etc.).

### B-Roll Manager (`BrollEditModal.jsx`):
- **Search & Replace**: Enter a new query and hit "Fetch" to instantly swap the stock clip via Pixabay API.
- **Custom Upload**: Upload your own video files (`.mp4`) to replace any AI-suggested B-roll.
- **Placement Tuning**: Precisely move or trim B-roll clips.

## Stage 10.3: AI-Powered Timeline Regeneration

The **Timeline Toolbar** uses Groq AI to perform targeted bulk updates to the timeline.

### AI Tools:
- **Regenerate Captions**: Re-writes captions to be punchier or shorter.
- **Regenerate B-Roll**: Re-thinks the stock footage strategy for the entire video.
- **Style Modifiers**: Buttons like "Make More Cinematic" or "Make Like TikTok" apply global transformations to filters, zooms, and pacing.

## Data Flow:
Manual edits are stored in the `edit-plan.json` artifact. When the user hits **Save & Re-render**, the backend rendering engine uses this modified JSON as the "source of truth" instead of the initial AI generation.
