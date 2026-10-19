import fs from "node:fs/promises"
import { withAssetLock } from "../utils/asset-lock.js"
import { randomUUID } from "node:crypto"

import config from "../../../config/default.js"
import { validateVideoSelection } from "../../shared/upload-config.js"
import { createHttpError } from "../utils/errors.js"
import { buildAssetLayout, chunkFilePath, sanitizeFileName } from "../utils/storage-layout.js"
import { processVideoAsset } from "./media-processing-service.js"
import {
  ensureAssetDirectories,
  loadAssetRecord,
  saveAssetRecord,
  serializeAssetRecord
} from "./upload-repository.js"
import { generateAutoEdit } from "./auto-edit-engine.js"
import { enqueueRenderJob, getQueueStatus as getRenderQueueStatus } from "./render-queue.js"

function createAssetId() {
  return randomUUID().replace(/-/g, "")
}

function normalizeChunkCount(totalChunks) {
  const parsed = Number(totalChunks)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, "A valid total chunk count is required to create an upload session.")
  }

  return parsed
}

async function queueAssetProcessing(record) {
  record.processingStatus = "queued"
  record.processingStage = "queued"
  record.errors = []
  record.audio = null
  record.transcript = null

  const savedRecord = await saveAssetRecord(record)

  processVideoAsset(record.assetId).catch(async (error) => {
    const failedRecord = await loadAssetRecord(record.assetId)
    failedRecord.processingStatus = "failed"
    failedRecord.processingStage = "failed"
    failedRecord.errors = [...(failedRecord.errors ?? []), error.message]
    await saveAssetRecord(failedRecord)
  })

  return savedRecord
}

async function assembleChunks(record) {
  const chunkIndexes = Array.from({ length: record.totalChunks }, (_, index) => index)

  for (const index of chunkIndexes) {
    const expectedPath = chunkFilePath(record.paths, index)

    try {
      await fs.access(expectedPath)
    } catch {
      throw createHttpError(400, `Chunk ${index + 1} of ${record.totalChunks} is missing.`)
    }
  }

  const handle = await fs.open(record.paths.originalFile, "w")

  try {
    for (const index of chunkIndexes) {
      const nextChunk = await fs.readFile(chunkFilePath(record.paths, index))
      await handle.write(nextChunk)
    }
  } finally {
    await handle.close()
  }

  await Promise.all(chunkIndexes.map((index) => fs.unlink(chunkFilePath(record.paths, index)).catch(() => undefined)))
}

export async function createUploadSession(payload = {}) {
  const originalName = sanitizeFileName(payload.originalName)
  const fileSize = Number(payload.fileSize ?? 0)
  const mimeType = payload.mimeType || "application/octet-stream"
  const totalChunks = normalizeChunkCount(payload.totalChunks)
  const validation = validateVideoSelection({ name: originalName, size: fileSize })

  if (!validation.valid) {
    throw createHttpError(400, validation.errors.join(" "))
  }

  if (totalChunks !== Math.ceil(fileSize / config.upload.chunkSizeBytes)) {
    throw createHttpError(400, "Chunk count does not match the declared file size.")
  }

  const assetId = createAssetId()
  const layout = buildAssetLayout(assetId, originalName, config.upload.storageRoot)
  const now = new Date().toISOString()

  await ensureAssetDirectories(layout)

  const record = {
    assetId,
    originalName,
    mimeType,
    fileSize,
    totalChunks,
    receivedChunks: [],
    uploadStatus: "initialized",
    processingStatus: "idle",
    processingStage: "idle",
    media: null,
    audio: null,
    transcript: null,
    aiAnalysis: null,
    errors: [],
    createdAt: now,
    updatedAt: now,
    paths: layout
  }

  const savedRecord = await saveAssetRecord(record)
  return serializeAssetRecord(savedRecord)
}

export function saveUploadChunk(assetId, index, buffer) {
  return withAssetLock(assetId, () => saveUploadChunkUnlocked(assetId, index, buffer))
}

