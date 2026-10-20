import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"

const python = () => process.env.PYTHON_BIN || "python"
const model = () =>
  path.resolve(
    process.env.PERSON_SEGMENTATION_MODEL ||
      "storage/models/selfie_segmenter.tflite"
  )
const environment = () => ({
  ...process.env,
  PERSON_SEGMENTATION_PACKAGES: path.resolve(
    process.env.PERSON_SEGMENTATION_PACKAGES ||
      "storage/runtime/person-packages"
  )
})
export async function personMatteStatus() {
  try {
    await fs.access(model())
    await runCommand({
      command: python(),
      args: [
        "-c",
        "import os,sys; sys.path.insert(0,os.environ['PERSON_SEGMENTATION_PACKAGES']); import mediapipe,cv2,numpy"
      ],
      env: environment(),
      timeoutMs: 15000
    })
    return { available: true }
  } catch {
    return {
      available: false,
      message:
        "Install python/requirements-visual.txt and the selfie model to enable local presenter cutout."
    }
  }
}
export async function ensurePersonMatte(record, { signal, onProgress } = {}) {
  const target = path.join(record.paths.optimizedDir, "person-mask-v1.mp4")
  if (
    await fs
      .stat(target)
      .then((s) => s.size > 1024)
      .catch(() => false)
  )
    return target
  const status = await personMatteStatus()
  if (!status.available) throw new Error(status.message)
  await fs.mkdir(record.paths.optimizedDir, { recursive: true })
  const temporary = target + "." + randomUUID() + ".mp4"
  try {
    await runCommand({
      command: python(),
      args: [
        path.resolve("python/person_matte.py"),
        "--input",
        record.paths.originalFile,
        "--output",
        temporary,
        "--model",
        model(),
        "--ffmpeg",
        config.media.ffmpegBin,
        "--duration",
        String(record.media.durationSec)
      ],
      env: environment(),
      signal,
      timeoutMs: Math.max(120000, record.media.durationSec * 8000),
      onData: (text) => {
        const match = text.match(/mask_seconds=([\d.]+)/)
        if (match)
          onProgress?.(
            Math.min(18, (Number(match[1]) / record.media.durationSec) * 18)
          )
      }
    })
    if (signal?.aborted) throw new Error("Render cancelled.")
    await fs.rename(temporary, target)
    return target
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
}
