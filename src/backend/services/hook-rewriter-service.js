import fs from "node:fs/promises"
import config from "../../../config/default.js"
import { groqChatJson } from "./groq-client.js"

export async function analyzeHook(assetRecord) {
  const transcript = await loadTranscript(assetRecord)
  if (!transcript) throw new Error("Transcript not available for hook analysis.")

  const hookText = extractHookText(transcript, 15)
  const durationSec = assetRecord.media?.durationSec ?? 0
  const style = assetRecord.aiAnalysis?.detectedStyle ?? "podcast"

  const result = await groqChatJson({
    model: config.ai.fastModel,
    temperature: 0.3,
    maxTokens: 1500,
    messages: [
      { role: "system", content: "You are a viral content strategist specializing in video hooks. Analyze hooks and provide actionable feedback. Return only valid JSON." },
      { role: "user", content: `Analyze this video hook (first 15s of a ${style} video, ${durationSec.toFixed(1)}s total):\n\n"${hookText}"\n\nReturn JSON:\n{"hookScore":0-100,"hookType":"question|statement|statistic|story|challenge|shock|none","strengths":["s1"],"weaknesses":["w1"],"retentionPrediction":"low|medium|high|viral","improvementSuggestions":["i1"],"openLoopPresent":true,"emotionalTrigger":"curiosity|fear|excitement|anger|surprise|none"}` }
    ]
  })

  return { hookText, durationSec: Math.min(15, durationSec), style, analysis: result.data }
}

export async function generateHookVariations(assetRecord) {
  const transcript = await loadTranscript(assetRecord)
  if (!transcript) throw new Error("Transcript not available for hook generation.")

  const hookText = extractHookText(transcript, 15)
  const fullContext = extractHookText(transcript, 60)
  const durationSec = assetRecord.media?.durationSec ?? 0
  const style = assetRecord.aiAnalysis?.detectedStyle ?? "podcast"

  const result = await groqChatJson({
    model: config.ai.primaryModel,
    temperature: 0.8,
    maxTokens: 3000,
    messages: [
      { role: "system", content: "You are a world-class YouTube scriptwriter specializing in hooks that maximize viewer retention. Return only valid JSON." },
      { role: "user", content: `Rewrite the hook for this ${style} video (${durationSec.toFixed(1)}s total).\n\nCURRENT HOOK (first 15s):\n"${hookText}"\n\nCONTEXT (first 60s):\n"${fullContext}"\n\nGenerate 5 hook variations. Return JSON:\n{"variations":[{"id":"hook-1","strategy":"question|statistic|controversy|story|challenge","strategyLabel":"name","rewrittenText":"text","captionTimings":[{"startSec":0.0,"endSec":3.0,"text":"caption","style":"bold_pop"}],"engagementScore":0-100,"whyItWorks":"reason","suggestedVisuals":"visuals"}]}` }
    ]
  })

  return { currentHook: hookText, variations: result.data?.variations ?? [] }
}

export async function applyHookRewrite(assetRecord, hookVariant) {
  let editPlan
  try {
    const raw = await fs.readFile(assetRecord.paths.editPlanFile, "utf8")
    editPlan = JSON.parse(raw)
  } catch {
    throw new Error("No edit plan found to apply hook rewrite to.")
  }

  if (!editPlan?.timeline) {
    throw new Error("No edit plan timeline found.")
  }

  const updatedPlan = JSON.parse(JSON.stringify(editPlan))

  // Remove existing captions in the first 15 seconds
  updatedPlan.timeline.captions = (updatedPlan.timeline.captions ?? []).filter(c => c.startSec >= 15)

  // Add new hook captions
  if (hookVariant.captionTimings?.length > 0) {
    const newCaptions = hookVariant.captionTimings.map((ct, i) => ({
      id: `hook-caption-${i}`, startSec: ct.startSec, endSec: ct.endSec,
      text: ct.text, style: ct.style ?? "bold_pop", animation: "pop_in", highlightWords: []
    }))
    updatedPlan.timeline.captions = [...newCaptions, ...updatedPlan.timeline.captions]
  }

  // Add hook transition cut
  const hookEnd = hookVariant.captionTimings?.length > 0
    ? Math.max(...hookVariant.captionTimings.map(ct => ct.endSec)) : 10

  const hasHookCut = (updatedPlan.timeline.cuts ?? []).some(c => Math.abs(c.timeSec - hookEnd) < 1)
  if (!hasHookCut) {
    updatedPlan.timeline.cuts = [
      { id: "hook-cut", type: "hard_cut", timeSec: hookEnd, reason: "Hook transition" },
      ...(updatedPlan.timeline.cuts ?? [])
    ]
  }

  updatedPlan.summary = {
    ...updatedPlan.summary,
    totalCaptions: updatedPlan.timeline.captions.length,
    totalCuts: updatedPlan.timeline.cuts.length,
    hookStrategy: hookVariant.strategy
  }

  return updatedPlan
}

function extractHookText(transcript, maxSec) {
  const sentences = transcript.sentenceGroups ?? []
  return sentences.filter(s => (s.startSec ?? 0) < maxSec).map(s => s.text).join(" ").trim()
}

async function loadTranscript(assetRecord) {
  try {
    const raw = await fs.readFile(assetRecord.paths.transcriptFile, "utf8")
    return JSON.parse(raw)
  } catch { return null }
}
