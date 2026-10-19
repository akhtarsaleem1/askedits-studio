import path from "node:path"
import { createHttpError } from "./errors.js"

const FALLBACK_UPLOAD_NAME = "upload.bin"

export function sanitizeFileName(filename = FALLBACK_UPLOAD_NAME) {
  const baseName = path.basename(filename).trim()
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return sanitized || FALLBACK_UPLOAD_NAME
}

export function buildAssetLayout(assetId, originalName = FALLBACK_UPLOAD_NAME, storageRoot = "storage/assets") {
  const safeOriginalName = sanitizeFileName(originalName)
  if (typeof assetId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(assetId)) {
    throw createHttpError(400, "Invalid upload asset ID.")
  }
  const assetRoot = path.resolve(storageRoot, assetId)

  return {
    assetRoot,
    chunksDir: path.join(assetRoot, "chunks"),
    originalDir: path.join(assetRoot, "original"),
    optimizedDir: path.join(assetRoot, "optimized"),
    proxyDir: path.join(assetRoot, "proxy"),
    thumbnailsDir: path.join(assetRoot, "thumbnails"),
    audioDir: path.join(assetRoot, "audio"),
    transcriptsDir: path.join(assetRoot, "transcripts"),
    aiDir: path.join(assetRoot, "ai"),
    brollDir: path.join(assetRoot, "broll"),
    sfxDir: path.join(assetRoot, "sfx"),
    rendersDir: path.join(assetRoot, "renders"),
    aiThumbnailsDir: path.join(assetRoot, "thumbnails", "ai"),
    metadataFile: path.join(assetRoot, "metadata.json"),
    originalFile: path.join(assetRoot, "original", safeOriginalName),
    optimizedFile: path.join(assetRoot, "optimized", "optimized.mp4"),
    proxyFile: path.join(assetRoot, "proxy", "proxy.mp4"),
    thumbnailFile: path.join(assetRoot, "thumbnails", "poster.jpg"),
    audioFile: path.join(assetRoot, "audio", "analysis.wav"),
    transcriptFile: path.join(assetRoot, "transcripts", "transcript.json"),
    transcriptRawFile: path.join(assetRoot, "transcripts", "transcript-raw.json"),
    viralMomentsFile: path.join(assetRoot, "ai", "viral-moments.json"),
    styleAnalysisFile: path.join(assetRoot, "ai", "style-analysis.json"),
    editPlanFile: path.join(assetRoot, "ai", "edit-plan.json"),
    sceneDetectionFile: path.join(assetRoot, "ai", "scene-detection.json"),
    faceDetectionFile: path.join(assetRoot, "ai", "face-detection.json"),
    silenceDetectionFile: path.join(assetRoot, "ai", "silence-detection.json")
  }
}

export function chunkFilePath(layout, index) {
  return path.join(layout.chunksDir, `chunk-${String(index).padStart(5, "0")}.part`)
}

export function renderArtifactPath(layout, renderId, extension) {
  return path.join(layout.rendersDir, `${renderId}.${extension}`)
}
