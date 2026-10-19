import { createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"

import config from "../../../config/default.js"

function getOrientation(exportFormat = "original") {
  if (exportFormat === "tiktok") {
    return { pexels: "portrait", pixabay: "vertical", aspect: 9 / 16 }
  }

  if (exportFormat === "instagram_square") {
    return { pexels: "square", pixabay: "all", aspect: 1 }
  }

  return { pexels: "landscape", pixabay: "horizontal", aspect: 16 / 9 }
}

function aspectScore(width, height, desiredAspect) {
  if (!width || !height || !desiredAspect) return 99
  return Math.abs((width / height) - desiredAspect)
}

function qualityRank(quality = "") {
  if (quality === "hd") return 0
  if (quality === "sd") return 1
  return 2
}

function pickPexelsFile(video, desiredAspect) {
  const files = (video.video_files ?? [])
    .filter((file) => file.file_type === "video/mp4" && file.link)
    .sort((a, b) => {
      const aspectDelta = aspectScore(a.width, a.height, desiredAspect) - aspectScore(b.width, b.height, desiredAspect)
      if (Math.abs(aspectDelta) > 0.15) return aspectDelta
      return qualityRank(a.quality) - qualityRank(b.quality)
    })

  return files[0] ?? null
}

function pickPixabayVariant(hit, desiredAspect) {
  const variants = Object.values(hit.videos ?? {})
    .filter((variant) => variant?.url)
    .sort((a, b) => {
      const aspectDelta = aspectScore(a.width, a.height, desiredAspect) - aspectScore(b.width, b.height, desiredAspect)
      if (Math.abs(aspectDelta) > 0.15) return aspectDelta
      return (b.width * b.height) - (a.width * a.height)
    })

  return variants[0] ?? null
}

/**
 * Searches Pexels API for a video matching the keyword and target export orientation.
 */
export async function searchPexelsVideo(keyword, exportFormat = "original") {
  const apiKey = config.broll.pexelsApiKey
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY is not configured in environment.")
  }

  const orientation = getOrientation(exportFormat)
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=8&orientation=${orientation.pexels}`

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey
    }
  })

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.statusText}`)
  }

  const data = await response.json()
  if (!data.videos || data.videos.length === 0) {
    return null
  }

  const rankedVideos = [...data.videos].sort((a, b) => {
    return aspectScore(a.width, a.height, orientation.aspect) - aspectScore(b.width, b.height, orientation.aspect)
  })

  for (const video of rankedVideos) {
    const selectedFile = pickPexelsFile(video, orientation.aspect)
    if (selectedFile) {
      return selectedFile.link
    }
  }

  return null
}

/**
 * Searches Pixabay API for a video matching the keyword and target export orientation.
 */
export async function searchPixabayVideo(keyword, exportFormat = "original") {
  const apiKey = config.broll.pixabayApiKey
  if (!apiKey) {
    throw new Error("PIXABAY_API_KEY is not configured in environment.")
  }

  const orientation = getOrientation(exportFormat)
  const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=8&orientation=${orientation.pixabay}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.statusText}`)
  }

  const data = await response.json()
  if (!data.hits || data.hits.length === 0) {
    return null
  }

  const rankedHits = [...data.hits].sort((a, b) => {
    return aspectScore(a.videos?.medium?.width, a.videos?.medium?.height, orientation.aspect) -
      aspectScore(b.videos?.medium?.width, b.videos?.medium?.height, orientation.aspect)
  })

  for (const hit of rankedHits) {
    const selectedVariant = pickPixabayVariant(hit, orientation.aspect)
    if (selectedVariant) {
      return selectedVariant.url
    }
  }

  return null
}

/**
 * Queries both Pexels and Pixabay in parallel and returns the first valid video URL found.
 */
export async function searchBrollVideo(keyword, exportFormat = "original") {
  const promises = []

  if (config.broll.pexelsApiKey) {
    promises.push(searchPexelsVideo(keyword, exportFormat).catch((error) => {
      console.warn(`[broll] Pexels search failed: ${error.message}`)
      return null
    }))
  }

  if (config.broll.pixabayApiKey) {
    promises.push(searchPixabayVideo(keyword, exportFormat).catch((error) => {
      console.warn(`[broll] Pixabay search failed: ${error.message}`)
      return null
    }))
  }

  if (promises.length === 0) {
    throw new Error("No B-roll API keys configured.")
  }

  const results = await Promise.all(promises)

  for (const result of results) {
    if (result) return result
  }

  return null
}

/**
 * Downloads a video from a URL to the specified output path.
 */
export async function downloadBrollClip(url, outputPath) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download B-roll video: ${response.statusText}`)
  }

  const fileStream = createWriteStream(outputPath)
  await pipeline(response.body, fileStream)

  return outputPath
}
