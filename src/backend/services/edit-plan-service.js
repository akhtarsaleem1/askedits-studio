import config from "../../../config/default.js"
import { groqChatJson } from "./groq-client.js"

function buildTranscriptContext(transcript) {
  const sentences = (transcript.sentenceGroups ?? []).slice(0, 80)
  return sentences
    .map((s) => `[${s.id}] ${s.startSec.toFixed(1)}s-${s.endSec.toFixed(1)}s "${s.translatedText ?? s.text}"`)
    .join("\n")
}

function buildSystemPrompt() {
  return `You are a world-class AI video editor. Generate precise, actionable editing plans with exact timestamps from the provided transcript data.
Return ONLY valid JSON — no commentary, no markdown fences.`
}

function buildUserPrompt(transcript, viralMoments, styleAnalysis) {
  const durationSec = transcript.durationSec ?? 0
  const wordCount = transcript.summary?.wordCount ?? 0
  const pauseCount = transcript.summary?.pauseCount ?? 0
  const transcriptContext = buildTranscriptContext(transcript)

  const topMoments = (viralMoments.moments ?? [])
    .slice(0, 6)
    .map((m) => `- [${m.type}] "${m.title}" ${m.startSec.toFixed(1)}s-${m.endSec.toFixed(1)}s (viralScore:${m.viralScore.toFixed(2)})`)
    .join("\n")

  const style = styleAnalysis.primaryStyle ?? "podcast"
  const recommendations = styleAnalysis.editingRecommendations ?? {}

  return `Generate a complete AI edit plan for this video.

B-ROLL RULES:
1. Analyze the transcript to decide if B-roll is actually needed. If it's a quick talking head with no strong visual subjects, return an empty broll array.
2. Do NOT cover the entire video with B-roll. Leave the main speaker visible most of the time.
3. Keep single B-roll clips between 1.5s and 4.0s maximum.
4. Total B-roll duration must NOT exceed 30% of the total video duration (${durationSec.toFixed(1)}s). If the video is under 10s, use at most 1 B-roll clip.

VIDEO STATS:
- Duration: ${durationSec.toFixed(1)}s
- Words: ${wordCount}, Pauses: ${pauseCount}
- Detected style: ${style} (${(styleAnalysis.primaryConfidence ?? 0.8 * 100).toFixed(0)}% confidence)
- Recommended cut pace: ${recommendations.cutPace ?? "moderate"}
- Recommended transitions: ${recommendations.transitionStyle ?? "crossfade"}
- Caption style: ${recommendations.captionStyle ?? "subtitle_bar"}
- Music mood: ${recommendations.musicMood ?? "ambient_chill"}

TOP VIRAL MOMENTS:
${topMoments}

TRANSCRIPT SAMPLE:
${transcriptContext}

Generate a structured edit plan. Be specific with timestamps. Return JSON in exactly this structure:
{
  "timeline": {
    "cuts": [
      { "id": "cut-1", "type": "hard_cut|jump_cut|l_cut|j_cut", "timeSec": 0.0, "reason": "brief reason" }
    ],
    "captions": [
      { "id": "caption-1", "startSec": 0.0, "endSec": 5.5, "text": "caption text", "style": "bold_pop|subtitle_bar|word_pop|kinetic", "animation": "fade_up|pop_in|slide_in|none", "highlightWords": ["word1"] }
    ],
    "zooms": [
      { "id": "zoom-1", "startSec": 0.0, "endSec": 5.0, "zoomLevel": 1.2, "target": "center|speaker_face|action_point", "reason": "reason" }
    ],
    "broll": [
      { "id": "broll-1", "startSec": 0.0, "endSec": 5.0, "suggestedQuery": "search query for stock footage", "purpose": "brief purpose" }
    ],
    "transitions": [
      { "id": "transition-1", "timeSec": 0.0, "type": "crossfade|hard_cut|whip_pan|dissolve|zoom_blur", "durationSec": 0.5 }
    ],
    "sfx": [
      { "id": "sfx-1", "timeSec": 0.0, "suggestedQuery": "cinematic swoosh|mouse click|pop sound", "purpose": "emphasize transition" }
    ],
    "music": [
      { "id": "music-1", "startSec": 0.0, "endSec": 60.0, "mood": "ambient_chill|upbeat|epic|dramatic|lo_fi|energetic", "energyLevel": "low|medium|high", "suggestedGenre": "genre description", "volumePercent": 20 }
    ],
    "filters": [
      { "id": "filter-1", "startSec": 0.0, "endSec": ${durationSec.toFixed(1)}, "type": "color_grade|saturation|contrast|vignette", "preset": "preset name or description", "intensity": 0.5 }
    ],
    "animations": [
      { "id": "anim-1", "startSec": 0.0, "endSec": 0.5, "type": "text_pop|lower_third|title_card|countdown|progress_bar", "element": "element-id", "easing": "ease_out_back|ease_in_out|linear|spring" }
    ]
  },
  "shortFormClips": [
    { "id": "clip-1", "title": "clip title", "startSec": 0.0, "endSec": 45.0, "aspectRatio": "9:16|16:9|1:1", "platform": "tiktok|youtube_shorts|instagram_reels", "viralMomentIds": ["moment-1"], "estimatedEngagement": "low|medium|high|viral" }
  ],
  "summary": {
    "totalCuts": 0,
    "totalCaptions": 0,
    "totalZooms": 0,
    "totalBroll": 0,
    "shortFormClipCount": 0,
    "estimatedEditedDurationSec": 0.0,
    "editingComplexity": "simple|moderate|complex|cinematic"
  }
}

Rules:
- Generate 8-20 cuts focusing on removing pauses and dead air
- Generate captions for all key moments and viral segments
- Add 2-5 zoom effects on emotional or emphasis moments  
- Suggest 3-6 B-roll placements aligned with content topics
- Suggest 3-5 SFX placements (swooshes, clicks, impacts) at major transitions or emphasis points
- Generate 2-4 short-form clips from the top viral moments
- Keep all timestamps within the video duration of ${durationSec.toFixed(1)}s`
}

