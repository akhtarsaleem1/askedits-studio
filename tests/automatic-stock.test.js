import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import config from "../config/default.js"
import {
  ensureAutomaticStock,
  automaticStockKey
} from "../src/backend/services/automatic-stock.js"
import { createUploadSession } from "../src/backend/services/upload-service.js"
import { updateAssetRecord } from "../src/backend/services/upload-repository.js"
import {
  getStockJob,
  stockSearchQuery
} from "../src/backend/services/stock-jobs.js"
import { defaultEditSettings } from "../src/shared/edit-templates.js"
import { captionScenes } from "../src/shared/caption-director.js"

test("automatic Pexels requests are persistent, deduplicated and change only with narration or range", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "askedits-auto-stock-")
  )
  const previousRoot = config.upload.storageRoot,
    previousKey = config.broll.pexelsApiKey,
    originalFetch = globalThis.fetch
  config.upload.storageRoot = directory
  config.broll.pexelsApiKey = "test-key"
  let calls = 0
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).hostname, "api.pexels.com")
      assert.equal(options.headers.Authorization, "test-key")
      calls++
      return new Response(JSON.stringify({ videos: [] }))
    }
    const asset = await createUploadSession({
      originalName: "cosmetics.mp4",
      fileSize: 3,
      totalChunks: 1
    })
    await updateAssetRecord(asset.assetId, (record) => {
      record.processingStatus = "ready"
      record.media = { width: 320, height: 180, durationSec: 8, hasAudio: true }
    })
    const settings = {
      ...defaultEditSettings("tech-brief"),
      manualCaptions: [
        { startSec: 0, endSec: 4, text: "Cosmetics skincare products." }
      ]
    }
    const finish = async () => {
      for (let i = 0; i < 100; i++) {
        const job = await getStockJob(asset.assetId)
        if (job?.status !== "running") return job
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error("Automatic job did not complete")
    }
    const [first, duplicate] = await Promise.all([
      ensureAutomaticStock(asset.assetId, settings),
      ensureAutomaticStock(asset.assetId, settings)
    ])
    assert.equal(first.id, duplicate.id)
    assert.equal(first.provider, "pexels")
    assert.equal(first.automatic, true)
    await finish()
    const firstCalls = calls
    assert.ok(firstCalls > 0)
    assert.equal(
      (
        await ensureAutomaticStock(asset.assetId, {
          ...settings,
          resolution: 720,
          captionColor: "#ffffff"
        })
      ).id,
      first.id
    )
    assert.equal(
      calls,
      firstCalls,
      "page changes and visual controls do not download again"
    )
    const changed = await ensureAutomaticStock(asset.assetId, {
      ...settings,
      manualCaptions: [
        { startSec: 0, endSec: 4, text: "University students learning." }
      ]
    })
    assert.notEqual(changed.id, first.id)
    await finish()
    assert.equal(
      await ensureAutomaticStock(asset.assetId, {
        ...settings,
        autoStock: false
      }),
      null
    )
    config.broll.pexelsApiKey = ""
    assert.equal(await ensureAutomaticStock(asset.assetId, settings), null)
    assert.notEqual(
      automaticStockKey(settings, settings.manualCaptions),
      automaticStockKey({ ...settings, startSec: 2 }, settings.manualCaptions)
    )
  } finally {
    globalThis.fetch = originalFetch
    config.upload.storageRoot = previousRoot
    config.broll.pexelsApiKey = previousKey
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
    await fs.rm(directory, { recursive: true, force: true })
  }
})
test("cosmetics captions produce a short topical Pexels query instead of sending the entire sentence", () => {
  const scene = captionScenes(
    [
      {
        startSec: 0,
        endSec: 4,
        text: "Brothers cosmetics shop. Bahterines skincare products hasil karein."
      }
    ],
    4
  )[0]
  assert.equal(scene.topic, "beauty")
  assert.equal(stockSearchQuery(scene), "skincare cosmetics")
  assert.equal(
    stockSearchQuery({ ...scene, text: "Fairness beauty cream." }),
    "face cream skincare"
  )
})
