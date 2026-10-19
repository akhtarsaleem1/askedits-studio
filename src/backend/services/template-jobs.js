import { editFingerprint } from "../../shared/edit-planner.js"
import { randomUUID } from "node:crypto"
import { loadAssetRecord, updateAssetRecord } from "./upload-repository.js"
import { enqueueRenderJob, getJobStatus, cancelJob } from "./render-queue.js"
import { planTemplateEdit, renderTemplateVideo } from "./template-renderer.js"
import { createHttpError } from "../utils/errors.js"

const controllers = new Map()
export function publicRender(job, assetId) {
  const base = "/api/studio/" + assetId + "/renders/" + job.renderId
  return {
    renderId: job.renderId,
    engine: job.engine,
    fingerprint: job.fingerprint,
    status: job.status,
    progress: job.progress ?? 0,
    preview: job.settings?.preview ?? false,
    templateId: job.settings?.templateId,
    error: job.error ?? null,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    summary: job.summary ?? null,
    dimensions: job.dimensions ?? null,
    output: job.output ?? null,
    warnings: job.warnings ?? [],
    urls:
      job.status === "ready"
        ? {
            video: base + "/video",
            captions: base + "/captions",
            plan: base + "/plan",
            credits: job.paths?.credits ? base + "/credits" : null,
            poster: job.paths?.poster ? base + "/poster" : null
          }
        : null
  }
}
export async function createTemplateRender(assetId, input) {
  const record = await loadAssetRecord(assetId)
  if (record.processingStatus !== "ready")
    throw createHttpError(
      409,
      "Wait for media preparation to finish before rendering."
    )
  const plan = await planTemplateEdit(record, input)
  const renderId = "render_" + randomUUID().replaceAll("-", "")
  const controller = new AbortController()
  const job = {
    engine: "template",
    fingerprint: editFingerprint(plan.settings, record.media),
    renderId,
    status: "queued",
    progress: 0,
    settings: plan.settings,
    summary: plan.summary,
    dimensions: plan.dimensions,
    startedAt: new Date().toISOString()
  }
  await updateAssetRecord(assetId, (record) => {
    record.renders ??= []
    record.renders.push(job)
  })
  controllers.set(renderId, controller)
  const patch = (changes) =>
    updateAssetRecord(assetId, (record) => {
      const item = record.renders.find((r) => r.renderId === renderId)
      if (item) Object.assign(item, changes)
    })
  try {
    enqueueRenderJob({
      jobId: renderId,
      assetId,
      settings: plan.settings,
      executor: async () => {
        let pending = Promise.resolve(),
          lastUpdate = 0,
          lastPercent = 0
        try {
          await patch({ status: "running" })
          const current = await loadAssetRecord(assetId)
          const result = await renderTemplateVideo(
            current,
            plan.settings,
            renderId,
            (percent) => {
              if (percent <= lastPercent || Date.now() - lastUpdate < 650)
                return
              lastPercent = percent
              lastUpdate = Date.now()
              pending = pending
                .then(() => patch({ progress: percent }))
                .catch((error) =>
                  console.warn("Progress persistence:", error.message)
                )
            },
            controller.signal
          )
          await pending
          await patch({
            ...result,
            status: "ready",
            progress: 100,
            completedAt: new Date().toISOString()
          })
          return result
        } catch (error) {
          await pending
          await patch({
            status: error.name === "AbortError" ? "cancelled" : "failed",
            error: error.message,
            completedAt: new Date().toISOString()
          })
          throw error
        } finally {
          controllers.delete(renderId)
        }
      }
    })
  } catch (error) {
    controllers.delete(renderId)
    await patch({ status: "failed", error: error.message })
    throw createHttpError(429, error.message)
  }
  return publicRender(job, assetId)
}
export async function getTemplateRender(assetId, renderId) {
  let record = await loadAssetRecord(assetId)
  let job = record.renders?.find(
    (r) => r.renderId === renderId && r.engine === "template"
  )
  if (!job) throw createHttpError(404, "This render was not found.")
  if (["queued", "running"].includes(job.status) && !getJobStatus(renderId)) {
    record = await updateAssetRecord(assetId, (record) => {
      const item = record.renders.find((r) => r.renderId === renderId)
      Object.assign(item, {
        status: "failed",
        error: "The server restarted during this render. Start a new export.",
        completedAt: new Date().toISOString()
      })
    })
    job = record.renders.find((r) => r.renderId === renderId)
  }
  return { record, job }
}
export async function cancelTemplateRender(assetId, renderId) {
  const { job } = await getTemplateRender(assetId, renderId)
  if (!["queued", "running"].includes(job.status))
    return publicRender(job, assetId)
  if (cancelJob(renderId)) {
    controllers.delete(renderId)
    const record = await updateAssetRecord(assetId, (r) =>
      Object.assign(
        r.renders.find((j) => j.renderId === renderId),
        {
          status: "cancelled",
          error: "Render cancelled.",
          completedAt: new Date().toISOString()
        }
      )
    )
    return publicRender(
      record.renders.find((r) => r.renderId === renderId),
      assetId
    )
  }
  controllers.get(renderId)?.abort()
  return { ...publicRender(job, assetId), status: "cancelling" }
}
