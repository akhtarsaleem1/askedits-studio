import fs from "node:fs/promises"

import { detectEditingStyle } from "./style-detection-service.js"
import { detectViralMoments } from "./viral-moment-service.js"
import { generateEditPlan } from "./edit-plan-service.js"

async function readTranscript(transcriptPath) {
  try {
    const raw = await fs.readFile(transcriptPath, "utf8")
    return JSON.parse(raw)
  } catch {
    throw new Error("Structured transcript not found. Ensure transcription completed before AI analysis.")
  }
}

function fallbackStyleAnalysis(transcript) {
  const wordCount = transcript?.summary?.wordCount ?? 0
  const durationSec = transcript?.durationSec ?? 0
  const wordsPerMinute = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0

  return {
    primaryStyle: wordsPerMinute >= 140 ? "tiktok" : "podcast",
    primaryConfidence: 0.52,
    pacing: wordsPerMinute >= 140 ? "fast" : "moderate",
    speechRateWpm: wordsPerMinute,
    editingRecommendations: {
      cutPace: wordsPerMinute >= 140 ? "fast" : "moderate",
      transitionStyle: "hard_cut",
      captionStyle: wordsPerMinute >= 140 ? "word_pop" : "subtitle_bar",
      musicMood: "ambient_chill",
      zoomUsage: wordsPerMinute >= 140 ? "moderate" : "minimal",
      brollFrequency: "rare"
    },
    provider: "local-fallback",
    generatedAt: new Date().toISOString()
  }
}

function fallbackViralMoments(transcript) {
  const durationSec = transcript?.durationSec ?? 0
  const sentenceGroups = Array.isArray(transcript?.sentenceGroups) ? transcript.sentenceGroups : []
  const first = sentenceGroups[0]
  const middle = sentenceGroups[Math.floor(sentenceGroups.length / 2)]

  const moments = []
  if (first) {
    moments.push({
      id: "fallback-hook-1",
      type: "hook",
      title: "Opening hook",
      startSec: first.startSec ?? 0,
      endSec: Math.min(durationSec || 4, (first.endSec ?? 2) + 1.5),
      viralScore: 0.66,
      reason: "First spoken segment"
    })
  }

  if (middle) {
    moments.push({
      id: "fallback-peak-1",
      type: "engagement_peak",
      title: "Midpoint highlight",
      startSec: Math.max(0, (middle.startSec ?? 0) - 0.5),
      endSec: Math.min(durationSec || (middle.endSec ?? 0) + 1, (middle.endSec ?? 0) + 1),
      viralScore: 0.59,
      reason: "Mid-video content emphasis"
    })
  }

  return {
    moments,
    summary: {
      totalMoments: moments.length,
      hookCount: moments.filter((m) => m.type === "hook").length,
      topViralClips: Math.min(1, moments.length)
    },
    provider: "local-fallback",
    generatedAt: new Date().toISOString()
  }
}

