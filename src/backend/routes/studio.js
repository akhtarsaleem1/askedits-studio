import express from "express"
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import multer from "multer"
import config from "../../../config/default.js"
import { EDIT_TEMPLATES } from "../../shared/edit-templates.js"
import {
  normalizeEditSettings,
  suggestClips,
  transcriptCaptions
} from "../../shared/edit-planner.js"
import { buildAssetLayout } from "../utils/storage-layout.js"
import { createHttpError } from "../utils/errors.js"
import { canRunCommand, runCommand } from "../utils/process-runner.js"
import {
  loadAssetRecord,
  updateAssetRecord,
  serializeAssetRecord
} from "../services/upload-repository.js"
import {
  planTemplateEdit,
  readOptionalJson
} from "../services/template-renderer.js"
import {
  getTemplateRender,
  publicRender,
  cancelTemplateRender
} from "../services/template-jobs.js"
import { getLocalTranscriptionStatus } from "../services/transcription-service.js"
import { isAssetProcessing } from "../services/media-processing-service.js"
import { getFFmpegStatus } from "../services/ffmpeg-runtime.js"

const router = express.Router()
const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next)
const tempRoot = path.resolve(config.upload.storageRoot, ".incoming")
const musicUpload = multer({
  dest: tempRoot,
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(
      /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(file.originalname)
        ? null
        : createHttpError(
            415,
            "Choose MP3, WAV, M4A, OGG, FLAC, or AAC audio."
          ),
      true
    )
  }
})
let capabilityCache
router.get(
  "/capabilities",
  wrap(async (_req, res) => {
    if (!capabilityCache)
      capabilityCache = Promise.all([
        getFFmpegStatus(),
        canRunCommand(config.media.ffprobeBin, ["-version"]),
        getLocalTranscriptionStatus()
      ]).then(([ffmpeg, ffprobe, transcription]) => ({
        ffmpeg: ffmpeg.available,
        ffmpegVersion: ffmpeg.version,
        ffprobe,
        transcription,
        cloudTranscription: Boolean(config.ai.groqApiKey),
        templateCount: EDIT_TEMPLATES.length
      }))
    res.json(await capabilityCache)
  })
)
router.get("/templates", (_req, res) => res.json({ templates: EDIT_TEMPLATES }))
router.get(
  "/projects",
  wrap(async (_req, res) => {
    const entries = await fs
      .readdir(path.resolve(config.upload.storageRoot), { withFileTypes: true })
      .catch(() => [])
    const projects = []
    for (const entry of entries.filter(
      (e) => e.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(e.name)
    )) {
      try {
        const record = await loadAssetRecord(entry.name)
        projects.push({
          assetId: record.assetId,
          originalName: record.originalName,
          createdAt: record.createdAt,
          media: record.media,
          processingStatus: record.processingStatus,
          thumbnail: record.media
            ? "/api/uploads/" + record.assetId + "/assets/thumbnail"
            : null
        })
      } catch {
        /* An unfinished or legacy folder need not stop the project list. */
      }
    }
    res.json({
      projects: projects
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30)
    })
  })
)
router.param("assetId", (req, _res, next, id) => {
  try {
    buildAssetLayout(id)
    next()
  } catch (error) {
    next(error)
  }
})
router.get(
  "/:assetId/workspace",
  wrap(async (req, res) => {
    let record = await loadAssetRecord(req.params.assetId)
    if (
      ["queued", "processing"].includes(record.processingStatus) &&
      !isAssetProcessing(record.assetId)
    ) {
      record = await updateAssetRecord(record.assetId, (record) =>
        Object.assign(record, {
          processingStatus: "failed",
          errors: [
            "Preparation was interrupted by a server restart. Select Retry preparation."
          ]
        })
      )
    }
    const transcript = await readOptionalJson(record.paths.transcriptFile)
    const asset = serializeAssetRecord(record)
    asset.renders = (record.renders ?? [])
      .filter((job) => job.engine === "template")
      .map((job) => publicRender(job, record.assetId))
    res.json({
      asset,
      captions: transcriptCaptions(transcript),
      suggestions: record.media ? suggestClips(record.media, transcript) : []
    })
  })
)
router.post(
  "/:assetId/plan",
  wrap(async (req, res) => {
    const record = await loadAssetRecord(req.params.assetId)
    if (record.processingStatus !== "ready")
      throw createHttpError(409, "Media preparation is still in progress.")
    res.json(await planTemplateEdit(record, req.body))
  })
)
router.put(
  "/:assetId/draft",
  wrap(async (req, res) => {
    const record = await loadAssetRecord(req.params.assetId)
    const settings = normalizeEditSettings(req.body, record.media)
    await updateAssetRecord(record.assetId, (record) => {
      record.draftSettings = settings
    })
    res.json({ saved: true })
  })
)
router.post(
  "/:assetId/music",
  musicUpload.single("music"),
  wrap(async (req, res) => {
    if (!req.file) throw createHttpError(400, "Choose an audio track.")
    try {
      const record = await loadAssetRecord(req.params.assetId)
      const { stdout } = await runCommand({
        command: config.media.ffprobeBin,
        args: [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          req.file.path
        ],
        timeoutMs: 15000
      })
      const probe = JSON.parse(stdout)
      if (
        !probe.streams?.some((s) => s.codec_type === "audio") ||
        !(Number(probe.format?.duration) > 0)
      )
        throw createHttpError(415, "This file does not contain readable audio.")
      const musicDir = path.join(record.paths.assetRoot, "music")
      await fs.mkdir(musicDir, { recursive: true })
      const target = path.join(
        musicDir,
        randomUUID() + path.extname(req.file.originalname).toLowerCase()
      )
      await fs.rename(req.file.path, target)
      const music = {
        path: target,
        originalName: path.basename(req.file.originalname).slice(0, 160),
        durationSec: Number(probe.format.duration)
      }
      await updateAssetRecord(record.assetId, (record) => {
        record.music = music
      })
      res.json({
        music: {
          originalName: music.originalName,
          durationSec: music.durationSec
        }
      })
    } finally {
      await fs.unlink(req.file.path).catch(() => {})
    }
  })
)
router.get(
  "/:assetId/renders/:renderId",
  wrap(async (req, res) => {
    const { job } = await getTemplateRender(
      req.params.assetId,
      req.params.renderId
    )
    res.json(publicRender(job, req.params.assetId))
  })
)
router.post(
  "/:assetId/renders/:renderId/cancel",
  wrap(async (req, res) => {
    res.json(
      await cancelTemplateRender(req.params.assetId, req.params.renderId)
    )
  })
)
router.get(
  "/:assetId/renders/:renderId/:artifact",
  wrap(async (req, res) => {
    const { record, job } = await getTemplateRender(
      req.params.assetId,
      req.params.renderId
    )
    if (job.status !== "ready")
      throw createHttpError(409, "This render is not ready to download.")
    const field = { video: "video", captions: "srt", plan: "plan" }[
      req.params.artifact
    ]
    if (!field || !job.paths?.[field])
      throw createHttpError(404, "This artifact does not exist.")
    if (req.query.download === "1") {
      const stem = path
        .parse(record.originalName)
        .name.replace(/[^a-zA-Z0-9_-]+/g, "-")
      const extension = { video: ".mp4", srt: ".srt", plan: ".json" }[field]
      res.download(
        job.paths[field],
        stem + "-" + job.settings.templateId + extension
      )
    } else res.sendFile(path.resolve(job.paths[field]))
  })
)
export default router
