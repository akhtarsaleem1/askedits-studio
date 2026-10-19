import fs from "node:fs/promises"

import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"

/**
 * Detect silence intervals using FFmpeg's silencedetect filter.
 * This is a pure FFmpeg stage — no Python needed.
 */
export async function detectSilenceIntervals({
  audioPath,
  outputPath,
  mediaDurationSec = 0,
  silenceThresholdDb = -35,
  silenceDurationSec = 0.5,
  onProgress
}) {
  const args = [
    "-i", audioPath,
    "-af", `silencedetect=noise=${silenceThresholdDb}dB:d=${silenceDurationSec}`,
    "-f", "null",
    "-"
  ]

  let stderrOutput = ""

  await runCommand({
    command: config.media.ffmpegBin,
    args,
    onStderrData: (text) => {
      stderrOutput += text

      // Parse progress from FFmpeg time= output
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+)\.(\d+)/)
      if (timeMatch && mediaDurationSec > 0) {
        const hours = Number(timeMatch[1])
        const minutes = Number(timeMatch[2])
        const seconds = Number(timeMatch[3])
        const currentSec = hours * 3600 + minutes * 60 + seconds
        const pct = Math.min(99, Math.round((currentSec / mediaDurationSec) * 100))
        onProgress?.(pct)
      }
    },
    notFoundMessage: `${config.media.ffmpegBin} is not installed or not available on PATH.`
  })

  // Parse silence intervals from FFmpeg stderr
  const intervals = []
  const startRegex = /silence_start:\s*([\d.]+)/g
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g

  const starts = []
  let match

  while ((match = startRegex.exec(stderrOutput)) !== null) {
    starts.push(Number(match[1]))
  }

  let idx = 0
  while ((match = endRegex.exec(stderrOutput)) !== null) {
    const endSec = Number(match[1])
    const durationSec = Number(match[2])
    const startSec = starts[idx] ?? (endSec - durationSec)

    intervals.push({
      id: `silence-${idx + 1}`,
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      durationSec: Math.round(durationSec * 1000) / 1000,
      type: durationSec >= 2.0 ? "dead-air" : durationSec >= 1.0 ? "pause" : "micro-pause"
    })

    idx++
  }

  // Classify intervals
  const deadAirIntervals = intervals.filter(i => i.type === "dead-air")
  const pauseIntervals = intervals.filter(i => i.type === "pause")
  const microPauseIntervals = intervals.filter(i => i.type === "micro-pause")
  const totalSilenceSec = intervals.reduce((sum, i) => sum + i.durationSec, 0)
  const longestSilenceSec = intervals.reduce((max, i) => Math.max(max, i.durationSec), 0)

  const result = {
    provider: "ffmpeg-silencedetect",
    generatedAt: new Date().toISOString(),
    settings: {
      thresholdDb: silenceThresholdDb,
      minDurationSec: silenceDurationSec
    },
    summary: {
      totalIntervals: intervals.length,
      deadAirCount: deadAirIntervals.length,
      pauseCount: pauseIntervals.length,
      microPauseCount: microPauseIntervals.length,
      totalSilenceSec: Math.round(totalSilenceSec * 1000) / 1000,
      longestSilenceSec: Math.round(longestSilenceSec * 1000) / 1000,
      silenceRatio: mediaDurationSec > 0
        ? Math.round((totalSilenceSec / mediaDurationSec) * 1000) / 1000
        : 0
    },
    intervals
  }

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2))
  return result
}
