import { createHash } from "node:crypto"
import config from "../../../config/default.js"
import { normalizeEditSettings } from "../../shared/edit-planner.js"
import { loadAssetRecord } from "./upload-repository.js"
import { planTemplateEdit } from "./template-renderer.js"
import { getStockJob, startStockJob } from "./stock-jobs.js"

const pending = new Map()
export function automaticStockKey(settings, captions) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: "pexels-caption-v1",
        start: settings.startSec,
        end: settings.endSec,
        duration: settings.duration,
        captions: captions.map(({ text, startSec, endSec, words }) => ({
          text,
          startSec,
          endSec,
          words
        }))
      })
    )
    .digest("hex")
}
export function ensureAutomaticStock(assetId, input) {
  if (pending.has(assetId)) return pending.get(assetId)
  const work = (async () => {
    if (!config.broll.pexelsApiKey || input?.autoStock === false) return null
    const record = await loadAssetRecord(assetId)
    if (record.processingStatus !== "ready") return null
    const settings = normalizeEditSettings(
      { ...input, visualMode: "captions", transition: "auto" },
      record.media
    )
    const plan = await planTemplateEdit(record, {
      ...settings,
      captions: true,
      preview: false
    })
    if (!plan.sourceCaptions.length) return null
    const requestKey = automaticStockKey(settings, plan.sourceCaptions)
    const current = await getStockJob(assetId)
    if (
      current?.status === "running" ||
      (current?.requestKey === requestKey && current.status !== "cancelled")
    )
      return current
    if ((record.visualAssets?.length ?? 0) >= 24) return current
    return startStockJob(assetId, { ...settings, captions: true }, "pexels", {
      automatic: true,
      requestKey
    })
  })().finally(() => pending.delete(assetId))
  pending.set(assetId, work)
  return work
}
