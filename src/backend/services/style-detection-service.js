import config from "../../../config/default.js"
import { groqChatJson } from "./groq-client.js"

const VALID_STYLES = ["podcast", "documentary", "motivational", "cinematic", "tutorial", "gaming", "vlog", "tiktok_fast"]

function computeWordsPerMinute(transcript) {
  const wordCount = transcript.summary?.wordCount ?? 0
  const durationSec = transcript.durationSec ?? 0

  if (durationSec <= 0) {
    return 0
  }

  return Math.round((wordCount / durationSec) * 60)
}

function buildTranscriptSample(transcript) {
  // Send first, middle and last sections for style sampling
  const sentences = transcript.sentenceGroups ?? []
  const total = sentences.length
  const sampleSize = Math.min(30, Math.floor(total / 3))

  const head = sentences.slice(0, sampleSize)
  const middle = sentences.slice(Math.floor(total / 2) - Math.floor(sampleSize / 2), Math.floor(total / 2) + Math.floor(sampleSize / 2))
  const tail = sentences.slice(Math.max(0, total - sampleSize))

  const deduplicated = [...new Map([...head, ...middle, ...tail].map((s) => [s.id, s])).values()]

  return deduplicated.map((s) => `"${s.translatedText ?? s.text}"`).join("\n")
}

function buildSystemPrompt() {
  return `You are a professional video editor and content strategist. Analyze video transcripts and classify their editing style.
Return ONLY valid JSON — no commentary, no markdown fences.`
}

function buildUserPrompt(transcriptSample, stats) {
  return `Classify the editing style of this video based on its transcript.

TRANSCRIPT SAMPLE:
${transcriptSample}

VIDEO STATS:
- Duration: ${stats.durationSec.toFixed(1)}s
- Word count: ${stats.wordCount}
- Words per minute: ${stats.wpm}
- Speaker sections: ${stats.speakerSections}
- Pause count: ${stats.pauseCount}

Return JSON in exactly this structure:
{
  "primaryStyle": "podcast|documentary|motivational|cinematic|tutorial|gaming|vlog|tiktok_fast",
  "primaryConfidence": 0.0-1.0,
  "secondaryStyle": "podcast|documentary|motivational|cinematic|tutorial|gaming|vlog|tiktok_fast",
  "secondaryConfidence": 0.0-1.0,
  "allStyles": {
    "podcast": 0.0-1.0,
    "documentary": 0.0-1.0,
    "motivational": 0.0-1.0,
    "cinematic": 0.0-1.0,
    "tutorial": 0.0-1.0,
    "gaming": 0.0-1.0,
    "vlog": 0.0-1.0,
    "tiktok_fast": 0.0-1.0
  },
  "characteristics": {
    "paceCategory": "very_slow|slow|relaxed|moderate|fast|very_fast",
    "pauseFrequency": "minimal|low|moderate|high|very_high",
    "emphasisLevel": "low|medium|high",
    "estimatedSpeakerCount": 1
  },
  "editingRecommendations": {
    "cutPace": "slow|moderate|fast|very_fast",
    "transitionStyle": "hard_cut|crossfade|dissolve|whip_pan|jump_cut",
    "captionStyle": "none|subtitle_bar|word_pop|kinetic",
    "musicMood": "none|ambient_chill|upbeat|epic|dramatic|lo_fi|energetic",
    "zoomUsage": "none|minimal|moderate|heavy",
    "brollFrequency": "none|rare|occasional|frequent"
  },
  "styleReasoning": "2-3 sentence explanation of the style classification"
}`
}

export async function detectEditingStyle(transcript) {
  const transcriptSample = buildTranscriptSample(transcript)
  const wpm = computeWordsPerMinute(transcript)

  const stats = {
    durationSec: transcript.durationSec ?? 0,
    wordCount: transcript.summary?.wordCount ?? 0,
    wpm,
    speakerSections: transcript.summary?.speakerSectionCount ?? 0,
    pauseCount: transcript.summary?.pauseCount ?? 0
  }

  const result = await groqChatJson({
    model: config.ai.fastModel,
    temperature: 0.2,
    maxTokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(transcriptSample, stats) }
    ]
  })

  const data = result.data

  const primaryStyle = VALID_STYLES.includes(data.primaryStyle) ? data.primaryStyle : "podcast"
  const secondaryStyle = VALID_STYLES.includes(data.secondaryStyle) ? data.secondaryStyle : null

  // Build allStyles with defaults for any missing keys
  const allStyles = {}
  for (const style of VALID_STYLES) {
    allStyles[style] = Math.min(1, Math.max(0, Number(data.allStyles?.[style] ?? 0)))
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: result.model,
    primaryStyle,
    primaryConfidence: Math.min(1, Math.max(0, Number(data.primaryConfidence ?? 0.5))),
    secondaryStyle,
    secondaryConfidence: Math.min(1, Math.max(0, Number(data.secondaryConfidence ?? 0))),
    allStyles,
    characteristics: {
      paceCategory: data.characteristics?.paceCategory ?? "moderate",
      averageWordsPerMinute: wpm,
      pauseFrequency: data.characteristics?.pauseFrequency ?? "moderate",
      emphasisLevel: data.characteristics?.emphasisLevel ?? "medium",
      estimatedSpeakerCount: Number(data.characteristics?.estimatedSpeakerCount ?? 1)
    },
    editingRecommendations: {
      cutPace: data.editingRecommendations?.cutPace ?? "moderate",
      transitionStyle: data.editingRecommendations?.transitionStyle ?? "crossfade",
      captionStyle: data.editingRecommendations?.captionStyle ?? "subtitle_bar",
      musicMood: data.editingRecommendations?.musicMood ?? "ambient_chill",
      zoomUsage: data.editingRecommendations?.zoomUsage ?? "minimal",
      brollFrequency: data.editingRecommendations?.brollFrequency ?? "occasional"
    },
    styleReasoning: String(data.styleReasoning ?? "")
  }
}