function fallbackEditPlan(transcript, viralMoments, styleAnalysis) {
  const durationSec = Number(transcript?.durationSec ?? 0)
  const sentenceGroups = Array.isArray(transcript?.sentenceGroups) ? transcript.sentenceGroups : []
  const cappedSentences = sentenceGroups.slice(0, 16)

  const captions = cappedSentences.map((s, index) => ({
    id: `caption-fallback-${index + 1}`,
    startSec: Number(s.startSec ?? 0),
    endSec: Number(s.endSec ?? Math.min(durationSec, Number(s.startSec ?? 0) + 2.2)),
    text: String(s.translatedText ?? s.text ?? "").trim() || " ",
    style: styleAnalysis?.editingRecommendations?.captionStyle === "word_pop" ? "word_pop" : "subtitle_bar",
    animation: "fade_up",
    highlightWords: []
  }))

  const cuts = []
  for (let i = 1; i < cappedSentences.length; i++) {
    const t = Number(cappedSentences[i].startSec ?? 0)
    if (t > 0.2 && t < durationSec - 0.2) {
      cuts.push({
        id: `cut-fallback-${cuts.length + 1}`,
        type: "hard_cut",
        timeSec: t,
        reason: "Sentence transition"
      })
    }
  }

  const zooms = (viralMoments?.moments ?? []).slice(0, 2).map((m, idx) => ({
    id: `zoom-fallback-${idx + 1}`,
    startSec: Number(m.startSec ?? 0),
    endSec: Number(m.endSec ?? Math.min(durationSec, Number(m.startSec ?? 0) + 2.2)),
    zoomLevel: 1.16,
    target: "center",
    reason: m.title ?? "Key moment"
  }))

  const shortFormClips = durationSec > 8
    ? [{
        id: "clip-fallback-1",
        title: "Auto highlight",
        startSec: Math.max(0, (viralMoments?.moments?.[0]?.startSec ?? 0)),
        endSec: Math.min(durationSec, Math.max(15, (viralMoments?.moments?.[0]?.endSec ?? 0) + 12)),
        aspectRatio: "9:16",
        platform: "tiktok",
        viralMomentIds: viralMoments?.moments?.[0] ? [viralMoments.moments[0].id] : [],
        estimatedEngagement: "medium"
      }]
    : []

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: "local-fallback",
    videoDurationSec: durationSec,
    detectedStyle: styleAnalysis?.primaryStyle ?? "podcast",
    timeline: {
      cuts,
      captions,
      zooms,
      broll: [],
      sfx: [],
      transitions: [],
      music: [],
      filters: [],
      animations: []
    },
    shortFormClips,
    summary: {
      totalCuts: cuts.length,
      totalCaptions: captions.length,
      totalZooms: zooms.length,
      totalBroll: 0,
      totalSfx: 0,
      shortFormClipCount: shortFormClips.length,
      estimatedEditedDurationSec: Math.max(0, durationSec),
      editingComplexity: "simple"
    }
  }
}

export async function runAiAnalysis(record) {
  const paths = record.paths

  await fs.mkdir(paths.aiDir, { recursive: true })

  const transcript = await readTranscript(paths.transcriptFile)

  let viralMoments = null
  let styleAnalysis = null
  let editPlan = null
  let fallbackReason = null

  try {
    const [viral, style] = await Promise.all([
      detectViralMoments(transcript),
      detectEditingStyle(transcript)
    ])
    viralMoments = viral
    styleAnalysis = style

    editPlan = await generateEditPlan(transcript, viralMoments, styleAnalysis)
  } catch (error) {
    fallbackReason = error.message
    console.warn(`[ai] AI analysis fallback activated: ${fallbackReason}`)
    styleAnalysis = fallbackStyleAnalysis(transcript)
    viralMoments = fallbackViralMoments(transcript)
    editPlan = fallbackEditPlan(transcript, viralMoments, styleAnalysis)
  }

  await Promise.all([
    fs.writeFile(paths.viralMomentsFile, JSON.stringify(viralMoments, null, 2)),
    fs.writeFile(paths.styleAnalysisFile, JSON.stringify(styleAnalysis, null, 2)),
    fs.writeFile(paths.editPlanFile, JSON.stringify(editPlan, null, 2))
  ])

  return {
    status: "ready",
    model: editPlan.model,
    detectedStyle: styleAnalysis.primaryStyle,
    styleConfidence: styleAnalysis.primaryConfidence,
    viralMomentCount: viralMoments.summary.totalMoments,
    topViralClipCount: viralMoments.summary.topViralClips,
    shortFormClipCount: editPlan.summary.shortFormClipCount,
    totalCuts: editPlan.summary.totalCuts,
    totalCaptions: editPlan.summary.totalCaptions,
    editingComplexity: editPlan.summary.editingComplexity,
    generatedAt: editPlan.generatedAt,
    ...(fallbackReason ? { fallback: true, fallbackReason } : {})
  }
}
