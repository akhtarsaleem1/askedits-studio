import fs from "node:fs/promises"

import config from "../../../config/default.js"
import { createHttpError } from "../utils/errors.js"
import { runCommand } from "../utils/process-runner.js"
import { loadAssetRecord, saveAssetRecord } from "./upload-repository.js"
import { transcribeAudioAsset } from "./transcription-service.js"
import { runAiAnalysis } from "./ai-analysis-service.js"
import { detectScenes } from "./scene-detection-service.js"
import { detectFaces } from "./face-detection-service.js"
import { detectSilenceIntervals } from "./silence-detection-service.js"
import { buildAdaptiveProxyArgs } from "./proxy-service.js"
import { buildGpuEncoderArgs, buildGpuProxyArgs } from "./gpu-ffmpeg-builder.js"

function roundNumber(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number(value.toFixed(digits))
}

function parseFrameRate(rateText = "0/0") {
  const [numerator, denominator] = rateText.split("/").map(Number)

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0
  }

  return Number((numerator / denominator).toFixed(3))
}

function normalizeVideoMetadata(probeResult) {
  const videoStream = probeResult.streams?.find((stream) => stream.codec_type === "video")

  if (!videoStream) {
    throw createHttpError(415, "The uploaded file does not contain a readable video stream.")
  }

  const audioStream = probeResult.streams?.find((stream) => stream.codec_type === "audio")
  const durationSec = Number(probeResult.format?.duration ?? videoStream.duration ?? 0)

  return {
    durationSec: roundNumber(durationSec),
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
    frameRate: parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate),
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    audioSampleRate: Number(audioStream?.sample_rate ?? 0),
    audioChannels: Number(audioStream?.channels ?? 0),
    hasAudio: Boolean(audioStream),
    bitRate: Number(probeResult.format?.bit_rate ?? 0)
  }
}

function normalizeAudioMetadata(probeResult) {
  const audioStream = probeResult.streams?.find((stream) => stream.codec_type === "audio")

  if (!audioStream) {
    throw createHttpError(500, "The extracted audio file does not contain a readable audio stream.")
  }

  const durationSec = Number(probeResult.format?.duration ?? audioStream.duration ?? 0)

  return {
    status: "ready",
    durationSec: roundNumber(durationSec),
    codec: audioStream.codec_name ?? config.media.audio.codec,
    sampleRate: Number(audioStream.sample_rate ?? config.media.audio.sampleRate),
    channels: Number(audioStream.channels ?? config.media.audio.channels),
    format: config.media.audio.format
  }
}

function getFfprobeNotFoundMessage() {
  return `${config.media.ffprobeBin} is not installed or is not available on PATH. Set FFPROBE_BIN if the binary lives elsewhere.`
}

function getFfmpegNotFoundMessage() {
  return `${config.media.ffmpegBin} is not installed or is not available on PATH. Set FFMPEG_BIN if the binary lives elsewhere.`
}

async function probeMedia(inputPath) {
  const { stdout } = await runCommand({
    command: config.media.ffprobeBin,
    args: ["-v", "error", "-show_format", "-show_streams", "-of", "json", inputPath],
    notFoundMessage: getFfprobeNotFoundMessage()
  })

  return JSON.parse(stdout)
}

function buildProxyScaleFilter() {
  return `scale=${config.media.proxy.width}:${config.media.proxy.maxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`
}

function buildThumbnailScaleFilter() {
  return `scale=${config.media.thumbnail.width}:-2:force_original_aspect_ratio=decrease:force_divisible_by=2`
}

async function runFfmpeg(args) {
  return runCommand({
    command: config.media.ffmpegBin,
    args,
    notFoundMessage: getFfmpegNotFoundMessage()
  })
}

async function createOptimizedVideo(inputPath, outputPath) {
  const gpu = await buildGpuEncoderArgs({ quality: "standard" })
  const args = ["-y", ...gpu.inputArgs, "-i", inputPath, ...gpu.encoderArgs]

  if (!gpu.isGpu) {
    // Override with config values for CPU path
    const crfIdx = args.indexOf("-crf")
    if (crfIdx !== -1) args[crfIdx + 1] = String(config.media.optimized.crf)
    const presetIdx = args.indexOf("-preset")
    if (presetIdx !== -1) args[presetIdx + 1] = config.media.optimized.preset
  }

  args.push("-c:a", "aac", "-movflags", "+faststart", outputPath)
  console.log(`[media] Optimized video encoder: ${gpu.encoder} (GPU: ${gpu.isGpu})`)
  await runFfmpeg(args)
}

