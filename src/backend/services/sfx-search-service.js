import fs from "node:fs/promises"
import { createWriteStream } from "node:fs"
import path from "node:path"
import { pipeline } from "node:stream/promises"

import config from "../../../config/default.js"

/**
 * Searches Pixabay API for a sound effect matching the keyword.
 * Fallback to local high-quality SFX library if API fails or no result.
 */
export async function searchPixabaySfx(keyword) {
  const kw = keyword.toLowerCase()
  
  // 1. Check local SFX library first (very common sounds)
  const localMap = {
    "whoosh": "/sfx/effects/minimal/whoosh1.mp3",
    "swoosh": "/sfx/effects/cinematic/swoosh1.mp3",
    "click": "/sfx/effects/pop/click1.mp3",
    "pop": "/sfx/effects/pop/pop1.mp3",
    "impact": "/sfx/effects/cinematic/impact1.mp3",
    "transition": "/sfx/effects/minimal/whoosh2.mp3",
    "soft click": "/sfx/effects/pop/click1.mp3",
    "deep whoosh": "/sfx/effects/cinematic/swoosh2.mp3"
  }

  for (const [key, path] of Object.entries(localMap)) {
    if (kw.includes(key)) {
      // Return local path prefixed with "local:" so engine knows how to handle it
      return `local:${path}`
    }
  }

  const apiKey = config.broll.pixabayApiKey
  if (!apiKey) {
    // If no API key, return a default local swoosh
    return "local:/sfx/effects/cinematic/swoosh1.mp3"
  }

  // Pixabay Sound Effects API (Note: As of 2024, Pixabay doesn't have a public SFX API endpoint)
  // We'll attempt a search but catch errors gracefully and return a default sound.
  try {
    const url = `https://pixabay.com/api/sound_effects/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=3`
    const response = await fetch(url)

    if (response.ok) {
      const data = await response.json()
      if (data.hits && data.hits.length > 0) {
        for (const hit of data.hits) {
          if (hit.download) return hit.download
        }
      }
    }
  } catch (err) {
    // Silence errors, fallback will handle it
  }

  // Final Fallback: Return a default cinematic swoosh if nothing else found
  return "local:/sfx/effects/cinematic/swoosh1.mp3"
}


/**
 * Downloads an SFX from a URL to the specified output path.
 */
export async function downloadSfxClip(url, outputPath) {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to download SFX: ${response.statusText}`)
  }

  const fileStream = createWriteStream(outputPath)
  await pipeline(response.body, fileStream)
  
  return outputPath
}