function safeSummary(data, durationSec) {
  const timeline = data.timeline ?? {}
  return {
    totalCuts: (timeline.cuts ?? []).length,
    totalCaptions: (timeline.captions ?? []).length,
    totalZooms: (timeline.zooms ?? []).length,
    totalBroll: (timeline.broll ?? []).length,
    totalSfx: (timeline.sfx ?? []).length,
    shortFormClipCount: (data.shortFormClips ?? []).length,
    estimatedEditedDurationSec: Number(data.summary?.estimatedEditedDurationSec ?? durationSec * 0.85),
    editingComplexity: data.summary?.editingComplexity ?? "moderate"
  }
}

export async function generateEditPlan(transcript, viralMoments, styleAnalysis) {
  const durationSec = transcript.durationSec ?? 0

  const result = await groqChatJson({
    model: config.ai.primaryModel,
    temperature: 0.35,
    maxTokens: 6000,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(transcript, viralMoments, styleAnalysis) }
    ]
  })

  const data = result.data
  const timeline = data.timeline ?? {}

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: result.model,
    videoDurationSec: durationSec,
    detectedStyle: styleAnalysis.primaryStyle ?? "unknown",
    timeline: {
      cuts: Array.isArray(timeline.cuts) ? timeline.cuts : [],
      captions: Array.isArray(timeline.captions) ? timeline.captions : [],
      zooms: Array.isArray(timeline.zooms) ? timeline.zooms : [],
      broll: Array.isArray(timeline.broll) ? timeline.broll : [],
      sfx: Array.isArray(timeline.sfx) ? timeline.sfx : [],
      transitions: Array.isArray(timeline.transitions) ? timeline.transitions : [],
      music: Array.isArray(timeline.music) ? timeline.music : [],
      filters: Array.isArray(timeline.filters) ? timeline.filters : [],
      animations: Array.isArray(timeline.animations) ? timeline.animations : []
    },
    shortFormClips: Array.isArray(data.shortFormClips) ? data.shortFormClips : [],
    summary: safeSummary(data, durationSec)
  }
}
