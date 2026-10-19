import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Loads .env variables into process.env.
 * This is a manual loader for ESM environments where imports are hoisted.
 * It searches from the current directory up to the root.
 */
export function loadEnv() {
  let currentDir = __dirname
  let envPath = null

  // Search upwards for .env
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(currentDir, ".env")
    if (existsSync(candidate)) {
      envPath = candidate
      break
    }
    const parent = dirname(currentDir)
    if (parent === currentDir) break
    currentDir = parent
  }

  // Also check project root specifically if not found
  if (!envPath) {
    const rootEnv = resolve(process.cwd(), ".env")
    if (existsSync(rootEnv)) envPath = rootEnv
  }

  if (!envPath) return

  try {
    const content = readFileSync(envPath, "utf8")
    const lines = content.split(/\r?\n/)

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      const eqIndex = trimmed.indexOf("=")
      if (eqIndex === -1) continue

      const key = trimmed.slice(0, eqIndex).trim()
      let val = trimmed.slice(eqIndex + 1).trim()

      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }

      if (key && !(key in process.env)) {
        process.env[key] = val
      }
    }
  } catch (error) {
    console.warn(`[env] Failed to load .env from ${envPath}:`, error.message)
  }
}

// Execute immediately when imported
loadEnv()
