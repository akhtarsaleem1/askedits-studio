import fs from "node:fs/promises"
import path from "node:path"

import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"
import { groqChatJson } from "./groq-client.js"

/**
 * Generate AI-powered thumbnails for a video asset.
 * Extracts candidate frames from viral moments and high-energy scenes,
 * uses Groq AI to select best frames and suggest text overlays,
 * then composites final thumbnails with FFmpeg.
 */
export async function generateAiThumbnails(assetRecord) {
  const paths = assetRecord.paths
  const durationSec = assetRecord.media?.durationSec ?? 0
  const viralMoments = assetRecord.aiAnalysis?.timeline?.zooms ?? []
  const transcript = assetRecord.transcript

  // Ensure AI thumbnails directory exists
  const aiThumbDir = path.join(paths.thumbnailsDir, "ai")
  await fs.mkdir(aiThumbDir, { recursive: true })

  // 1. Determine candidate timestamps for frame extraction
  const candidateTimestamps = selectCandidateTimestamps(durationSec, assetRecord.aiAnalysis)
  console.log(`[thumbnails] Extracting ${candidateTimestamps.length} candidate frames...`)

  // 2. Extract candidate frames
  const candidatePaths = []
  for (let i = 0; i < candidateTimestamps.length; i++) {
    const framePath = path.join(aiThumbDir, `candidate-${i}.jpg`)
    await extractFrame(paths.originalFile, framePath, candidateTimestamps[i])
    candidatePaths.push({ path: framePath, timeSec: candidateTimestamps[i], index: i })
  }

  // 3. Use Groq AI to select best frames and generate text suggestions
  const aiSuggestions = await getAiThumbnailSuggestions(assetRecord, candidateTimestamps)

  // 4. Generate final thumbnails with text overlays
  const thumbnails = []

  for (let i = 0; i < aiSuggestions.thumbnails.length; i++) {
    const suggestion = aiSuggestions.thumbnails[i]
    const candidateIdx = suggestion.frameIndex ?? (i % candidatePaths.length)
    const sourcePath = candidatePaths[candidateIdx]?.path ?? candidatePaths[0].path

    // Clean version (no text)
    const cleanPath = path.join(aiThumbDir, `thumb-${i}-clean.jpg`)
    await createStyledThumbnail(sourcePath, cleanPath, {
      style: suggestion.style ?? "vibrant"
    })

    // Text overlay version
    const textPath = path.join(aiThumbDir, `thumb-${i}-text.jpg`)
    await createStyledThumbnail(sourcePath, textPath, {
      style: suggestion.style ?? "vibrant",
      titleText: suggestion.titleText,
      subtitleText: suggestion.subtitleText
    })

    // Dramatic crop version (zoom into center)
    const cropPath = path.join(aiThumbDir, `thumb-${i}-crop.jpg`)
    await createStyledThumbnail(sourcePath, cropPath, {
      style: suggestion.style ?? "vibrant",
      crop: true,
      titleText: suggestion.titleText
    })

    thumbnails.push({
      id: `ai-thumb-${i}`,
      frameTimeSec: candidateTimestamps[candidateIdx] ?? 0,
      titleText: suggestion.titleText,
      subtitleText: suggestion.subtitleText,
      style: suggestion.style,
      reason: suggestion.reason,
      variants: {
        clean: `/api/uploads/${assetRecord.assetId}/assets/ai-thumbnail:thumb-${i}-clean.jpg`,
        text: `/api/uploads/${assetRecord.assetId}/assets/ai-thumbnail:thumb-${i}-text.jpg`,
        crop: `/api/uploads/${assetRecord.assetId}/assets/ai-thumbnail:thumb-${i}-crop.jpg`
      }
    })
  }

  // Save thumbnail metadata
  const metaPath = path.join(aiThumbDir, "thumbnails.json")
  const metadata = {
    generatedAt: new Date().toISOString(),
    count: thumbnails.length,
    thumbnails
  }
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2))

  return metadata
}

/**
 * Select candidate timestamps for frame extraction.
 */
function selectCandidateTimestamps(durationSec, aiAnalysis) {
  const timestamps = new Set()

  // Add evenly spaced timestamps
  const intervals = Math.min(8, Math.max(4, Math.floor(durationSec / 5)))
  for (let i = 0; i < intervals; i++) {
    const t = (durationSec / (intervals + 1)) * (i + 1)
    timestamps.add(Number(t.toFixed(2)))
  }

  // Add timestamps from viral moments / zooms
  const zooms = aiAnalysis?.timeline?.zooms ?? []
  for (const zoom of zooms.slice(0, 4)) {
    const midpoint = ((zoom.startSec ?? 0) + (zoom.endSec ?? 0)) / 2
    if (midpoint > 0 && midpoint < durationSec) {
      timestamps.add(Number(midpoint.toFixed(2)))
    }
  }

  // Add timestamps from broll moments
  const broll = aiAnalysis?.timeline?.broll ?? []
  for (const b of broll.slice(0, 3)) {
    if (b.startSec > 0 && b.startSec < durationSec) {
      timestamps.add(Number(b.startSec.toFixed(2)))
    }
  }

  return Array.from(timestamps).sort((a, b) => a - b).slice(0, 12)
}