async function createProxyVideo(inputPath, outputPath, sourceMeta) {
  const proxyArgs = buildAdaptiveProxyArgs(sourceMeta)
  const gpu = await buildGpuProxyArgs()
  const scaleFilter = proxyArgs.scaleFilter

  const args = ["-y", ...gpu.inputArgs, "-i", inputPath, "-vf", scaleFilter, ...gpu.encoderArgs]

  if (!gpu.isGpu) {
    // Override with adaptive proxy config for CPU path
    const crfIdx = args.indexOf("-crf")
    if (crfIdx !== -1) args[crfIdx + 1] = String(proxyArgs.crf)
    const presetIdx = args.indexOf("-preset")
    if (presetIdx !== -1) args[presetIdx + 1] = proxyArgs.preset
  }

  args.push("-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outputPath)
  console.log(`[media] Proxy video tier: ${proxyArgs.tier}, encoder: ${gpu.encoder} (GPU: ${gpu.isGpu})`)
  await runFfmpeg(args)

  return proxyArgs
}

async function createThumbnail(inputPath, outputPath, durationSec) {
  const captureTime = Math.max(0, Math.min(durationSec / 3 || 0, 3))

  await runFfmpeg([
    "-y",
    "-ss",
    captureTime.toFixed(2),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    buildThumbnailScaleFilter(),
    outputPath
  ])
}

async function extractAudioTrack(inputPath, outputPath) {
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    String(config.media.audio.channels),
    "-ar",
    String(config.media.audio.sampleRate),
    "-c:a",
    config.media.audio.codec,
    outputPath
  ])
}

async function updateProcessingRecord(record, updates) {
  Object.assign(record, updates)
  return saveAssetRecord(record)
}

