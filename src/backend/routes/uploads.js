import express from "express"
import path from "node:path"
import fs from "node:fs/promises"

import {
  analyzeUploadAsset,
  completeUploadSession,
  createUploadSession,
  getUploadArtifactPath,
  getUploadStatus,
  reprocessUploadAsset,
  saveUploadChunk,
  startAutoEdit,
  getRenderStatus,
  saveEditPlan,
  replaceBroll,
  uploadCustomBroll,
  regenerateEditPlan,
  getQueueStatus,
  generateThumbnails,
  listThumbnails,
  analyzeVideoHook,
  generateVideoHookVariations,
  applyVideoHookRewrite,
  generateAiBrollClip,
  processCoEditorChat
} from "../services/upload-service.js"

// Use multer for custom broll upload
import multer from "multer"
const upload = multer({ dest: "storage/temp/" })

const router = express.Router()
const chunkParser = express.raw({
  type: () => true,
  limit: "8mb"
})

function asyncHandler(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response)
    } catch (error) {
      next(error)
    }
  }
}

// --- Phase 11: Render Queue Status ---
router.get(
  "/queue/status",
  asyncHandler(async (request, response) => {
    const status = getQueueStatus()
    response.json(status)
  })
)

// --- Phase 11.3: GPU Status ---
router.get(
  "/gpu/status",
  asyncHandler(async (request, response) => {
    const { detectGpuCapabilities } = await import("../services/gpu-detector.js")
    const caps = await detectGpuCapabilities()
    response.json(caps)
  })
)

router.post(
  "/session",
  asyncHandler(async (request, response) => {
    const asset = await createUploadSession(request.body)
    response.status(201).json({ asset })
  })
)

router.put(
  "/:assetId/chunks/:index",
  chunkParser,
  asyncHandler(async (request, response) => {
    const asset = await saveUploadChunk(request.params.assetId, request.params.index, request.body)
    response.status(202).json({ asset })
  })
)

router.post(
  "/:assetId/complete",
  asyncHandler(async (request, response) => {
    const asset = await completeUploadSession(request.params.assetId)
    response.status(202).json({ asset })
  })
)

router.post(
  "/:assetId/reprocess",
  asyncHandler(async (request, response) => {
    const asset = await reprocessUploadAsset(request.params.assetId)
    response.status(202).json({ asset })
  })
)

router.post(
  "/:assetId/analyze",
  asyncHandler(async (request, response) => {
    const asset = await analyzeUploadAsset(request.params.assetId)
    response.status(202).json({ asset })
  })
)

router.get(
  "/:assetId/status",
  asyncHandler(async (request, response) => {
    const asset = await getUploadStatus(request.params.assetId)
    response.json({ asset })
  })
)

router.get(
  "/:assetId/assets/:artifact",
  asyncHandler(async (request, response) => {
    const artifact = request.params.artifact

    // Handle AI thumbnail artifacts (e.g. ai-thumbnail:thumb-0-clean.jpg)
    if (artifact.startsWith("ai-thumbnail:")) {
      const fileName = artifact.slice("ai-thumbnail:".length)
      if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(fileName)) {
        response.status(400).json({ error: "Invalid thumbnail filename." })
        return
      }
      const { loadAssetRecord } = await import("../services/upload-repository.js")
      const record = await loadAssetRecord(request.params.assetId)
      const filePath = path.join(record.paths.thumbnailsDir, "ai", fileName)
      try {
        await fs.access(filePath)
        response.sendFile(path.resolve(filePath))
        return
      } catch {
        response.status(404).json({ error: "AI thumbnail not found." })
        return
      }
    }

    const assetPath = await getUploadArtifactPath(request.params.assetId, artifact)
    response.sendFile(assetPath)
  })
)

router.post(
  "/:assetId/render",
  asyncHandler(async (request, response) => {
    const renderInfo = await startAutoEdit(request.params.assetId, request.body)
    response.status(202).json(renderInfo)
  })
)

router.get(
  "/:assetId/render/:renderId/status",
  asyncHandler(async (request, response) => {
    const status = await getRenderStatus(request.params.assetId, request.params.renderId)
    response.json(status)
  })
)

router.put(
  "/:assetId/edit-plan",
  express.json({ limit: "50mb" }),
  asyncHandler(async (request, response) => {
    const plan = await saveEditPlan(request.params.assetId, request.body)
    response.json(plan)
  })
)

router.post(
  "/:assetId/regenerate",
  express.json(),
  asyncHandler(async (request, response) => {
    const newPlan = await regenerateEditPlan(request.params.assetId, request.body.mode)
    response.json(newPlan)
  })
)

router.post(
  "/:assetId/broll/:brollId/replace",
  express.json(),
  asyncHandler(async (request, response) => {
    const updatedBroll = await replaceBroll(
      request.params.assetId,
      request.params.brollId,
      request.body.query,
      request.body.exportFormat
    )
    response.json(updatedBroll)
  })
)

router.post(
  "/:assetId/broll/upload",
  upload.single("file"),
  asyncHandler(async (request, response) => {
    if (!request.file) throw new Error("No file uploaded")
    const updatedBroll = await uploadCustomBroll(request.params.assetId, request.body.brollId, request.file)
    response.json(updatedBroll)
  })
)

// --- Phase 13.1: AI Thumbnails ---
router.post(
  "/:assetId/thumbnails/generate",
  asyncHandler(async (request, response) => {
    const result = await generateThumbnails(request.params.assetId)
    response.json(result)
  })
)

router.get(
  "/:assetId/thumbnails/ai",
  asyncHandler(async (request, response) => {
    const result = await listThumbnails(request.params.assetId)
    response.json(result)
  })
)

// --- Phase 13.2: AI Hook Rewriter ---
router.post(
  "/:assetId/hooks/analyze",
  asyncHandler(async (request, response) => {
    const result = await analyzeVideoHook(request.params.assetId)
    response.json(result)
  })
)

router.post(
  "/:assetId/hooks/variations",
  asyncHandler(async (request, response) => {
    const result = await generateVideoHookVariations(request.params.assetId)
    response.json(result)
  })
)

router.post(
  "/:assetId/hooks/apply",
  express.json(),
  asyncHandler(async (request, response) => {
    const updatedPlan = await applyVideoHookRewrite(request.params.assetId, request.body)
    response.json(updatedPlan)
  })
)

// --- Phase 13.3: AI Generated B-Rolls ---
router.post(
  "/:assetId/broll/generate",
  express.json(),
  asyncHandler(async (request, response) => {
    const result = await generateAiBrollClip(request.params.assetId, request.body)
    response.json(result)
  })
)

// --- Phase 13.4: AI Co-Editor Chat ---
router.post(
  "/:assetId/co-editor",
  express.json(),
  asyncHandler(async (request, response) => {
    const result = await processCoEditorChat(
      request.params.assetId,
      request.body.command,
      request.body.chatHistory ?? []
    )
    response.json(result)
  })
)

export default router
