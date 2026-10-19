import config from "../../../config/default.js"
import { groqChatJson } from "./groq-client.js"

const MOMENT_TYPES = ["hook", "emotional_peak", "engagement_peak", "strong_statement", "storytelling", "viral_clip"]

function buildTranscriptContext(transcript) {
  const sentences = (transcript.sentenceGroups ?? []).slice(0, 120)

  return sentences
    .map((s) => {
      const emphasis = s.emphasis?.level ?? "low"
      return `[${s.id}] ${s.startSec.toFixed(1)}s-${s.endSec.toFixed(1)}s [emphasis:${emphasis}] "${s.translatedText ?? s.text}"`
    })
    .join("\n")
}

function buildSystemPrompt() {
  return `You are an expert viral video editor AI. Analyze video transcripts and identify high-value moments for social media.
Return ONLY valid JSON — no commentary, no markdown fences.`
}

function buildUserPrompt(transcriptContext, durationSec) {
  return `Analyze this video transcript (total duration: ${durationSec.toFixed(1)}s) and identify the most viral and engaging moments.

TRANSCRIPT:
${transcriptContext}

Identify up to 10 key moments. Each moment must map to real sentence IDs and timestamps from the transcript above.

Return JSON in exactly this structure:
{
  "moments": [
    {
      "id": "moment-1",
      "type": "hook|emotional_peak|engagement_peak|strong_statement|storytelling|viral_clip",
      "title": "short descriptive title",
      "startSec": 0.0,
      "endSec": 12.5,
      "sentenceGroupIds": ["sentence-1", "sentence-2"],
      "transcript": "the verbatim text from those sentences",
      "confidence": 0.0-1.0,
      "viralScore": 0.0-1.0,
      "reasoning": "1-2 sentence explanation of why this moment is valuable",
      "suggestedCaption": "compelling caption text for short-form video",
      "platform": ["tiktok", "youtube_shorts", "instagram_reels"]
    }
  ],
  "summary": {
    "totalMoments": 0,
    "topViralClips": 0,
    "hookCount": 0,
    "emotionalPeakCount": 0,
    "strongStatementCount": 0
  }
}

Rules:
- Prefer moments with high emphasis scores
- viral_clip moments should be 15-90 seconds long and self-contained
- hook moments should come from the first 20% of the video
- Sort moments by viralScore descending
- Only include real sentence IDs from the transcript`
}

export async function detectViralMoments(transcript) {
  const durationSec = transcript.durationSec ?? 0
  const transcriptContext = buildTranscriptContext(transcript)

  const result = await groqChatJson({
    model: config.ai.primaryModel,
    temperature: 0.4,
    maxTokens: 4096,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(transcriptContext, durationSec) }
    ]
  })

  const moments = Array.isArray(result.data.moments) ? result.data.moments : []

  // Validate and sanitize moment types
  const validatedMoments = moments.map((moment, index) => ({
    id: moment.id ?? `moment-${index + 1}`,
    type: MOMENT_TYPES.includes(moment.type) ? moment.type : "viral_clip",
    title: String(moment.title ?? ""),
    startSec: Number(moment.startSec ?? 0),
    endSec: Number(moment.endSec ?? 0),
    sentenceGroupIds: Array.isArray(moment.sentenceGroupIds) ? moment.sentenceGroupIds : [],
    transcript: String(moment.transcript ?? ""),
    confidence: Math.min(1, Math.max(0, Number(moment.confidence ?? 0.5))),
    viralScore: Math.min(1, Math.max(0, Number(moment.viralScore ?? 0.5))),
    reasoning: String(moment.reasoning ?? ""),
    suggestedCaption: String(moment.suggestedCaption ?? ""),
    platform: Array.isArray(moment.platform) ? moment.platform : ["tiktok", "youtube_shorts"]
  }))

  const summary = result.data.summary ?? {}

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: result.model,
    moments: validatedMoments,
    summary: {
      totalMoments: validatedMoments.length,
      topViralClips: validatedMoments.filter((m) => m.type === "viral_clip").length,
      hookCount: validatedMoments.filter((m) => m.type === "hook").length,
      emotionalPeakCount: validatedMoments.filter((m) => m.type === "emotional_peak").length,
      strongStatementCount: validatedMoments.filter((m) => m.type === "strong_statement").length,
      ...(typeof summary === "object" ? summary : {})
    }
  }
}
