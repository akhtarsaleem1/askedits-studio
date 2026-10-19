import { audioWaveform } from "./waveform-service.js"
import fs from "node:fs/promises"
import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"
import { loadAssetRecord, updateAssetRecord } from "./upload-repository.js"
import { detectSilenceIntervals } from "./silence-detection-service.js"
import {
  transcribeAudioAsset,
  getLocalTranscriptionStatus
} from "./transcription-service.js"

const active = new Set()
export const isAssetProcessing = (assetId) => active.has(assetId)
export async function processVideoAsset(assetId) {
  if (active.has(assetId)) return
  active.add(assetId)
  const stage = (patch) =>
    updateAssetRecord(assetId, (record) => Object.assign(record, patch))
  try {
    const record = await loadAssetRecord(assetId)
    const paths = record.paths
    await stage({
      processingStatus: "processing",
      processingStage: "probing",
      processingProgress: 5,
      warnings: [],
      errors: []
    })
    const { stdout } = await runCommand({
      command: config.media.ffprobeBin,
      args: [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        paths.originalFile
      ],
      timeoutMs: 20000
    })
    const probe = JSON.parse(stdout)
    const video = probe.streams?.find((s) => s.codec_type === "video")
    const audioStream = probe.streams?.find((s) => s.codec_type === "audio")
    const durationSec = Number(probe.format?.duration || video?.duration)
    if (!video || !(durationSec > 0) || !Number.isFinite(durationSec))
      throw new Error(
        "This file does not contain a readable video with a valid duration."
      )
    const rotation = Math.abs(
      Number(
        video.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ??
          video.tags?.rotate ??
          0
      )
    )
    const swap = rotation % 180 === 90
    const frameRate = String(video.avg_frame_rate ?? "30/1")
      .split("/")
      .map(Number)
    const media = {
      width: swap ? video.height : video.width,
      height: swap ? video.width : video.height,
      durationSec,
      frameRate: frameRate[1] ? frameRate[0] / frameRate[1] : 30,
      hasAudio: Boolean(audioStream),
      videoCodec: video.codec_name,
      audioCodec: audioStream?.codec_name ?? null
    }
    await stage({ media, processingStage: "preview", processingProgress: 15 })
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-i",
        paths.originalFile,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        paths.proxyFile
      ]
    })
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-ss",
        String(Math.min(durationSec / 3, 1)),
        "-i",
        paths.originalFile,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        paths.thumbnailFile
      ],
      timeoutMs: 30000
    })
    if (!media.hasAudio) {
      await stage({
        audio: { status: "missing" },
        transcript: { status: "skipped", reason: "The source has no audio." },
        processingStatus: "ready",
        processingStage: "complete",
        processingProgress: 100
      })
      return
    }
    await stage({ processingStage: "audio-analysis", processingProgress: 45 })
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-i",
        paths.originalFile,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        paths.audioFile
      ]
    })
    const waveform = await audioWaveform(paths.audioFile)
    const silence = await detectSilenceIntervals({
      audioPath: paths.audioFile,
      outputPath: paths.silenceDetectionFile,
      mediaDurationSec: durationSec,
      silenceDurationSec: 0.4
    })
    await stage({
      audio: {
        status: "ready",
        durationSec,
        sampleRate: 16000,
        channels: 1,
        waveform
      },
      sceneAnalysis: {
        silenceDetection: {
          status: "ready",
          totalIntervals: silence.intervals.length,
          totalSilenceSec: silence.summary.totalSilenceSec
        }
      },
      processingProgress: 65
    })
    const mode = record.transcriptionMode ?? "auto"
    let transcript = {
      status: "skipped",
      reason: "Automatic transcription is switched off."
    }
    const warnings = []
    if (mode !== "off") {
      const available =
        mode === "cloud"
          ? Boolean(config.ai.groqApiKey)
          : (await getLocalTranscriptionStatus()).available
      if (available) {
        await stage({
          processingStage: "transcription",
          processingProgress: 70
        })
        try {
          const result = await transcribeAudioAsset({
            audioPath: paths.audioFile,
            transcriptPath: paths.transcriptFile,
            rawTranscriptPath: paths.transcriptRawFile,
            mediaDurationSec: durationSec,
            provider: mode === "cloud" ? "cloud" : "local",
            language: record.language ?? "auto"
          })
          transcript = result.summary
        } catch (error) {
          transcript = {
            status: "unavailable",
            reason:
              "Automatic captions could not be generated. You can import SRT or write captions."
          }
          warnings.push(transcript.reason)
          console.warn("[transcription]", error.message)
        }
      } else {
        transcript = {
          status: "unavailable",
          reason:
            mode === "cloud"
              ? "Configure your transcription provider before using cloud captions."
              : "Local speech transcription is not installed. Add captions manually or import SRT."
        }
        warnings.push(transcript.reason)
      }
    }
    await stage({
      transcript,
      warnings,
      processingStatus: "ready",
      processingStage: "complete",
      processingProgress: 100
    })
  } catch (error) {
    await stage({
      processingStatus: "failed",
      processingStage: "failed",
      errors: [error.message]
    })
  } finally {
    active.delete(assetId)
  }
}