async function saveUploadChunkUnlocked(assetId, index, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, "Chunk body is empty or unreadable.")
  }

  const record = await loadAssetRecord(assetId)
  const chunkIndex = Number(index)

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= record.totalChunks) {
    throw createHttpError(400, "Chunk index is outside the expected upload range.")
  }

  if (!["initialized", "uploading"].includes(record.uploadStatus)) {
    throw createHttpError(409, "This upload no longer accepts chunks.")
  }
  const expectedSize = Math.min(config.upload.chunkSizeBytes, record.fileSize - chunkIndex * config.upload.chunkSizeBytes)
  if (buffer.length !== expectedSize) {
    throw createHttpError(400, "Chunk size does not match the declared upload size.")
  }

  await fs.writeFile(chunkFilePath(record.paths, chunkIndex), buffer)

  if (!record.receivedChunks.includes(chunkIndex)) {
    record.receivedChunks.push(chunkIndex)
  }

  record.uploadStatus = "uploading"

  const savedRecord = await saveAssetRecord(record)
  return serializeAssetRecord(savedRecord)
}

export function completeUploadSession(assetId) {
  return withAssetLock(assetId, () => completeUploadSessionUnlocked(assetId))
}

async function completeUploadSessionUnlocked(assetId) {
  const record = await loadAssetRecord(assetId)
  if (record.uploadStatus === "uploaded") return serializeAssetRecord(record)

  if (record.receivedChunks.length !== record.totalChunks) {
    throw createHttpError(400, "Upload is incomplete. Not all chunks have been received yet.")
  }

  record.uploadStatus = "assembling"
  await saveAssetRecord(record)

  await assembleChunks(record)

  record.uploadStatus = "uploaded"
  const savedRecord = await queueAssetProcessing(record)

  return serializeAssetRecord(savedRecord)
}

export async function getUploadStatus(assetId) {
  const record = await loadAssetRecord(assetId)
  return serializeAssetRecord(record)
}

export async function getUploadArtifactPath(assetId, artifact) {
  const record = await loadAssetRecord(assetId)
  const artifactMap = {
    original: record.paths.originalFile,
    optimized: record.paths.optimizedFile,
    proxy: record.paths.proxyFile,
    thumbnail: record.paths.thumbnailFile,
    audio: record.paths.audioFile,
    transcript: record.paths.transcriptFile,
    "transcript-raw": record.paths.transcriptRawFile,
    "viral-moments": record.paths.viralMomentsFile,
    "style-analysis": record.paths.styleAnalysisFile,
    "edit-plan": record.paths.editPlanFile,
    "scene-detection": record.paths.sceneDetectionFile,
    "face-detection": record.paths.faceDetectionFile,
    "silence-detection": record.paths.silenceDetectionFile
  }

  if (artifact.startsWith("broll:") || artifact.startsWith("broll_") || artifact.startsWith("custom_")) {
    const rawFileName = artifact.startsWith("broll:") ? artifact.slice("broll:".length) : artifact
    const fileName = path.basename(decodeURIComponent(rawFileName))
    const brollPath = path.join(record.paths.brollDir, fileName)

    try {
      await fs.access(brollPath)
      return brollPath
    } catch {
      throw createHttpError(404, `B-roll asset "${fileName}" is not ready yet.`)
    }
  }

  // Handle dynamic render artifacts (e.g. render:render_1234.mp4)
  if (artifact.startsWith("render:")) {
    const renderId = artifact.split(":")[1]
    const renderMeta = (record.renders ?? []).find(r => r.renderId === renderId)
    if (renderMeta && renderMeta.paths.video) {
      try {
        await fs.access(renderMeta.paths.video)
        return renderMeta.paths.video
      } catch {
        throw createHttpError(404, `Render output "${renderId}" is not ready yet.`)
      }
    }
    throw createHttpError(404, `Render output "${renderId}" not found.`)
  }

  const selectedPath = artifactMap[artifact]

  if (!selectedPath) {
    throw createHttpError(404, `Unknown upload artifact "${artifact}".`)
  }

  try {
    await fs.access(selectedPath)
    return selectedPath
  } catch {
    throw createHttpError(404, `Artifact "${artifact}" is not ready yet.`)
  }
}

