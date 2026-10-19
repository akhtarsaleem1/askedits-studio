import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"

let status
export function getFFmpegStatus() {
  return (status ??= runCommand({
    command: config.media.ffmpegBin,
    args: ["-version"],
    timeoutMs: 8000
  })
    .then(({ stdout }) => {
      const version = stdout.match(/ffmpeg version ([^\s]+)/i)?.[1] ?? "unknown"
      const major = Number(version.match(/^n?(\d+)\./i)?.[1] ?? 0)
      return { available: major >= 8, installed: true, version }
    })
    .catch(() => ({ available: false, installed: false, version: null })))
}
