import { groqChatJson } from "./groq-client.js"
import config from "../../../config/default.js"

export async function regenerateEditPlanSection({ currentEditPlan, transcript, styleAnalysis, mode, durationSec }) {
  // mode can be: captions, broll, cinematic, faster, tiktok
  
  let systemPrompt = `You are an expert video editor. You are modifying an existing JSON edit plan.
Return ONLY the modified JSON structure requested.`

  let userPrompt = `Here is the current edit plan:\n${JSON.stringify(currentEditPlan, null, 2)}\n\n`
  
  // Create a deep copy to avoid mutating the original until we merge
  const newPlan = JSON.parse(JSON.stringify(currentEditPlan))

  let targetSection = ""

  if (mode === "captions") {
    targetSection = "timeline.captions"
    userPrompt += `Task: Regenerate the 'timeline.captions' array. Create more dynamic, engaging captions. Break them into shorter phrases (1-3 words max). Use different animation styles.`
  } else if (mode === "broll") {
    targetSection = "timeline.broll"
    userPrompt += `Task: Regenerate the 'timeline.broll' array. Suggest 3-5 new b-roll placements with highly specific 'suggestedQuery' values that are cinematic and visually interesting.`
  } else if (mode === "cinematic") {
    targetSection = "timeline"
    userPrompt += `Task: Modify the entire timeline to be more cinematic. 
- Change all zoom types to 'ken_burns' or 'slow_push'.
- Reduce the frequency of cuts (make them slower).
- Change caption styles to 'cinematic' or 'documentary'.`
  } else if (mode === "faster") {
    targetSection = "timeline"
    userPrompt += `Task: Modify the timeline to be much faster paced.
- Add more frequent cuts.
- Change zoom types to 'punch_in' or 'whip_pan'.
- Add more 'pop_in' animations to captions.`
  } else if (mode === "tiktok") {
    targetSection = "timeline"
    userPrompt += `Task: Modify the timeline to fit a high-energy TikTok/Reels style.
- Use 'tiktok' or 'hormozi' caption styles exclusively.
- Ensure captions are very fast (1-2 words).
- Add more frequent punch-in zooms.`
  } else {
    throw new Error(`Unknown regeneration mode: ${mode}`)
  }

  userPrompt += `\n\nReturn a JSON object containing ONLY the updated '${targetSection.split('.')[0]}' key and its children.`

  const result = await groqChatJson({
    model: config.ai.primaryModel,
    temperature: 0.7, // higher temperature for more creative variations
    maxTokens: 6000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  })

  // Merge the result back into the plan
  if (mode === "captions" || mode === "broll") {
    // Expecting result to contain { timeline: { captions: [] } }
    if (result.data?.timeline?.[mode]) {
      newPlan.timeline[mode] = result.data.timeline[mode]
    } else if (result.data?.[mode]) {
      newPlan.timeline[mode] = result.data[mode]
    }
  } else {
    // For style modifiers, expecting { timeline: { cuts, zooms, captions... } }
    if (result.data?.timeline) {
      newPlan.timeline = { ...newPlan.timeline, ...result.data.timeline }
    }
  }

  // Update summary
  newPlan.summary = {
    ...newPlan.summary,
    totalCuts: newPlan.timeline.cuts?.length || 0,
    totalCaptions: newPlan.timeline.captions?.length || 0,
    totalZooms: newPlan.timeline.zooms?.length || 0,
    totalBroll: newPlan.timeline.broll?.length || 0
  }

  return newPlan
}
