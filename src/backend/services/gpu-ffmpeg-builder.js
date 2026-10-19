import config from "../../../config/default.js"
import { detectGpuCapabilities } from "./gpu-detector.js"

/**
 * Build FFmpeg encoder arguments optimized for detected GPU capabilities.
 * Falls back to libx264 if no GPU is available.
 *
 * @param {object} options
 * @param {string} options.quality - "draft" | "standard" | "high" | "max"
 * @param {boolean} [options.forceGpu] - Force GPU usage even if config disables it
 * @returns {Promise<{inputArgs: string[], encoderArgs: string[], encoder: string, isGpu: boolean}>}
 */
export async function buildGpuEncoderArgs({ quality = "standard", forceGpu = false } = {}) {
  const gpuEnabled = forceGpu || config.media.gpu.enabled

  if (!gpuEnabled) {
    return buildCpuArgs(quality)
  }

  const caps = await detectGpuCapabilities()

  if (!caps.isGpuAccelerated) {
    return buildCpuArgs(quality)
  }

  const inputArgs = []
  const encoderArgs = []

  // Add hardware acceleration input flags
  if (caps.hwaccelFlag) {
    inputArgs.push("-hwaccel", caps.hwaccelFlag)
    if (caps.hwaccelOutputFormat) {
      inputArgs.push("-hwaccel_output_format", caps.hwaccelOutputFormat)
    }
  }

  // Build encoder-specific args
  if (caps.bestEncoder === "h264_nvenc") {
    const preset = config.media.gpu.nvencPreset
    const cq = qualityToCq(quality)

    encoderArgs.push(
      "-c:v", "h264_nvenc",
      "-preset", preset,
      "-rc", "vbr",
      "-cq", String(cq),
      "-b:v", "0"
    )
  } else if (caps.bestEncoder === "h264_qsv") {
    const cq = qualityToCrf(quality) + 3 // QSV quality slightly different

    encoderArgs.push(
      "-c:v", "h264_qsv",
      "-preset", qualityToQsvPreset(quality),
      "-global_quality", String(cq)
    )
  } else if (caps.bestEncoder === "h264_vaapi") {
    const qp = qualityToCrf(quality) + 2

    encoderArgs.push(
      "-c:v", "h264_vaapi",
      "-qp", String(qp)
    )
  } else if (caps.bestEncoder === "h264_videotoolbox") {
    const bitrate = qualityToBitrate(quality)

    encoderArgs.push(
      "-c:v", "h264_videotoolbox",
      "-b:v", bitrate
    )
  } else {
    return buildCpuArgs(quality)
  }

  return {
    inputArgs,
    encoderArgs,
    encoder: caps.bestEncoder,
    isGpu: true
  }
}

/**
 * Build CPU-only FFmpeg encoder arguments
 */
function buildCpuArgs(quality) {
  const crf = qualityToCrf(quality)
  const preset = qualityToPreset(quality)

  return {
    inputArgs: [],
    encoderArgs: [
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", preset
    ],
    encoder: "libx264",
    isGpu: false
  }
}

function qualityToCrf(quality) {
  const map = { draft: 32, standard: 23, high: 18, max: 15 }
  return map[quality] ?? 23
}

function qualityToCq(quality) {
  const map = { draft: 35, standard: 26, high: 20, max: 16 }
  return map[quality] ?? 26
}

function qualityToPreset(quality) {
  const map = { draft: "ultrafast", standard: "fast", high: "medium", max: "slow" }
  return map[quality] ?? "fast"
}

function qualityToQsvPreset(quality) {
  const map = { draft: "veryfast", standard: "fast", high: "medium", max: "slow" }
  return map[quality] ?? "fast"
}

function qualityToBitrate(quality) {
  const map = { draft: "2M", standard: "5M", high: "10M", max: "20M" }
  return map[quality] ?? "5M"
}

/**
 * Build GPU-accelerated proxy encoding args (lower quality for editing)
 */
export async function buildGpuProxyArgs() {
  const caps = await detectGpuCapabilities()

  if (!config.media.gpu.enabled || !caps.isGpuAccelerated) {
    return {
      inputArgs: [],
      encoderArgs: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "32"],
      encoder: "libx264",
      isGpu: false
    }
  }

  const inputArgs = []
  if (caps.hwaccelFlag) {
    inputArgs.push("-hwaccel", caps.hwaccelFlag)
  }

  if (caps.bestEncoder === "h264_nvenc") {
    return {
      inputArgs,
      encoderArgs: ["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "35", "-b:v", "0"],
      encoder: "h264_nvenc",
      isGpu: true
    }
  }

  return {
    inputArgs,
    encoderArgs: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "32"],
    encoder: "libx264",
    isGpu: false
  }
}
