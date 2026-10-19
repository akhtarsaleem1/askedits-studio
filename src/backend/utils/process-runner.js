import { spawn } from "node:child_process"
import { createHttpError } from "./errors.js"

export async function canRunCommand(command, args = []) {
  try {
    await runCommand({ command, args, timeoutMs: 8000 })
    return true
  } catch {
    return false
  }
}
export function runCommand({
  command,
  args = [],
  cwd,
  env,
  onData,
  onStderrData,
  windowsHide = true,
  notFoundMessage,
  timeoutMs = 30 * 60 * 1000,
  signal
}) {
  return new Promise((resolve, reject) => {
    let child,
      timer,
      settled = false,
      stdout = "",
      stderr = ""
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", cancel)
      error ? reject(error) : resolve(value)
    }
    const cancel = () => {
      child?.kill()
      finish(
        Object.assign(new Error("Render cancelled."), { name: "AbortError" })
      )
    }
    if (signal?.aborted) return cancel()
    try {
      child = spawn(command, args, {
        cwd,
        env,
        windowsHide,
        stdio: ["ignore", "pipe", "pipe"]
      })
    } catch (error) {
      finish(error)
      return
    }
    timer = setTimeout(() => {
      child.kill()
      finish(
        createHttpError(504, "Media processing timed out. Try a shorter clip.")
      )
    }, timeoutMs)
    timer.unref()
    signal?.addEventListener("abort", cancel, { once: true })
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      stdout = (stdout + text).slice(-2 * 1024 * 1024)
      onData?.(text)
    })
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      stderr = (stderr + text).slice(-128 * 1024)
      onStderrData?.(text)
    })
    child.once("error", (error) =>
      finish(
        createHttpError(
          500,
          error.code === "ENOENT"
            ? (notFoundMessage ??
                command + " is not installed. Check Settings → System status.")
            : "Could not start media processing: " + error.message
        )
      )
    )
    child.once("close", (code) => {
      if (code === 0) finish(null, { stdout, stderr })
      else
        finish(
          createHttpError(
            500,
            "Media process failed. " +
              (stderr.trim().split("\n").slice(-12).join(" ").slice(-1600) ||
                "Exit code " + code)
          )
        )
    })
  })
}