export async function reprocessUploadAsset(assetId) {
  const record = await loadAssetRecord(assetId)

  if (record.uploadStatus !== "uploaded") {
    throw createHttpError(409, "Only completed uploads can be reprocessed.")
  }

  try {
    await fs.access(record.paths.originalFile)
  } catch {
    throw createHttpError(404, "The original uploaded media file could not be found for reprocessing.")
  }

  const savedRecord = await queueAssetProcessing(record)
  return serializeAssetRecord(savedRecord)
}

export async function analyzeUploadAsset(assetId) {
  const { runAiAnalysis } = await import("./ai-analysis-service.js")
  const record = await loadAssetRecord(assetId)

  if (record.processingStatus !== "ready") {
    throw createHttpError(409, "AI analysis requires a fully processed asset. Wait for processing to complete first.")
  }

  try {
    await fs.access(record.paths.transcriptFile)
  } catch {
    throw createHttpError(404, "Transcript file not found. Transcription must complete before AI analysis can run.")
  }

  record.aiAnalysis = { status: "running" }
  const savedRecord = await saveAssetRecord(record)

  runAiAnalysis(record)
    .then(async (aiAnalysis) => {
      const latest = await loadAssetRecord(assetId)
      latest.aiAnalysis = aiAnalysis
      await saveAssetRecord(latest)
    })
    .catch(async (error) => {
      const latest = await loadAssetRecord(assetId)
      latest.aiAnalysis = { status: "failed", error: error.message }
      await saveAssetRecord(latest)
    })

  return serializeAssetRecord(savedRecord)
}

export async function startAutoEdit(assetId, settings) {
  const record = await loadAssetRecord(assetId)

  if (record.processingStatus !== "ready") {
    throw createHttpError(409, "Asset processing must complete before auto-editing.")
  }

  // Generate an ID for this render job
  const renderId = `render_${Date.now()}`
  
  // Track status
  record.renders = record.renders ?? []
  const renderJob = {
    renderId,
    status: "queued",
    progress: 0,
    settings,
    startedAt: new Date().toISOString()
  }
  record.renders.push(renderJob)
  await saveAssetRecord(record)

  // Enqueue into render queue instead of raw Promise chain
  enqueueRenderJob({
    jobId: renderId,
    assetId,
    settings,
    executor: async (onProgress) => {
      // Update status to running
      const latest = await loadAssetRecord(assetId)
      const job = latest.renders.find(r => r.renderId === renderId)
      if (job) { job.status = "running"; await saveAssetRecord(latest) }

      return generateAutoEdit(assetId, latest, settings, renderId, async (pct) => {
        onProgress(pct)
        try {
          const rec = await loadAssetRecord(assetId)
          const j = rec.renders.find(r => r.renderId === renderId)
          if (j) { j.progress = pct; await saveAssetRecord(rec) }
        } catch {}
      }).then(async (renderMeta) => {
        const finalRec = await loadAssetRecord(assetId)
        const finalJob = finalRec.renders.find(r => r.renderId === renderId)
        if (finalJob) {
           finalJob.paths = renderMeta.paths
           await saveAssetRecord(finalRec)
        }
        return renderMeta;
      })
    },
    onProgress: () => {},
    priority: 0
  })

  // Set up completion handler via polling (the queue handles execution)
  pollRenderCompletion(assetId, renderId)

  return { renderId, status: "queued" }
}

// Background poll for queue-based render completion
async function pollRenderCompletion(assetId, renderId) {
  const { getJobStatus } = await import("./render-queue.js")
  const interval = setInterval(async () => {
    try {
      const jobStatus = getJobStatus(renderId)
      if (!jobStatus) { clearInterval(interval); return }

      if (jobStatus.status === "ready" || jobStatus.status === "failed") {
        clearInterval(interval)
        const latest = await loadAssetRecord(assetId)
        const job = latest.renders.find(r => r.renderId === renderId)
        if (job) {
          job.status = jobStatus.status
          job.progress = jobStatus.status === "ready" ? 100 : job.progress
          if (jobStatus.status === "failed") job.error = jobStatus.error
          job.completedAt = new Date().toISOString()
          await saveAssetRecord(latest)
        }
      }
    } catch {}
  }, 2000)
}

