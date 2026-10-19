import fs from "node:fs/promises"
import path from "node:path"

import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"
import { generateCutFilters } from "./cut-engine.js"
import { generateCaptionAss, generateCaptionFilter } from "./caption-engine.js"
import { generateZoomFilter } from "./zoom-engine.js"
import { generateEffectFilters } from "./filter-engine.js"
import { prepareBrollClips, generateBrollFilterGraph } from "./broll-engine.js"
import { prepareSfxPlacements, generateSfxFilterGraph } from "./sfx-engine.js"
import { generateAudioEnhanceFilters } from "./audio-enhance-engine.js"
import { generateExportScaleFilter, EXPORT_QUALITIES, EXPORT_FORMATS } from "./export-presets.js"
import { buildGpuEncoderArgs } from "./gpu-ffmpeg-builder.js"

export async function generateAutoEdit(assetId, assetRecord, settings, renderId, onProgress) {
  const paths = assetRecord.paths
  const durationSec = assetRecord.media.durationSec
  
  // Get output paths
  const outputPath = path.join(paths.rendersDir, `${renderId}.mp4`)
  const assPath = path.join(paths.rendersDir, `${renderId}.ass`)
  const edlPath = path.join(paths.rendersDir, `${renderId}-edl.json`)

  // Load Edit Plan
  let editPlan = null
  try {
    const raw = await fs.readFile(paths.editPlanFile, "utf8")
    editPlan = JSON.parse(raw)
  } catch (err) {
    console.warn(`[media] Could not load edit plan: ${err.message}`)
    editPlan = {}
  }

  const targetFormat = settings.exportFormat || "original"
  let targetWidth = assetRecord.media.width
  let targetHeight = assetRecord.media.height
  if (targetFormat !== "original" && EXPORT_FORMATS[targetFormat]) {
    targetWidth = EXPORT_FORMATS[targetFormat].width
    targetHeight = EXPORT_FORMATS[targetFormat].height
  }
  const targetMeta = { ...assetRecord.media, width: targetWidth, height: targetHeight }

  // 1. Generate Captions (creates the .ass file)
  let transcriptData = null
  try {
    const fileData = await fs.readFile(paths.transcriptFile, "utf8")
    transcriptData = JSON.parse(fileData)
  } catch (err) {
    console.warn(`[media] Could not load transcript for captions: ${err.message}`)
  }

  await generateCaptionAss({
    transcript: transcriptData,
    settings: settings.captions,
    videoMeta: targetMeta, // Use targetMeta instead of assetRecord.media
    outputPath: assPath,
    editPlan
  })

  // 2. Prepare Secondary Assets (B-Roll, SFX)
  const brollClips = await prepareBrollClips({
    assetPaths: paths,
    settings: settings.broll,
    exportFormat: targetFormat
  })

  const sfxPlacements = await prepareSfxPlacements({
    assetPaths: paths,
    editPlan: editPlan,
    settings: settings.audio?.sfx
  })

  // 3. Build Video Filter Graph
  let complexFilter = ""
  let currentMainPad = "[0:v]"
  
  // Zoom
  const zoom = generateZoomFilter({
    durationSec,
    videoMeta: assetRecord.media,
    faceData: assetRecord.sceneAnalysis?.faceDetection,
    editPlan: editPlan,
    settings: settings.zooms
  })
  if (zoom.filterGraph) {
    complexFilter += `${currentMainPad}${zoom.filterGraph}[v_zoomed];`
    currentMainPad = "[v_zoomed]"
  }

  // Filters (Color / VFX)
  const vfx = generateEffectFilters({
    settings: settings.filter
  })
  if (vfx.filterGraph) {
    complexFilter += `${currentMainPad}${vfx.filterGraph}[v_vfx];`
    currentMainPad = "[v_vfx]"
  }

  // Export Scaling/Padding
  const exportScale = generateExportScaleFilter({
    formatId: targetFormat,
    sourceMeta: assetRecord.media,
    resizeMode: settings.exportResizeMode || "crop_to_fill"
  })
  if (exportScale) {
    complexFilter += `${currentMainPad}${exportScale}[v_scaled];`
    currentMainPad = "[v_scaled]"
  }

  // Generate B-Roll Filter Graph
  const broll = generateBrollFilterGraph({
    brollClips,
    videoMeta: targetMeta,
    startInputIndex: 1,
    baseVideoPad: currentMainPad
  })
  if (broll.filterGraph) {
    complexFilter += broll.filterGraph
    currentMainPad = `[${broll.outputPad}]`
  }

  // Captions burn-in
  const captions = generateCaptionFilter({
    settings: settings.captions,
    assPath: assPath
  })
  if (captions.filterGraph) {
    complexFilter += `${currentMainPad}${captions.filterGraph}[v_captioned];`
    currentMainPad = "[v_captioned]"
  }

  let videoProcessedPad = currentMainPad

  // Generate SFX Filter Graph
  const sfx = generateSfxFilterGraph({
    placements: sfxPlacements,
    startInputIndex: broll.nextInputIndex
  })

  // Load Silence Detection Data from file
  let silenceData = null
  try {
    const rawSilence = await fs.readFile(paths.silenceDetectionFile, "utf8")
    silenceData = JSON.parse(rawSilence)
  } catch (err) {
    console.warn(`[media] Could not load silence detection data: ${err.message}`)
  }

  // 5. Combine everything into FFmpeg args
  const args = [
    "-y", // overwrite
    "-i", paths.originalFile
  ]

  // Add B-roll inputs
  if (broll.inputs) {
    broll.inputs.forEach(input => args.push("-i", input))
  }

  // Add SFX inputs
  if (sfx.inputs) {
    sfx.inputs.forEach(input => args.push("-i", input))
  }

  // Build Audio Filter Graph (Voice Cleanup + SFX) before cuts
  let currentAudioPad = "[0:a]"
  const audioEnhance = generateAudioEnhanceFilters({ settings: settings.audio })
  if (audioEnhance.filterGraph) {
    complexFilter += `${currentAudioPad}${audioEnhance.filterGraph}[a_clean];`
    currentAudioPad = "[a_clean]"
  }

  if (sfx.filterGraph) {
    complexFilter += sfx.filterGraph
    complexFilter += `${currentAudioPad}[${sfx.outputPad}]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a_mixed];`
    currentAudioPad = "[a_mixed]"
  }

  // 4. Cuts (Trims and Concats) - Executed AFTER video/audio processing
  const cuts = generateCutFilters({
    durationSec,
    silenceData,
    editPlan: editPlan,
    settings: settings.cuts,
    videoInputPad: videoProcessedPad,
    audioInputPad: currentAudioPad
  })

  if (cuts.filterGraph) {
    complexFilter += cuts.filterGraph
  }

  if (complexFilter) {
    args.push("-filter_complex", complexFilter)
    
    // Map outputs
    if (cuts.filterGraph) {
      args.push("-map", `[${cuts.outputPad}]`, "-map", `[${cuts.audioPad}]`)
    } else {
      const mapVideo = videoProcessedPad === "[0:v]" ? "0:v" : videoProcessedPad
      const mapAudio = currentAudioPad === "[0:a]" ? "0:a" : currentAudioPad
      args.push("-map", mapVideo, "-map", mapAudio)
    }
  } else {
    args.push("-map", "0:v", "-map", "0:a")
  }

  // Encoding settings — use GPU if available
  const gpuArgs = await buildGpuEncoderArgs({ quality: settings.exportQuality || "standard" })

  if (gpuArgs.isGpu) {
    // GPU path: use detected encoder
    args.push(...gpuArgs.encoderArgs)
  } else {
    // CPU path: use export quality presets
    const quality = EXPORT_QUALITIES[settings.exportQuality] || EXPORT_QUALITIES.standard
    args.push("-c:v", "libx264", "-crf", String(quality.crf), "-preset", quality.preset)
  }

  args.push("-c:a", "aac", "-b:a", "192k", outputPath)
  console.log(`[media] Render encoder: ${gpuArgs.encoder} (GPU: ${gpuArgs.isGpu})`)

  let lastProgressReport = 0
  
  // Execute FFmpeg
  await runCommand({
    command: config.media.ffmpegBin,
    args,
    onStderrData: (text) => {
      // Parse FFmpeg progress
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+)\.(\d+)/)
      if (timeMatch && durationSec > 0) {
        const hours = Number(timeMatch[1])
        const minutes = Number(timeMatch[2])
        const seconds = Number(timeMatch[3])
        const currentSec = hours * 3600 + minutes * 60 + seconds
        
        // If cuts were applied, the final duration is shorter, but we can approximate progress against original
        // A better approach is to use total frames if available.
        const pct = Math.min(99, Math.round((currentSec / durationSec) * 100))
        
        const now = Date.now()
        if (now - lastProgressReport > 500) {
          onProgress?.(pct)
          lastProgressReport = now
        }
      }
    },
    notFoundMessage: "FFmpeg not found."
  })

  // Save EDL/Metadata
  const renderMeta = {
    renderId,
    generatedAt: new Date().toISOString(),
    settings,
    paths: {
      video: outputPath,
      ass: assPath
    }
  }
  await fs.writeFile(edlPath, JSON.stringify(renderMeta, null, 2))

  return renderMeta
}
