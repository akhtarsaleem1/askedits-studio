import fs from "node:fs/promises"
import path from "node:path"
import { getBrollKeywords } from "./broll-keyword-service.js"
import { searchBrollVideo, downloadBrollClip } from "./broll-search-service.js"

function sanitizeFormatId(formatId = "original") {
  return String(formatId || "original").replace(/[^a-z0-9_-]/gi, "_")
}

function stripPadBrackets(pad) {
  const text = String(pad)
  return text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text
}

function padRef(pad) {
  return `[${stripPadBrackets(pad)}]`
}

function resolveBrollPath(assetPaths, item, exportFormat) {
  const keyword = String(item.keyword ?? "")
  if (keyword.startsWith("custom:")) {
    return path.join(assetPaths.brollDir, keyword.slice("custom:".length))
  }

  return path.join(assetPaths.brollDir, `broll_${item.id}_${sanitizeFormatId(exportFormat)}.mp4`)
}

export async function prepareBrollClips({ assetPaths, settings, exportFormat }) {
  if (!settings?.enabled) {
    return []
  }

  const keywords = await getBrollKeywords(assetPaths)
  if (keywords.length === 0) {
    return []
  }

  const maxClips = settings.maxClips ?? 5
  const brollToUse = keywords.slice(0, maxClips)
  const preparedClips = []

  for (let i = 0; i < brollToUse.length; i++) {
    const item = brollToUse[i]
    const brollPath = resolveBrollPath(assetPaths, item, exportFormat)
    const isCustomClip = String(item.keyword ?? "").startsWith("custom:")

    // Check if already downloaded
    let exists = false
    try {
      await fs.access(brollPath)
      exists = true
    } catch {
      exists = false
    }

    if (!exists && !isCustomClip) {
      console.log(`[broll] Searching stock APIs for: ${item.keyword} (${exportFormat || "default orientation"})`)
      try {
        const videoUrl = await searchBrollVideo(item.keyword, exportFormat)
        if (videoUrl) {
          console.log(`[broll] Downloading B-roll...`)
          await downloadBrollClip(videoUrl, brollPath)
          exists = true
        } else {
          console.warn(`[broll] No video found for keyword: ${item.keyword}`)
        }
      } catch (err) {
        console.error(`[broll] Error fetching B-roll for '${item.keyword}': ${err.message}`)
      }
    } else if (!exists && isCustomClip) {
      console.warn(`[broll] Custom B-roll file was not found: ${brollPath}`)
    }

    if (exists) {
      preparedClips.push({
        ...item,
        filePath: brollPath
      })
    }
  }

  return preparedClips
}

export function generateBrollFilterGraph({ brollClips, videoMeta, startInputIndex = 1, baseVideoPad = "0:v" }) {
  if (!brollClips || brollClips.length === 0) {
    return { filterGraph: "", nextInputIndex: startInputIndex, inputs: [] }
  }

  let filterChain = ""
  const inputs = []
  let currentVideoPad = stripPadBrackets(baseVideoPad)
  let currentInputIdx = startInputIndex

  brollClips.forEach((clip, index) => {
    // Trust the exact timestamps from the edit plan, including manual timeline edits.
    const startSec = Math.max(0, Number(clip.startSec) || 0)
    const intendedDuration = Math.max(0, (Number(clip.endSec) || 0) - startSec)
    if (intendedDuration <= 0.1) {
      return
    }
    const duration = intendedDuration
    const effectiveEndSec = startSec + duration

    inputs.push(clip.filePath)

    const brollPad = `broll_${index}`
    const outPad = `main_with_broll_${index}`

    // 1. Read input, scale/crop to fit video dimensions
    // 2. Trim to required duration
    // 3. Shift timestamps so it starts at clip.startSec
    filterChain += `[${currentInputIdx}:v]scale=${videoMeta.width}:${videoMeta.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${videoMeta.width}:${videoMeta.height},setsar=1,trim=start=0:end=${duration},setpts=PTS-STARTPTS+${startSec}/TB[${brollPad}];`
    
    // 4. Overlay onto the main video
    filterChain += `${padRef(currentVideoPad)}[${brollPad}]overlay=enable='between(t,${startSec},${effectiveEndSec})':eof_action=pass[${outPad}];`

    currentVideoPad = outPad
    currentInputIdx++
  })

  return {
    filterGraph: filterChain,
    outputPad: currentVideoPad,
    nextInputIndex: currentInputIdx,
    inputs: inputs
  }
}