export async function getRenderStatus(assetId, renderId) {
  const record = await loadAssetRecord(assetId)
  const job = (record.renders ?? []).find(r => r.renderId === renderId)
  
  if (!job) {
    throw createHttpError(404, `Render job "${renderId}" not found.`)
  }
  
  return job
}

// --- Manual Editing Phase 10 ---

export async function saveEditPlan(assetId, editPlan) {
  const assetRecord = await loadAssetRecord(assetId)
  if (editPlan.summary) {
    assetRecord.aiAnalysis = { ...assetRecord.aiAnalysis, ...editPlan.summary }
  }
  await saveAssetRecord(assetRecord)

  const assetPath = await getUploadArtifactPath(assetId, "edit-plan")
  await fs.writeFile(assetPath, JSON.stringify(editPlan, null, 2))
  return editPlan
}

import path from "node:path"
import { searchBrollVideo, downloadBrollClip } from "./broll-search-service.js"

function sanitizeFormatId(formatId = "original") {
  return String(formatId || "original").replace(/[^a-z0-9_-]/gi, "_")
}

async function loadMutableEditPlan(assetRecord) {
  try {
    const raw = await fs.readFile(assetRecord.paths.editPlanFile, "utf8")
    return JSON.parse(raw)
  } catch {
    throw new Error("No edit plan found for this asset.")
  }
}

async function savePlanAndSummary(assetRecord, editPlan) {
  if (editPlan.summary) {
    assetRecord.aiAnalysis = { ...assetRecord.aiAnalysis, ...editPlan.summary }
  }

  await Promise.all([
    saveAssetRecord(assetRecord),
    fs.writeFile(assetRecord.paths.editPlanFile, JSON.stringify(editPlan, null, 2))
  ])
}

function getBrollTargetPath(assetRecord, brollId, exportFormat) {
  return path.join(assetRecord.paths.brollDir, `broll_${brollId}_${sanitizeFormatId(exportFormat)}.mp4`)
}

export async function replaceBroll(assetId, brollId, query, exportFormat = "original") {
  const assetRecord = await loadAssetRecord(assetId)
  const editPlan = await loadMutableEditPlan(assetRecord)
  const brollItem = editPlan.timeline?.broll?.find(b => b.id === brollId)
  if (!brollItem) throw new Error("B-roll item not found in edit plan")

  brollItem.suggestedQuery = query
  brollItem.updatedAt = new Date().toISOString()

  const targetPath = getBrollTargetPath(assetRecord, brollId, exportFormat)
  const url = await searchBrollVideo(query, exportFormat)
  if (url) {
    await downloadBrollClip(url, targetPath)
  } else {
    throw new Error(`Could not find any B-roll for '${query}'`)
  }

  await savePlanAndSummary(assetRecord, editPlan)
  
  return brollItem
}

export async function uploadCustomBroll(assetId, brollId, file) {
  const assetRecord = await loadAssetRecord(assetId)
  const editPlan = await loadMutableEditPlan(assetRecord)
  const brollItem = editPlan.timeline?.broll?.find(b => b.id === brollId)
  if (!brollItem) throw new Error("B-roll item not found")

  // file is multer file object
  const ext = path.extname(file.originalname) || ".mp4"
  const fileName = `custom_${brollId}${ext}`
  const targetPath = path.join(assetRecord.paths.brollDir, fileName)

  await fs.copyFile(file.path, targetPath)
  // Clean up the temp file
  await fs.unlink(file.path).catch(() => {})

  // We set a special marker in the suggestedQuery to indicate it's a custom file
  brollItem.suggestedQuery = `custom:${fileName}`
  brollItem.updatedAt = new Date().toISOString()

  await savePlanAndSummary(assetRecord, editPlan)
  
  return brollItem
}

import { regenerateEditPlanSection } from "./edit-plan-regenerate-service.js"

