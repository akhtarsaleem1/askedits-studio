import { spawn } from "node:child_process"

import config from "../../../config/default.js"

let cachedCapabilities = null

function probeCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    let stdout = ""

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString()
    })

    child.on("error", () => resolve(""))
    child.on("close", () => resolve(stdout))
  })
}

/**
 * Detect available GPU hardware acceleration capabilities by probing FFmpeg.
 * Results are cached for the lifetime of the process.
 */
export async function detectGpuCapabilities() {
  if (cachedCapabilities) {
    return cachedCapabilities
  }

  const ffmpegBin = config.media.ffmpegBin

  // 1. Detect available hardware accelerators
  const hwaccelsOutput = await probeCommand(ffmpegBin, ["-hwaccels"])
  const hwaccels = hwaccelsOutput.toLowerCase()

  const hasCuda = hwaccels.includes("cuda")
  const hasVaapi = hwaccels.includes("vaapi")
  const hasQsv = hwaccels.includes("qsv")
  const hasDxva2 = hwaccels.includes("dxva2")
  const hasD3d11va = hwaccels.includes("d3d11va")
  const hasVideoToolbox = hwaccels.includes("videotoolbox")

  // 2. Detect available encoders
  const encodersOutput = await probeCommand(ffmpegBin, ["-encoders"])
  const encoders = encodersOutput.toLowerCase()

  const hasNvenc264 = encoders.includes("h264_nvenc")
  const hasNvenc265 = encoders.includes("hevc_nvenc")
  const hasVaapiEnc = encoders.includes("h264_vaapi")
  const hasQsvEnc = encoders.includes("h264_qsv")
  const hasVideoToolboxEnc = encoders.includes("h264_videotoolbox")

  // 3. Determine best available encoder
  let bestEncoder = "libx264" // fallback
  let hwaccelFlag = null
  let hwaccelOutputFormat = null

  if (hasCuda && hasNvenc264) {
    bestEncoder = "h264_nvenc"
    hwaccelFlag = "cuda"
    hwaccelOutputFormat = "cuda"
  } else if (hasQsv && hasQsvEnc) {
    bestEncoder = "h264_qsv"
    hwaccelFlag = "qsv"
  } else if (hasVaapi && hasVaapiEnc) {
    bestEncoder = "h264_vaapi"
    hwaccelFlag = "vaapi"
  } else if (hasVideoToolbox && hasVideoToolboxEnc) {
    bestEncoder = "h264_videotoolbox"
    hwaccelFlag = "videotoolbox"
  }

  // Allow config override
  const override = config.media.gpu.preferredEncoder
  if (override && override !== "auto") {
    if (encoders.includes(override)) {
      bestEncoder = override
    }
  }

  cachedCapabilities = {
    cuda: hasCuda,
    nvenc: hasNvenc264,
    nvencHevc: hasNvenc265,
    vaapi: hasVaapi && hasVaapiEnc,
    qsv: hasQsv && hasQsvEnc,
    videoToolbox: hasVideoToolbox && hasVideoToolboxEnc,
    dxva2: hasDxva2,
    d3d11va: hasD3d11va,
    bestEncoder,
    hwaccelFlag,
    hwaccelOutputFormat,
    isGpuAccelerated: bestEncoder !== "libx264",
    rawHwaccels: hwaccelsOutput.trim(),
    detectedAt: new Date().toISOString()
  }

  console.log(`[gpu] Detection complete — encoder: ${bestEncoder}, CUDA: ${hasCuda}, NVENC: ${hasNvenc264}, VAAPI: ${hasVaapi && hasVaapiEnc}, QSV: ${hasQsv && hasQsvEnc}`)

  return cachedCapabilities
}

/**
 * Force re-detection of GPU capabilities (useful if hardware changes)
 */
export function resetGpuCache() {
  cachedCapabilities = null
}

/**
 * Quick check: is GPU acceleration available?
 */
export async function isGpuAvailable() {
  if (!config.media.gpu.enabled) {
    return false
  }

  const caps = await detectGpuCapabilities()
  return caps.isGpuAccelerated
}