/**
 * Extract a single frame from a video using FFmpeg.
 */
async function extractFrame(videoPath, outputPath, timeSec) {
  await runCommand({
    command: config.media.ffmpegBin,
    args: [
      "-y", "-ss", timeSec.toFixed(2), "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
      "-q:v", "2",
      outputPath
    ],
    notFoundMessage: "FFmpeg not found."
  })
}

/**
 * Use Groq AI to analyze candidate frames and suggest thumbnail text/style.
 */
async function getAiThumbnailSuggestions(assetRecord, candidateTimestamps) {
  const transcript = assetRecord.transcript
  const style = assetRecord.aiAnalysis?.detectedStyle ?? "podcast"
  const title = assetRecord.originalName?.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") ?? "Video"

  const result = await groqChatJson({
    model: config.ai.primaryModel,
    temperature: 0.7,
    maxTokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are a viral YouTube thumbnail designer. Generate eye-catching, click-worthy thumbnail text overlays. Return only valid JSON.`
      },
      {
        role: "user",
        content: `Generate 3 thumbnail variations for this video.

VIDEO DETAILS:
- Title: "${title}"
- Duration: ${assetRecord.media?.durationSec ?? 0}s
- Style: ${style}
- Word count: ${transcript?.wordCount ?? 0}
- Candidate frame timestamps: ${candidateTimestamps.join(", ")}s

Generate thumbnails optimized for YouTube CTR. Return JSON:
{
  "thumbnails": [
    {
      "frameIndex": 0,
      "titleText": "SHORT BOLD TEXT (3-6 words max)",
      "subtitleText": "optional subtitle or empty string",
      "style": "vibrant|dramatic|minimal|bold|neon",
      "reason": "why this thumbnail works"
    }
  ]
}

Rules:
- Use CAPS for title text for maximum impact
- Keep titles extremely short and punchy
- Use emotional triggers (curiosity, shock, controversy)
- Each thumbnail should have a different approach`
      }
    ]
  })

  return result.data ?? { thumbnails: [{ frameIndex: 0, titleText: title.toUpperCase(), subtitleText: "", style: "vibrant", reason: "Default" }] }
}

/**
 * Create a styled thumbnail using FFmpeg filters.
 */
async function createStyledThumbnail(inputPath, outputPath, options = {}) {
  const filters = []

  // Crop (zoom into center) if requested
  if (options.crop) {
    filters.push("crop=iw*0.7:ih*0.7:(iw-iw*0.7)/2:(ih-ih*0.7)/2")
    filters.push("scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2")
    filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2")
  }

  // Style-based color grading
  const style = options.style ?? "vibrant"
  if (style === "vibrant") {
    filters.push("eq=saturation=1.4:contrast=1.2:brightness=0.05")
    filters.push("unsharp=5:5:1.0")
  } else if (style === "dramatic") {
    filters.push("eq=saturation=0.8:contrast=1.5:brightness=-0.05")
    filters.push("vignette=PI/4")
  } else if (style === "neon") {
    filters.push("eq=saturation=1.8:contrast=1.3:brightness=0.08")
    filters.push("unsharp=5:5:1.5")
  } else if (style === "bold") {
    filters.push("eq=saturation=1.2:contrast=1.4")
    filters.push("vignette=PI/5")
  }
  // minimal: no extra processing

  // Text overlay
  if (options.titleText) {
    const escapedTitle = options.titleText.replace(/'/g, "'\\''").replace(/:/g, "\\:")
    filters.push(
      `drawtext=text='${escapedTitle}':fontsize=72:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-40:font=Arial`
    )
  }

  if (options.subtitleText) {
    const escapedSub = options.subtitleText.replace(/'/g, "'\\''").replace(/:/g, "\\:")
    filters.push(
      `drawtext=text='${escapedSub}':fontsize=36:fontcolor=yellow:borderw=2:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2+50:font=Arial`
    )
  }

  const filterStr = filters.length > 0 ? filters.join(",") : "copy"

  await runCommand({
    command: config.media.ffmpegBin,
    args: ["-y", "-i", inputPath, "-vf", filterStr, "-q:v", "2", outputPath],
    notFoundMessage: "FFmpeg not found."
  })
}

/**
 * List generated AI thumbnails for an asset.
 */
export async function listAiThumbnails(assetRecord) {
  const aiThumbDir = path.join(assetRecord.paths.thumbnailsDir, "ai")
  const metaPath = path.join(aiThumbDir, "thumbnails.json")

  try {
    const raw = await fs.readFile(metaPath, "utf8")
    return JSON.parse(raw)
  } catch {
    return { count: 0, thumbnails: [] }
  }
}