export async function regenerateEditPlan(assetId, mode) {
  const assetRecord = await loadAssetRecord(assetId)
  const editPlanPath = await getUploadArtifactPath(assetId, "edit-plan")
  const transcriptPath = await getUploadArtifactPath(assetId, "transcript")
  const styleAnalysisPath = await getUploadArtifactPath(assetId, "style-analysis")

  const currentEditPlan = JSON.parse(await fs.readFile(editPlanPath, "utf-8"))
  const transcript = JSON.parse(await fs.readFile(transcriptPath, "utf-8"))
  const styleAnalysis = JSON.parse(await fs.readFile(styleAnalysisPath, "utf-8"))

  const updatedPlan = await regenerateEditPlanSection({
    currentEditPlan, transcript, styleAnalysis, mode, durationSec: assetRecord.media.durationSec
  })

  // Update assetRecord summary to keep things in sync without storing the full plan
  if (updatedPlan.summary) {
    assetRecord.aiAnalysis = { ...assetRecord.aiAnalysis, ...updatedPlan.summary }
  }
  await saveAssetRecord(assetRecord)

  await fs.writeFile(editPlanPath, JSON.stringify(updatedPlan, null, 2))
  return updatedPlan
}

// --- Phase 11: Queue Status ---
export { getRenderQueueStatus as getQueueStatus }

// --- Phase 13.1: AI Thumbnails ---
export async function generateThumbnails(assetId) {
  const { generateAiThumbnails } = await import("./thumbnail-generator-service.js")
  const record = await loadAssetRecord(assetId)
  if (record.processingStatus !== "ready") {
    throw createHttpError(409, "Asset must be fully processed before generating thumbnails.")
  }
  return generateAiThumbnails(record)
}

export async function listThumbnails(assetId) {
  const { listAiThumbnails } = await import("./thumbnail-generator-service.js")
  const record = await loadAssetRecord(assetId)
  return listAiThumbnails(record)
}

// --- Phase 13.2: AI Hook Rewriter ---
export async function analyzeVideoHook(assetId) {
  const { analyzeHook } = await import("./hook-rewriter-service.js")
  const record = await loadAssetRecord(assetId)
  if (record.processingStatus !== "ready") {
    throw createHttpError(409, "Asset must be fully processed before hook analysis.")
  }
  return analyzeHook(record)
}

export async function generateVideoHookVariations(assetId) {
  const { generateHookVariations } = await import("./hook-rewriter-service.js")
  const record = await loadAssetRecord(assetId)
  return generateHookVariations(record)
}

export async function applyVideoHookRewrite(assetId, hookVariant) {
  const { applyHookRewrite } = await import("./hook-rewriter-service.js")
  const record = await loadAssetRecord(assetId)
  const updatedPlan = await applyHookRewrite(record, hookVariant)

  if (updatedPlan.summary) {
    record.aiAnalysis = { ...record.aiAnalysis, ...updatedPlan.summary }
  }
  await saveAssetRecord(record)

  const editPlanPath = record.paths.editPlanFile
  await fs.writeFile(editPlanPath, JSON.stringify(updatedPlan, null, 2))
  return updatedPlan
}

// --- Phase 13.3: AI Generated B-Rolls ---
export async function generateAiBrollClip(assetId, { prompt, durationSec, style, exportFormat }) {
  const { generateAiBroll } = await import("./ai-broll-generator-service.js")
  const record = await loadAssetRecord(assetId)
  return generateAiBroll({ assetRecord: record, prompt, durationSec, style, exportFormat })
}

// --- Phase 13.4: AI Co-Editor Chat ---
export async function processCoEditorChat(assetId, command, chatHistory) {
  const { processCoEditorCommand } = await import("./co-editor-service.js")
  const record = await loadAssetRecord(assetId)

  const result = await processCoEditorCommand(record, command, chatHistory)

  // Save updated plan
  if (result.updatedPlan.summary) {
    record.aiAnalysis = { ...record.aiAnalysis, ...result.updatedPlan.summary }
  }
  await saveAssetRecord(record)

  const editPlanPath = record.paths.editPlanFile
  await fs.writeFile(editPlanPath, JSON.stringify(result.updatedPlan, null, 2))

  return {
    response: result.response,
    changesSummary: result.changesSummary,
    updatedPlan: result.updatedPlan,
    model: result.model
  }
}
