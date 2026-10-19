import fs from "node:fs/promises"

/**
 * Extracts B-roll keywords and timing from the edit plan.
 * Manual timeline positions are authoritative so preview and export agree.
 */
export async function getBrollKeywords(assetPaths) {
  try {
    const data = await fs.readFile(assetPaths.editPlanFile, "utf8")
    const editPlan = JSON.parse(data)

    if (!editPlan?.timeline?.broll?.length) {
      return []
    }

    return editPlan.timeline.broll.map((b) => ({
      id: b.id,
      keyword: b.suggestedQuery,
      startSec: b.startSec,
      endSec: b.endSec,
      purpose: b.purpose
    }))
  } catch (err) {
    console.warn(`[broll] Failed to read edit plan for B-roll keywords: ${err.message}`)
    return []
  }
}
