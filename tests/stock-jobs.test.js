import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import config from "../config/default.js"
import { createUploadSession } from "../src/backend/services/upload-service.js"
import {
  loadAssetRecord,
  updateAssetRecord
} from "../src/backend/services/upload-repository.js"
import {
  startStockJob,
  getStockJob,
  cancelStockJob
} from "../src/backend/services/stock-jobs.js"
import { STOCK_CATALOG } from "../src/backend/services/stock-catalog.js"
import { defaultEditSettings } from "../src/shared/edit-templates.js"
import { ensureAutomaticStock } from "../src/backend/services/automatic-stock.js"

test(
  "internet B-roll jobs import probed video, preserve credits, avoid duplicates, cancel and recover",
  { skip: process.env.RUN_MEDIA_TESTS !== "1", timeout: 90000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "askedits-stock-jobs-")
    )
    const previousRoot = config.upload.storageRoot,
      previousPexelsKey = config.broll.pexelsApiKey,
      originalFetch = globalThis.fetch
    config.upload.storageRoot = directory
    try {
      const video = await fs.readFile(
        path.resolve("public/demo/tech-broll.mp4")
      )
      const asset = await createUploadSession({
        originalName: "stock-test.mp4",
        fileSize: 3,
        totalChunks: 1
      })
      await updateAssetRecord(asset.assetId, (record) => {
        record.processingStatus = "ready"
        record.media = {
          width: 960,
          height: 540,
          durationSec: 8,
          hasAudio: false
        }
      })
      globalThis.fetch = async (url) => {
        const item = STOCK_CATALOG.find((item) => item.url === String(url))
        if (item)
          return new Response(
            '<script type="application/ld+json">' +
              JSON.stringify({
                "@type": "VideoObject",
                "@id": item.url + "#video",
                license: item.licenseUrl,
                contentUrl: item.mediaUrl
              }) +
              "</script>"
          )
        assert.ok(
          STOCK_CATALOG.some((item) => item.mediaUrl === String(url)),
          "only curated media requested"
        )
        return new Response(video)
      }
      const settings = {
        ...defaultEditSettings("tech-brief"),
        removeSilence: false,
        music: "none",
        manualCaptions: [
          {
            startSec: 0,
            endSec: 3.5,
            text: "Software programming code development."
          },
          {
            startSec: 4,
            endSec: 8,
            text: "Students study at university college."
          }
        ]
      }
      const finish = async () => {
        const deadline = Date.now() + 60000
        while (Date.now() < deadline) {
          const job = await getStockJob(asset.assetId)
          if (job.status !== "running") return job
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        throw new Error("Footage job did not finish")
      }
      await startStockJob(asset.assetId, settings)
      await assert.rejects(startStockJob(asset.assetId, settings), {
        statusCode: 409
      })
      const first = await finish()
      assert.equal(first.status, "ready", first.message)
      assert.ok(first.imported.length >= 2, JSON.stringify(first))
      let record = await loadAssetRecord(asset.assetId)
      assert.ok(
        record.visualAssets.every(
          (visual) =>
            visual.kind === "video" &&
            visual.durationSec > 0 &&
            visual.source.licenseUrl ===
              "https://mixkit.co/license/#videoFree" &&
            visual.description
        )
      )
      await startStockJob(asset.assetId, settings)
      await finish()
      record = await loadAssetRecord(asset.assetId)
      assert.equal(
        new Set(record.visualAssets.map((v) => v.source.url)).size,
        record.visualAssets.length
      )
      await startStockJob(asset.assetId, settings)
      await cancelStockJob(asset.assetId)
      assert.equal((await finish()).status, "cancelled")
      await updateAssetRecord(asset.assetId, (current) => {
        current.stockJob = { status: "running", imported: [] }
      })
      assert.equal((await getStockJob(asset.assetId)).status, "interrupted")
      await startStockJob(asset.assetId, { ...settings, manualCaptions: [] })
      assert.equal((await finish()).status, "failed")
      assert.match((await getStockJob(asset.assetId)).message, /captions first/)
      config.broll.pexelsApiKey = "test-key"
      globalThis.fetch = async (url) =>
        String(url).startsWith("https://api.pexels.com/")
          ? new Response(
              JSON.stringify({
                videos: [
                  {
                    id: 123,
                    url: "https://www.pexels.com/video/applying-face-cream-skincare-123/",
                    user: { name: "Test creator" },
                    video_files: [
                      {
                        file_type: "video/mp4",
                        width: 960,
                        link: "https://videos.pexels.com/video-files/123/cream.mp4"
                      }
                    ]
                  }
                ]
              })
            )
          : new Response(video)
      const automatic = await ensureAutomaticStock(asset.assetId, {
        ...settings,
        manualCaptions: [
          { startSec: 0, endSec: 4, text: "Applying face cream skincare." }
        ]
      })
      assert.equal(automatic.automatic, true)
      assert.equal((await finish()).imported.length, 1)
      const imported = (await loadAssetRecord(asset.assetId)).visualAssets.at(
        -1
      )
      assert.equal(imported.source.provider, "pexels")
      assert.equal(imported.source.author, "Test creator")
      assert.equal(imported.description, "applying face cream skincare")
      assert.equal(imported.kind, "video")
    } finally {
      globalThis.fetch = originalFetch
      config.upload.storageRoot = previousRoot
      config.broll.pexelsApiKey = previousPexelsKey
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
)
