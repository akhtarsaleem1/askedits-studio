import fs from "node:fs/promises"
import path from "node:path"

import { runCommand, canRunCommand } from "../utils/process-runner.js"

const FACE_DETECT_SCRIPT = path.resolve("python/face_detect.py")
const LOCAL_PYTHON_PACKAGES_PATH = path.resolve(".python-packages")

function buildPythonPathEnv() {
  const entries = []
  if (process.env.PYTHONPATH) entries.push(process.env.PYTHONPATH)
  entries.push(LOCAL_PYTHON_PACKAGES_PATH)
  return entries.join(path.delimiter)
}

async function resolvePythonRuntime() {
  const candidates = [
    process.env.PYTHON_BIN?.trim() ? { command: process.env.PYTHON_BIN.trim(), argsPrefix: [] } : null,
    { command: "python", argsPrefix: ["-B"] },
    process.platform === "win32" ? { command: "py", argsPrefix: ["-3", "-B"] } : null
  ].filter(Boolean)

  for (const candidate of candidates) {
    const available = await canRunCommand(candidate.command, [...candidate.argsPrefix, "--version"])
    if (available) return candidate
  }

  throw new Error("Python runtime not found for face detection.")
}

/**
 * Run MediaPipe face detection on a video file (fast per-scene summary mode).
 */
export async function detectFaces({
  videoPath,
  outputPath,
  sampleFps = 1.0,
  minConfidence = 0.5,
  sceneDataPath = null,
  onProgress
}) {
  const pythonRuntime = await resolvePythonRuntime()

  const args = [
    ...pythonRuntime.argsPrefix,
    FACE_DETECT_SCRIPT,
    "--input", videoPath,
    "--output", outputPath,
    "--sample-fps", String(sampleFps),
    "--min-confidence", String(minConfidence)
  ]

  if (sceneDataPath) {
    try {
      await fs.access(sceneDataPath)
      args.push("--scene-data", sceneDataPath)
    } catch {
      // Scene data not available, skip
    }
  }

  const { stdout } = await runCommand({
    command: pythonRuntime.command,
    args,
    env: {
      ...process.env,
      ASKEDITS_PYTHONPATH: buildPythonPathEnv()
    },
    onStderrData: (text) => {
      const match = text.match(/PROGRESS:(\d+)/)
      if (match) onProgress?.(Number(match[1]))
    },
    notFoundMessage: "Python runtime not found for face detection."
  })

  return JSON.parse(stdout)
}
