import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { searchPixabaySfx, downloadSfxClip } from "./sfx-search-service.js"

/**
 * SFX Engine — Automatically inserts sound effects at transitions and cuts using Pixabay API.
 */

export async function prepareSfxPlacements({ assetPaths, editPlan, settings }) {
  if (!settings?.enabled) {
    return []
  }

  const placements = []
  
  if (!editPlan?.timeline?.sfx || editPlan.timeline.sfx.length === 0) {
    return []
  }

  for (const sfx of editPlan.timeline.sfx) {
    // The AI suggests a query like "cinematic swoosh" or "mouse click"
    const keyword = sfx.suggestedQuery || "whoosh transition"

    const keywordHash = crypto.createHash("md5").update(keyword).digest("hex")
    const cachedFilePath = path.join(assetPaths.sfxDir, `${keywordHash}.mp3`)
    
    // Check if we already downloaded this keyword for this asset
    if (fs.existsSync(cachedFilePath)) {
      placements.push({ timeSec: sfx.timeSec, filePath: cachedFilePath })
      continue
    }

    try {
      const url = await searchPixabaySfx(keyword)
      if (url) {
        if (url.startsWith("local:")) {
          // It's a local file in the public directory
          const localRelPath = url.replace("local:", "")
          const localAbsPath = path.join(process.cwd(), "public", localRelPath)
          
          if (fs.existsSync(localAbsPath)) {
            fs.copyFileSync(localAbsPath, cachedFilePath)
            placements.push({ timeSec: sfx.timeSec, filePath: cachedFilePath })
          } else {
            console.warn(`[sfx] Local SFX file not found: ${localAbsPath}`)
          }
        } else {
          // It's a remote URL from Pixabay
          await downloadSfxClip(url, cachedFilePath)
          placements.push({ timeSec: sfx.timeSec, filePath: cachedFilePath })
        }
      }
    } catch (err) {
      console.warn(`[sfx] Failed to fetch SFX for '${keyword}': ${err.message}`)
    }
  }

  return placements
}

export function generateSfxFilterGraph({ placements, startInputIndex = 1 }) {
  if (!placements || placements.length === 0) {
    return { filterGraph: "", nextInputIndex: startInputIndex, inputs: [], outputPad: "" }
  }

  let filterChain = ""
  const inputs = []
  const delayedPads = []
  let currentInputIdx = startInputIndex

  placements.forEach((sfx) => {
    inputs.push(sfx.filePath)
    const delayedPad = `sfx_delayed_${currentInputIdx}`
    
    // Delay the SFX by the specified timestamp (in milliseconds)
    const delayMs = Math.round(sfx.timeSec * 1000)
    filterChain += `[${currentInputIdx}:a]adelay=${delayMs}|${delayMs}[${delayedPad}];`
    
    delayedPads.push(`[${delayedPad}]`)
    currentInputIdx++
  })

  // Mix all delayed SFX tracks together into one master SFX track
  const masterSfxPad = `master_sfx`
  if (delayedPads.length === 1) {
    // No need to amix if there's only one
    filterChain += `${delayedPads[0]}anull[${masterSfxPad}];`
  } else {
    // Use amix to combine all SFX. normalize=0 prevents volume dropping when mixing
    filterChain += `${delayedPads.join("")}amix=inputs=${delayedPads.length}:duration=longest:dropout_transition=0:normalize=0[${masterSfxPad}];`
  }

  return {
    filterGraph: filterChain,
    outputPad: masterSfxPad,
    nextInputIndex: currentInputIdx,
    inputs: inputs
  }
}
