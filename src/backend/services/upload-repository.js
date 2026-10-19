import fs from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { withAssetLock } from "../utils/asset-lock.js"

import config from "../../../config/default.js"
import { createHttpError } from "../utils/errors.js"
import { buildAssetLayout } from "../utils/storage-layout.js"

export async function ensureAssetDirectories(layout) {
  await Promise.all([
    fs.mkdir(layout.assetRoot, { recursive: true }),
    fs.mkdir(layout.chunksDir, { recursive: true }),
    fs.mkdir(layout.originalDir, { recursive: true }),
    fs.mkdir(layout.optimizedDir, { recursive: true }),
    fs.mkdir(layout.proxyDir, { recursive: true }),
    fs.mkdir(layout.thumbnailsDir, { recursive: true }),
    fs.mkdir(layout.audioDir, { recursive: true }),
    fs.mkdir(layout.transcriptsDir, { recursive: true }),
    fs.mkdir(layout.aiDir, { recursive: true }),
    fs.mkdir(layout.brollDir, { recursive: true }),
    fs.mkdir(layout.sfxDir, { recursive: true }),
    fs.mkdir(layout.rendersDir, { recursive: true }),
    fs.mkdir(layout.aiThumbnailsDir, { recursive: true })
  ])
}

export async function loadAssetRecord(assetId) {
  const layout = buildAssetLayout(assetId, undefined, config.upload.storageRoot)

  try {
    const raw = await fs.readFile(layout.metadataFile, "utf8")
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createHttpError(404, `Upload asset "${assetId}" was not found.`)
    }

    throw error
  }
}

export async function saveAssetRecord(record) {
  const nextRecord = {
    ...record,
    updatedAt: new Date().toISOString()
  }

  const temporaryFile = `${nextRecord.paths.metadataFile}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryFile, JSON.stringify(nextRecord, null, 2))
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporaryFile, nextRecord.paths.metadataFile); break }
      catch (error) {
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 7) throw error
        await new Promise(resolve => setTimeout(resolve, Math.min(200, 15 * 2 ** attempt)))
      }
    }
  } finally {
    await fs.unlink(temporaryFile).catch(() => {})
  }
  return nextRecord
}

export function buildAssetUrls(assetId) {
  return {
    original: `/api/uploads/${assetId}/assets/original`,
    optimized: `/api/uploads/${assetId}/assets/optimized`,
    proxy: `/api/uploads/${assetId}/assets/proxy`,
    thumbnail: `/api/uploads/${assetId}/assets/thumbnail`,
    audio: `/api/uploads/${assetId}/assets/audio`,
    transcript: `/api/uploads/${assetId}/assets/transcript`,
    transcriptRaw: `/api/uploads/${assetId}/assets/transcript-raw`,
    viralMoments: `/api/uploads/${assetId}/assets/viral-moments`,
    styleAnalysis: `/api/uploads/${assetId}/assets/style-analysis`,
    editPlan: `/api/uploads/${assetId}/assets/edit-plan`,
    sceneDetection: `/api/uploads/${assetId}/assets/scene-detection`,
    faceDetection: `/api/uploads/${assetId}/assets/face-detection`,
    silenceDetection: `/api/uploads/${assetId}/assets/silence-detection`
  }
}

export function serializeAssetRecord(record) {
  const assetUrls = buildAssetUrls(record.assetId)

  return {
    assetId: record.assetId,
    originalName: record.originalName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    totalChunks: record.totalChunks,
    receivedChunkCount: record.receivedChunks.length,
    receivedChunks: [...record.receivedChunks].sort((left, right) => left - right),
    uploadStatus: record.uploadStatus,
    processingStatus: record.processingStatus,
    processingStage: record.processingStage,
    processingProgress: record.processingProgress ?? 0,
    media: record.media,
    audio: record.audio,
    transcript: record.transcript,
    aiAnalysis: record.aiAnalysis,
    sceneAnalysis: record.sceneAnalysis ?? null,
    broll: record.broll ?? [],
    renders: record.renders ?? [],
    errors: record.errors,
    warnings: record.warnings ?? [],
    music: record.music ? { originalName: record.music.originalName, durationSec: record.music.durationSec } : null,
    draftSettings: record.draftSettings ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    previewUrls: assetUrls,
    assetUrls
  }
}

export function updateAssetRecord(assetId, update) {
  return withAssetLock(assetId, async () => {
    const record = await loadAssetRecord(assetId)
    await update(record)
    return saveAssetRecord(record)
  })
}
