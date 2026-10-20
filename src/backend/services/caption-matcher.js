import fs from "node:fs/promises"
import path from "node:path"
import { visualDescription } from "../../shared/caption-director.js"

const modelRoot = () =>
  path.resolve(process.env.CAPTION_MODEL_ROOT || "storage/models")
let extractorPromise,
  queue = Promise.resolve(),
  warned = false
const cache = new Map()
export async function captionMatcherStatus() {
  try {
    for (const file of [
      "manifest.json",
      "config.json",
      "tokenizer.json",
      "onnx/model_quantized.onnx"
    ])
      await fs.access(path.join(modelRoot(), "caption-matcher", file))
    return { available: true, engine: "local-sentence-model" }
  } catch {
    return { available: false, engine: "keyword-rules" }
  }
}
async function embeddings(texts) {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
  if (missing.length) {
    extractorPromise ??= (async () => {
      const { pipeline, env } = await import("@huggingface/transformers")
      env.allowRemoteModels = false
      env.localModelPath = modelRoot() + path.sep
      return pipeline("feature-extraction", "caption-matcher", {
        dtype: "q8",
        device: "cpu",
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }
      })
    })()
    const extractor = await extractorPromise
    for (let index = 0; index < missing.length; index += 8) {
      const batch = missing.slice(index, index + 8)
      const output = await extractor(batch, {
        pooling: "mean",
        normalize: true
      })
      output.tolist().forEach((vector, i) => cache.set(batch[i], vector))
    }
  }
  const values = texts.map((t) => cache.get(t))
  while (cache.size > 512) cache.delete(cache.keys().next().value)
  return values
}
export async function captionSemanticScores(scenes, assets) {
  const status = await captionMatcherStatus()
  if (!status.available || !scenes.length || !assets.length)
    return { scores: {}, engine: status.engine }
  const work = async () => {
    try {
      const texts = [
        ...scenes.map((s) => s.text.slice(0, 1500)),
        ...assets.map(visualDescription)
      ]
      const vectors = await embeddings(texts),
        scores = {}
      scenes.forEach((scene, i) => {
        scores[scene.id] = {}
        assets.forEach((asset, j) => {
          scores[scene.id][asset.id] = vectors[i].reduce(
            (sum, v, k) => sum + v * vectors[scenes.length + j][k],
            0
          )
        })
      })
      return { scores, engine: "local-sentence-model" }
    } catch (error) {
      if (!warned) {
        warned = true
        console.warn("Local caption matcher unavailable:", error.message)
      }
      extractorPromise = undefined
      return {
        scores: {},
        engine: "keyword-rules",
        warning:
          "Local sentence matching is unavailable. Keyword matching is active."
      }
    }
  }
  const result = queue.then(work)
  queue = result.catch(() => {})
  return result
}
