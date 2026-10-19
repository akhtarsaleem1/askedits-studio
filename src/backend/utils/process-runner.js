import { spawn } from "node:child_process"

import { createHttpError } from "./errors.js"

export function canRunCommand(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true
    })

    child.on("error", () => {
      resolve(false)
    })

    child.on("close", (code) => {
      resolve(code === 0)
    })
  })
}

export function runCommand({
  command,
  args = [],
  cwd,
  env,
  onData,
  onStderrData,
  windowsHide = true,
  notFoundMessage
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      stdout += text
      onData?.(text)
    })

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      stderr += text
      onStderrData?.(text)
    })

    child.on("error", (error) => {
      if (error.code === "ENOENT" && notFoundMessage) {
        reject(createHttpError(500, notFoundMessage))
        return
      }

      reject(createHttpError(500, `Failed to start ${command}: ${error.message}`))
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        createHttpError(
          500,
          `${command} exited with code ${code}. ${stderr.trim() || stdout.trim() || "Unknown process error."}`
        )
      )
    })
  })
}
