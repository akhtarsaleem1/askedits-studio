import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import config from "../../../config/default.js"
import { captionScenes, rankVisual } from "../../shared/caption-director.js"
import { normalizeEditSettings } from "../../shared/edit-planner.js"
import { loadAssetRecord, updateAssetRecord } from "./upload-repository.js"
import { planTemplateEdit } from "./template-renderer.js"
import {
  searchStock,
  stockResult,
  downloadStock
} from "./stock-media-service.js"
import { registerVisual } from "./visual-library.js"
import { createHttpError } from "../utils/errors.js"
import { captionSemanticScores } from "./caption-matcher.js"

const active = new Map()
export function stockQueries(plan) {
  const scenes = captionScenes(plan.captions, plan.summary.outputDurationSec)
  const seen = new Set()
  return scenes
    .filter((scene) => {
      const key = scene.topic === "story" ? scene.searchQuery : scene.topic
      if (!scene.searchQuery || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Number(a.topic === "story") - Number(b.topic === "story"))
    .slice(0, 6)
}
export async function getStockJob(assetId) {
  const record = await loadAssetRecord(assetId)
  if (record.stockJob?.status === "running" && !active.has(assetId)) {
    await updateAssetRecord(assetId, (current) => {
      current.stockJob.status = "interrupted"
      current.stockJob.message =
        "Download interrupted by a server restart. Imported clips are saved; run again to find the rest."
    })
    return (await loadAssetRecord(assetId)).stockJob
  }
  return record.stockJob ?? null
}
export async function cancelStockJob(assetId) {
  const job = await getStockJob(assetId)
  active.get(assetId)?.abort()
  return job
}
export async function startStockJob(assetId, input, provider = "mixkit") {
  if (!["mixkit", "pexels", "commons"].includes(provider))
    throw createHttpError(400, "Choose a supported stock provider.")
  if (active.has(assetId))
    throw createHttpError(
      409,
      "Footage is already downloading for this project."
    )
  if (active.size >= 2)
    throw createHttpError(
      409,
      "Two footage searches are already running. Try again when one finishes."
    )
  if (provider === "pexels" && !config.broll.pexelsApiKey)
    throw createHttpError(
      409,
      "Pexels needs a server API key. Select the no-key collection instead."
    )
  const record = await loadAssetRecord(assetId)
  if (record.processingStatus !== "ready")
    throw createHttpError(409, "Wait for media preparation to finish.")
  if ((record.visualAssets?.length ?? 0) >= 24)
    throw createHttpError(409, "The B-roll library is full (24 clips).")
  const settings = normalizeEditSettings(
    { ...input, visualMode: "captions" },
    record.media
  )
  if (active.has(assetId) || active.size >= 2)
    throw createHttpError(
      409,
      "A footage search is already running. Try again when it finishes."
    )
  const controller = new AbortController()
  active.set(assetId, controller)
  const job = {
    id: randomUUID(),
    status: "running",
    provider,
    imported: [],
    warnings: [],
    completed: 0,
    total: 0,
    message: "Reading caption topics…",
    startedAt: new Date().toISOString()
  }
  try {
    await updateAssetRecord(assetId, (current) => {
      current.stockJob = job
    })
  } catch (error) {
    active.delete(assetId)
    throw error
  }
  const save = async () =>
    updateAssetRecord(assetId, (current) => {
      current.stockJob = structuredClone(job)
    })
  setImmediate(async () => {
    const tempRoot = path.resolve(config.upload.storageRoot, ".incoming")
    try {
      const plan = await planTemplateEdit(record, settings)
      const scenes = stockQueries(plan)
      if (!scenes.length)
        throw new Error(
          "Add or transcribe captions first so the editor can find footage that matches your narration."
        )
      job.total = scenes.length
      await fs.mkdir(tempRoot, { recursive: true })
      let existing = record.visualAssets ?? []
      for (const scene of scenes) {
        controller.signal.throwIfAborted()
        if (job.imported.length >= 4 || existing.length >= 24) break
        job.message = "Finding footage: " + scene.topic + "…"
        await save()
        const query =
          scene.searchQuery + (scene.topic === "story" ? "" : " " + scene.topic)
        try {
          const response = await searchStock(
            query.slice(0, 100),
            provider,
            "video"
          )
          const available = response.items
            .map((result) => stockResult(result.id))
            .filter(
              (item) =>
                !existing.some((visual) => visual.source?.url === item.url)
            )
          const semantic = await captionSemanticScores(
            [{ id: scene.id, text: scene.text }],
            available.map((item) => ({
              id: item.id,
              originalName: item.title,
              description: item.description ?? ""
            }))
          )
          const candidates = available
            .map((item) => ({
              item,
              score: rankVisual(
                scene,
                {
                  originalName: item.title,
                  description: item.description ?? "",
                  source: { provider: item.provider }
                },
                semantic.scores[scene.id]?.[item.id]
              ).score
            }))
            .filter((entry) => entry.score >= 0.34)
            .sort((a, b) => b.score - a.score)
          for (const { item } of candidates.slice(0, 2)) {
            controller.signal.throwIfAborted()
            const temporary = path.join(tempRoot, randomUUID() + ".download")
            try {
              job.message = "Downloading " + item.title + "…"
              await save()
              await downloadStock(item, temporary, controller.signal)
              controller.signal.throwIfAborted()
              const { provider, author, license, licenseUrl, url } = item
              const fresh = await loadAssetRecord(assetId)
              if (fresh.visualAssets?.some((v) => v.source?.url === url)) break
              const visual = await registerVisual(
                fresh,
                temporary,
                item.title,
                { provider, author, license, licenseUrl, url }
              )
              // Use actual provider descriptions; never label footage with the user's words.
              if (item.description)
                await updateAssetRecord(assetId, (current) => {
                  current.visualAssets.find(
                    (v) => v.id === visual.id
                  ).description = item.description
                })
              existing = (await loadAssetRecord(assetId)).visualAssets
              job.imported.push(visual.id)
              break
            } catch (error) {
              if (controller.signal.aborted) throw error
              job.warnings.push(item.title + ": " + error.message)
            } finally {
              await fs.unlink(temporary).catch(() => {})
            }
          }
        } catch (error) {
          if (controller.signal.aborted) throw error
          job.warnings.push(scene.topic + ": " + error.message)
        }
        job.completed++
        await save()
      }
      job.status =
        !job.imported.length && job.warnings.length ? "failed" : "ready"
      job.message = job.imported.length
        ? `Added ${job.imported.length} real video clips. Caption matching decides their timing; preview the edit to review.`
        : job.warnings.length
          ? "Footage could not be downloaded. Open provider notices for details, then try another provider or retry."
          : "No new relevant footage was available. Existing clips remain saved. Try another provider or a more specific manual search."
    } catch (error) {
      job.status = controller.signal.aborted ? "cancelled" : "failed"
      job.message = controller.signal.aborted
        ? "Download cancelled. Already imported clips are saved."
        : error.message
    } finally {
      job.finishedAt = new Date().toISOString()
      try {
        await save()
      } catch (error) {
        console.error("Could not save footage job status:", error.message)
      } finally {
        active.delete(assetId)
      }
    }
  })
  return structuredClone(job)
}
