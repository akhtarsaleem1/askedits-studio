import "../src/backend/env-loader.js"
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

const root = path.resolve(process.env.CAPTION_MODEL_ROOT || "storage/models")
const revision = "751bff37182d3f1213fa05d7196b954e230abad9"
const files = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx"
]
const target = path.join(root, "caption-matcher")
const manifest = { repository: "Xenova/all-MiniLM-L6-v2", revision, files: {} }
for (const file of files) {
  const response = await fetch(
    "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/" +
      revision +
      "/" +
      file,
    { signal: AbortSignal.timeout(180000) }
  )
  if (!response.ok)
    throw new Error("Model download failed: " + file + " / " + response.status)
  const limit = file.endsWith(".onnx") ? 40 * 1024 * 1024 : 3 * 1024 * 1024
  let size = 0
  const chunks = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new Error("Model file exceeds its expected size.")
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  await fs.mkdir(path.dirname(path.join(target, file)), { recursive: true })
  await fs.writeFile(path.join(target, file), bytes)
  manifest.files[file] = {
    size,
    sha256: createHash("sha256").update(bytes).digest("hex")
  }
  console.log("Downloaded", file, size, "bytes")
}
await fs.writeFile(
  path.join(target, "manifest.json"),
  JSON.stringify(manifest, null, 2)
)
console.log("Local caption matcher ready. Restart the studio.")
