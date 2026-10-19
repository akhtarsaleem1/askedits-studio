import net from "node:net"
import { spawn } from "node:child_process"
import process from "node:process"
import path from "node:path"

const backendBasePort = normalizePort(process.env.PORT, 8787)
const frontendBasePort = normalizePort(process.env.VITE_PORT, 5173)
const viteCliPath = path.resolve("node_modules", "vite", "bin", "vite.js")

function normalizePort(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function probePort(port) {
  return new Promise((resolve) => {
    const hosts = ["127.0.0.1", "::1"]
    let pending = hosts.length
    let busy = false

    const finish = (nextBusy) => {
      busy = busy || nextBusy
      pending -= 1

      if (pending === 0) {
        resolve(!busy)
      }
    }

    for (const host of hosts) {
      const socket = new net.Socket()

      socket.setTimeout(250)

      socket.once("connect", () => {
        socket.destroy()
        finish(true)
      })

      socket.once("timeout", () => {
        socket.destroy()
        finish(false)
      })

      socket.once("error", (error) => {
        socket.destroy()

        if (["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "EADDRNOTAVAIL"].includes(error.code)) {
          finish(false)
          return
        }

        finish(true)
      })

      socket.connect(port, host)
    }
  })
}

async function findOpenPort(startPort, maxAttempts = 25) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset

    // eslint-disable-next-line no-await-in-loop
    if (await probePort(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find an open port after checking ${maxAttempts} candidates from ${startPort}.`)
}

function pipeWithPrefix(stream, prefix, writer) {
  let buffer = ""

  stream.on("data", (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      writer.write(`${prefix} ${line}\n`)
    }
  })

  stream.on("end", () => {
    if (buffer) {
      writer.write(`${prefix} ${buffer}\n`)
    }
  })
}

function launchTask(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
    windowsHide: false
  })

  pipeWithPrefix(child.stdout, `[${name}]`, process.stdout)
  pipeWithPrefix(child.stderr, `[${name}]`, process.stderr)

  child.on("error", (error) => {
    process.stderr.write(`[${name}] Failed to start: ${error.message}\n`)
  })

  return child
}

function shutdown(children, exitCode = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM")
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL")
      }
    }
  }, 1500).unref()

  process.exit(exitCode)
}

async function main() {
  const backendPort = await findOpenPort(backendBasePort)
  const frontendPort = await findOpenPort(frontendBasePort)
  const clientOrigin = `http://localhost:${frontendPort}`
  const apiTarget = `http://localhost:${backendPort}`

  const backendPortNote =
    backendPort === backendBasePort ? "" : ` (default ${backendBasePort} was busy, using ${backendPort})`
  const frontendPortNote =
    frontendPort === frontendBasePort ? "" : ` (default ${frontendBasePort} was busy, using ${frontendPort})`

  process.stdout.write(`[dev] Backend target: ${apiTarget}${backendPortNote}\n`)
  process.stdout.write(`[dev] Frontend URL: ${clientOrigin}${frontendPortNote}\n`)

  const backend = launchTask("dev:server", process.execPath, [
    "--watch-path=src/backend",
    "--watch-path=config",
    "--watch-path=src/shared",
    "src/backend/server.js"
  ], {
    PORT: String(backendPort),
    CLIENT_ORIGIN: clientOrigin
  })

  const frontend = launchTask(
    "dev:client",
    process.execPath,
    [viteCliPath, "--port", String(frontendPort), "--strictPort"],
    {
      VITE_API_TARGET: apiTarget
    }
  )

  const children = [backend, frontend]
  let shuttingDown = false

  const handleExit = (label) => (code, signal) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`
    process.stderr.write(`[dev] ${label} exited with ${reason}. Shutting down the rest of the dev stack.\n`)
    shutdown(children, code ?? 0)
  }

  backend.on("exit", handleExit("dev:server"))
  frontend.on("exit", handleExit("dev:client"))

  const terminate = () => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    shutdown(children, 0)
  }

  process.on("SIGINT", terminate)
  process.on("SIGTERM", terminate)
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error.message}\n`)
  process.exit(1)
})
