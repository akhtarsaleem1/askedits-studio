import test, { after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import config from "../config/default.js"
import { buildAssetLayout } from "../src/backend/utils/storage-layout.js"
import { createUploadSession, saveUploadChunk, completeUploadSession } from "../src/backend/services/upload-service.js"
import { loadAssetRecord, saveAssetRecord } from "../src/backend/services/upload-repository.js"
import app from "../src/backend/app.js"

const root = await fs.mkdtemp(path.join(os.tmpdir(), "askedits-tests-"))
config.upload.storageRoot = root
after(async () => {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
  assert.ok(path.basename(root).startsWith("askedits-tests-"))
  await fs.rm(root, { recursive: true, force: true })
})
const session = (fileSize = 3, totalChunks = 1) => createUploadSession({originalName: "sample.mp4", fileSize, totalChunks})

 test("rejects non-finite file sizes and inconsistent chunk counts", async () => {
  for (const size of [NaN, Infinity, -1, 1.5]) await assert.rejects(session(size), {statusCode: 400})
  await assert.rejects(session(3, 2), {statusCode: 400})
})

test("asset IDs cannot escape the configured storage folder", () => {
  for (const id of ["..", "../outside", "a/b", "a\\b", "C:outside", ""]) {
    assert.throws(() => buildAssetLayout(id), {statusCode: 400})
  }
})

test("chunk validation rejects malformed uploads before writing", async () => {
  const asset = await session()
  await assert.rejects(saveUploadChunk(asset.assetId, 0, Buffer.alloc(4)), {statusCode: 400})
  await assert.rejects(saveUploadChunk(asset.assetId, -1, Buffer.alloc(3)), {statusCode: 400})
  await assert.rejects(completeUploadSession(asset.assetId), {statusCode: 400})
  assert.deepEqual((await loadAssetRecord(asset.assetId)).receivedChunks, [])
})

test("parallel chunks and retries preserve all progress", async () => {
  const chunkSize = config.upload.chunkSizeBytes
  const asset = await session(chunkSize + 3, 2)
  await Promise.all([
    saveUploadChunk(asset.assetId, 0, Buffer.alloc(chunkSize)),
    saveUploadChunk(asset.assetId, 1, Buffer.alloc(3)),
    saveUploadChunk(asset.assetId, 1, Buffer.alloc(3)),
  ])
  const record = await loadAssetRecord(asset.assetId)
  assert.deepEqual(record.receivedChunks.sort(), [0, 1])
  record.uploadStatus = "uploaded"
  await saveAssetRecord(record)
  await assert.rejects(saveUploadChunk(asset.assetId, 1, Buffer.alloc(3)), {statusCode: 409})
  assert.equal((await completeUploadSession(asset.assetId)).uploadStatus, "uploaded")
})

test("HTTP endpoints return proper errors for invalid paths and oversized bodies", async () => {
  const server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  const base = "http://127.0.0.1:" + server.address().port
  try {
    const badId = await fetch(base + "/api/uploads/a%5Cb/status")
    assert.equal(badId.status, 400)
    const badThumbnail = await fetch(base + "/api/uploads/asset123/assets/ai-thumbnail:..%5Cmetadata.json")
    assert.equal(badThumbnail.status, 400)
    const oversized = await fetch(base + "/api/uploads/session", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({padding:"x".repeat(1024 * 1024 + 1)})})
    assert.equal(oversized.status, 413)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