export async function processVideoAsset(assetId) {
  const record = await loadAssetRecord(assetId)
  console.log(`[media] Starting processing pipeline for asset: ${assetId}`)
  await updateProcessingRecord(record, {
    processingStatus: "processing",
    processingStage: "probing",
    processingProgress: 5,
    aiAnalysis: null,
    errors: []
  })

  try {
    await Promise.all([
      fs.mkdir(record.paths.optimizedDir, { recursive: true }),
      fs.mkdir(record.paths.proxyDir, { recursive: true }),
      fs.mkdir(record.paths.thumbnailsDir, { recursive: true }),
      fs.mkdir(record.paths.audioDir, { recursive: true }),
      fs.mkdir(record.paths.transcriptsDir, { recursive: true })
    ])

    const sourceProbe = await probeMedia(record.paths.originalFile)
    const media = normalizeVideoMetadata(sourceProbe)
    console.log(`[media] Probing complete. Duration: ${media.durationSec}s, Res: ${media.width}x${media.height}`)

    await updateProcessingRecord(record, {
      media,
      processingStage: "video-derivatives",
      processingProgress: 15
    })

    console.log(`[media] Creating optimized video...`)
    await createOptimizedVideo(record.paths.originalFile, record.paths.optimizedFile)
    console.log(`[media] Creating proxy video...`)
    const proxyResult = await createProxyVideo(record.paths.originalFile, record.paths.proxyFile, media)
    record.proxyMeta = { tier: proxyResult.tier, width: proxyResult.width, maxHeight: proxyResult.maxHeight }
    console.log(`[media] Creating thumbnail...`)
    await createThumbnail(record.paths.originalFile, record.paths.thumbnailFile, media.durationSec)

    if (!media.hasAudio) {
      await updateProcessingRecord(record, {
        audio: {
          status: "missing",
          durationSec: 0,
          codec: null,
          sampleRate: 0,
          channels: 0,
          format: null
        },
        transcript: {
          status: "skipped",
          reason: "No audio stream was detected in the uploaded source."
        },
        processingStatus: "ready",
        processingStage: "complete"
      })
      return
    }

    await updateProcessingRecord(record, {
      processingStage: "audio-extraction",
      processingProgress: 45
    })

    console.log(`[media] Extracting audio track...`)
    await extractAudioTrack(record.paths.originalFile, record.paths.audioFile)

    console.log(`[media] Probing audio...`)
    const audioProbe = await probeMedia(record.paths.audioFile)
    const audio = normalizeAudioMetadata(audioProbe)

    await updateProcessingRecord(record, {
      audio,
      processingStage: "transcription",
      processingProgress: 50
    })

    console.log(`[media] Starting transcription (Faster-Whisper)... This may take several minutes if the model needs to be downloaded or if running on CPU.`)
    const transcriptResult = await transcribeAudioAsset({
      audioPath: record.paths.audioFile,
      transcriptPath: record.paths.transcriptFile,
      rawTranscriptPath: record.paths.transcriptRawFile,
      mediaDurationSec: media.durationSec,
      onProgress: (pct) => {
        const overall = 50 + (pct * 10) / 100
        updateProcessingRecord(record, {
          processingProgress: Math.round(overall)
        })
      }
    })
    console.log(`[media] Transcription complete. Word count: ${transcriptResult.summary.wordCount}`)

    await updateProcessingRecord(record, {
      transcript: transcriptResult.summary,
      processingStage: "scene-detection",
      processingProgress: 60
    })

    // --- Phase 4: Scene Analysis ---
    let sceneData = null
    console.log(`[media] Starting scene detection (PySceneDetect)...`)
    try {
      sceneData = await detectScenes({
        videoPath: record.paths.originalFile,
        outputPath: record.paths.sceneDetectionFile,
        onProgress: (pct) => {
          const overall = 60 + (pct * 10) / 100
          updateProcessingRecord(record, {
            processingProgress: Math.round(overall)
          })
        }
      })
      console.log(`[media] Scene detection complete. Scenes: ${sceneData.summary.sceneCount}`)
    } catch (sceneError) {
      console.error(`[media] Scene detection failed: ${sceneError.message}`)
      sceneData = { status: "failed", error: sceneError.message }
    }

    await updateProcessingRecord(record, {
      processingStage: "face-detection",
      processingProgress: 70
    })

    let faceData = null
    console.log(`[media] Starting face detection (MediaPipe)...`)
    try {
      faceData = await detectFaces({
        videoPath: record.paths.originalFile,
        outputPath: record.paths.faceDetectionFile,
        sceneDataPath: record.paths.sceneDetectionFile,
        onProgress: (pct) => {
          const overall = 70 + (pct * 8) / 100
          updateProcessingRecord(record, {
            processingProgress: Math.round(overall)
          })
        }
      })
      console.log(`[media] Face detection complete. Face presence: ${(faceData.summary.facePresenceRatio * 100).toFixed(0)}%`)
    } catch (faceError) {
      console.error(`[media] Face detection failed: ${faceError.message}`)
      faceData = { status: "failed", error: faceError.message }
    }

    await updateProcessingRecord(record, {
      processingStage: "silence-detection",
      processingProgress: 78
    })

    let silenceData = null
    console.log(`[media] Starting silence detection (FFmpeg)...`)
    try {
      silenceData = await detectSilenceIntervals({
        audioPath: record.paths.audioFile,
        outputPath: record.paths.silenceDetectionFile,
        mediaDurationSec: media.durationSec,
        onProgress: (pct) => {
          const overall = 78 + (pct * 7) / 100
          updateProcessingRecord(record, {
            processingProgress: Math.round(overall)
          })
        }
      })
      console.log(`[media] Silence detection complete. Intervals: ${silenceData.summary.totalIntervals}, Total silence: ${silenceData.summary.totalSilenceSec}s`)
    } catch (silenceError) {
      console.error(`[media] Silence detection failed: ${silenceError.message}`)
      silenceData = { status: "failed", error: silenceError.message }
    }

    await updateProcessingRecord(record, {
      sceneAnalysis: {
        sceneDetection: sceneData?.status !== "failed" ? { status: "ready", sceneCount: sceneData?.summary?.sceneCount ?? 0 } : sceneData,
        faceDetection: faceData?.status !== "failed" ? { status: "ready", facePresenceRatio: faceData?.summary?.facePresenceRatio ?? 0 } : faceData,
        silenceDetection: silenceData?.status !== "failed" ? { status: "ready", totalIntervals: silenceData?.summary?.totalIntervals ?? 0 } : silenceData,
      },
      processingStage: "ai-analysis",
      processingProgress: 85
    })

    let aiAnalysis = { status: "skipped", reason: "AI analysis not configured." }

    console.log(`[media] Starting AI Analysis (${String(config.ai.provider ?? "groq").toUpperCase()})...`)
    try {
      aiAnalysis = await runAiAnalysis(record)
      console.log(`[media] AI Analysis complete. Style: ${aiAnalysis.detectedStyle}, Viral Moments: ${aiAnalysis.viralMomentCount}${aiAnalysis.fallback ? " (fallback mode)" : ""}`)
    } catch (aiError) {
      console.error(`[media] AI Analysis failed: ${aiError.message}`)
      aiAnalysis = { status: "failed", error: aiError.message }
    }

    await updateProcessingRecord(record, {
      aiAnalysis,
      processingStatus: "ready",
      processingStage: "complete",
      processingProgress: 100
    })
    console.log(`[media] Pipeline complete for asset: ${assetId}`)
  } catch (error) {
    console.error(`[media] Pipeline failed for asset ${assetId}: ${error.message}`)
    await updateProcessingRecord(record, {
      processingStatus: "failed",
      processingStage: "failed",
      errors: [...(record.errors ?? []), error.message]
    })
  }
}
