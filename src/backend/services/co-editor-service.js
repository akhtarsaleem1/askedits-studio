import fs from "node:fs/promises"
import config from "../../../config/default.js"
import { openrouterChatJson } from "./groq-client.js"

/**
 * AI Co-Editor: Process natural language editing commands and modify the edit plan accordingly.
 * Uses OpenRouter EXCLUSIVELY for co-editor chat interactions.
 */
export async function processCoEditorCommand(assetRecord, command, chatHistory = []) {
  let editPlan
  try {
    const raw = await fs.readFile(assetRecord.paths.editPlanFile, "utf8")
    editPlan = JSON.parse(raw)
  } catch {
    throw new Error("No edit plan available. Generate an edit plan first.")
  }

  if (!editPlan?.timeline) throw new Error("Edit plan is missing timeline data.")

  const durationSec = assetRecord.media?.durationSec ?? editPlan.videoDurationSec ?? 60
  const style = editPlan.detectedStyle ?? "podcast"

  // Build conversation messages
  const messages = [
    { role: "system", content: buildCoEditorSystemPrompt(durationSec, style) },
    ...chatHistory.slice(-(config.coEditor?.maxHistoryMessages ?? 20)),
    {
      role: "user",
      content: `Current edit plan:\n${JSON.stringify(editPlan.timeline, null, 2)}\n\nUser command: "${command}"\n\nModify the edit plan according to the user's command. Return JSON:\n{"modifiedTimeline":{...the full modified timeline...},"changesDescription":"what you changed and why","changesSummary":[{"type":"added|removed|modified","section":"cuts|captions|zooms|broll|sfx|music|filters","count":0,"detail":"brief detail"}]}`
    }
  ]

  // Use OpenRouter exclusively for co-editor
  const result = await openrouterChatJson({
    model: config.ai.openrouterPrimaryModel ?? config.ai.primaryModel,
    temperature: config.coEditor?.temperature ?? 0.6,
    maxTokens: 6000,
    messages
  })

  const data = result.data
  if (!data?.modifiedTimeline) throw new Error("AI did not return a valid modified timeline.")

  // Merge modified timeline into plan
  const updatedPlan = JSON.parse(JSON.stringify(editPlan))
  updatedPlan.timeline = {
    cuts: Array.isArray(data.modifiedTimeline.cuts) ? data.modifiedTimeline.cuts : updatedPlan.timeline.cuts,
    captions: Array.isArray(data.modifiedTimeline.captions) ? data.modifiedTimeline.captions : updatedPlan.timeline.captions,
    zooms: Array.isArray(data.modifiedTimeline.zooms) ? data.modifiedTimeline.zooms : updatedPlan.timeline.zooms,
    broll: Array.isArray(data.modifiedTimeline.broll) ? data.modifiedTimeline.broll : updatedPlan.timeline.broll,
    sfx: Array.isArray(data.modifiedTimeline.sfx) ? data.modifiedTimeline.sfx : updatedPlan.timeline.sfx,
    transitions: Array.isArray(data.modifiedTimeline.transitions) ? data.modifiedTimeline.transitions : updatedPlan.timeline.transitions ?? [],
    music: Array.isArray(data.modifiedTimeline.music) ? data.modifiedTimeline.music : updatedPlan.timeline.music ?? [],
    filters: Array.isArray(data.modifiedTimeline.filters) ? data.modifiedTimeline.filters : updatedPlan.timeline.filters ?? [],
    animations: Array.isArray(data.modifiedTimeline.animations) ? data.modifiedTimeline.animations : updatedPlan.timeline.animations ?? []
  }

  updatedPlan.summary = {
    ...updatedPlan.summary,
    totalCuts: updatedPlan.timeline.cuts.length,
    totalCaptions: updatedPlan.timeline.captions.length,
    totalZooms: updatedPlan.timeline.zooms.length,
    totalBroll: updatedPlan.timeline.broll.length,
    totalSfx: (updatedPlan.timeline.sfx ?? []).length,
    lastCoEditorCommand: command
  }

  return {
    updatedPlan,
    response: data.changesDescription ?? "Changes applied.",
    changesSummary: data.changesSummary ?? [],
    model: result.model
  }
}

function buildCoEditorSystemPrompt(durationSec, style) {
  return `You are an expert AI video co-editor. The user gives you natural language commands to modify a video edit plan.

RULES:
- All timestamps must be within 0 to ${durationSec.toFixed(1)} seconds
- Preserve existing elements unless the user specifically asks to change them
- When adding elements, use unique IDs (e.g., "co-cut-1", "co-zoom-1")
- Be creative but practical — all edits must be achievable with FFmpeg
- The current video style is "${style}"

COMMAND INTERPRETATION GUIDE:
- "Make more cinematic" → Slow zooms (ken_burns/slow_push), moody color grading, dramatic transitions, cinematic caption style
- "Add more memes" → More SFX (pop sounds, whooshes), fast cuts, pop-in animations, gaming/tiktok caption styles
- "Make faster" → More frequent cuts, shorter caption durations, punch-in zooms, higher energy
- "Make slower" → Fewer cuts, longer caption durations, gentle zoom effects
- "Add dramatic music" → Add/modify music tracks with dramatic mood, high energy level
- "Add more B-roll" → Add more B-roll placements with relevant search queries
- "Remove captions" → Clear the captions array
- "Make it TikTok style" → Fast cuts, word-pop captions, high energy, punch-in zooms
- "Add humor" → Funny SFX, pop-in animations, quirky transitions

Return the COMPLETE modified timeline (all sections), not just the changed parts.`
}
