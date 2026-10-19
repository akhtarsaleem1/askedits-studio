import fs from "node:fs/promises"
import path from "node:path"

import config from "../../../config/default.js"
import { runCommand, canRunCommand } from "../utils/process-runner.js"

const SCENE_DETECT_SCRIPT = path.resolve("python/scene_detect.py")
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

  throw new Error("Python runtime not found for scene detection.")
}

/**
 * Run PySceneDetect on a video file.
 */
export async function detectScenes({
  videoPath,
  outputPath,
  threshold = 27.0,
  minSceneLenSec = 0.5,
  onProgress
}) {
  const pythonRuntime = await resolvePythonRuntime()

  const args = [
    ...pythonRuntime.argsPrefix,
    SCENE_DETECT_SCRIPT,
    "--input", videoPath,
    "--output", outputPath,
    "--threshold", String(threshold),
    "--min-scene-len", String(minSceneLenSec)
  ]

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
    notFoundMessage: "Python runtime not found for scene detection."
  })

  return JSON.parse(stdout)
}
