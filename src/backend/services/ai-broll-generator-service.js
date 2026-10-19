import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

import config from "../../../config/default.js"
import { groqChatJson } from "./groq-client.js"
import { searchBrollVideo, downloadBrollClip } from "./broll-search-service.js"

/**
 * Generate AI-powered B-Roll by enhancing prompts with AI and falling back to stock footage.
 * When Replicate API is configured, can generate custom video clips.
 */
export async function generateAiBroll({ assetRecord, prompt, durationSec = 3, style = "cinematic", exportFormat = "original" }) {
  const brollDir = assetRecord.paths.brollDir
  await fs.mkdir(brollDir, { recursive: true })

  // 1. Enhance the prompt with AI for better search/generation results
  const enhancedPrompt = await enhanceBrollPrompt(prompt, style)
  console.log(`[ai-broll] Original: "${prompt}" → Enhanced: "${enhancedPrompt}"`)

  // 2. Try AI generation if enabled and configured
  if (config.aiBroll.enabled && config.aiBroll.replicateApiToken) {
    try {
      const result = await generateWithReplicate(enhancedPrompt, durationSec, brollDir, exportFormat)
      return { ...result, source: "ai-generated", originalPrompt: prompt, enhancedPrompt }
    } catch (err) {
      console.warn(`[ai-broll] AI generation failed, falling back to stock: ${err.message}`)
      if (!config.aiBroll.fallbackToStock) throw err
    }
  }

  // 3. Fallback: Enhanced stock footage search
  return await searchEnhancedStock(enhancedPrompt, brollDir, prompt, exportFormat)
}

/**
 * Use Groq AI to enhance a B-roll search/generation prompt.
 */
async function enhanceBrollPrompt(prompt, style) {
  try {
    const result = await groqChatJson({
      model: config.ai.fastModel,
      temperature: 0.5,
      maxTokens: 200,
      messages: [
        { role: "system", content: "You are a cinematographer. Enhance video search queries for maximum visual impact. Return only JSON." },
        { role: "user", content: `Enhance this B-roll search query for a ${style} style video:\n"${prompt}"\n\nReturn JSON: {"enhancedQuery":"more specific cinematic search query","alternativeQueries":["alt1","alt2"]}` }
      ]
    })
    return result.data?.enhancedQuery ?? prompt
  } catch {
    return prompt
  }
}

/**
 * Generate video with Replicate API (Stable Video Diffusion or similar).
 */
function getGenerationSize(exportFormat) {
  if (exportFormat === "tiktok") return { width: 576, height: 1024 }
  if (exportFormat === "instagram_square") return { width: 768, height: 768 }
  return { width: 1024, height: 576 }
}

async function generateWithReplicate(prompt, durationSec, outputDir, exportFormat) {
  const token = config.aiBroll.replicateApiToken
  const model = config.aiBroll.defaultModel
  const size = getGenerationSize(exportFormat)

  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: {
        prompt,
        num_frames: Math.min(durationSec * 24, 96),
        fps: 24,
        width: size.width,
        height: size.height
      }
    })
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Replicate API error: ${err}`)
  }

  const prediction = await createRes.json()
  let status = prediction

  // Poll for completion (max 5 minutes)
  const maxWait = 300000
  const startTime = Date.now()

  while (status.status !== "succeeded" && status.status !== "failed") {
    if (Date.now() - startTime > maxWait) throw new Error("AI B-roll generation timed out")
    await new Promise(r => setTimeout(r, 3000))

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    status = await pollRes.json()
  }

  if (status.status === "failed") {
    throw new Error(`AI generation failed: ${status.error ?? "Unknown error"}`)
  }

  // Download the generated video
  const outputUrl = Array.isArray(status.output) ? status.output[0] : status.output
  const hash = crypto.createHash("md5").update(`${exportFormat}:${prompt}`).digest("hex")
  const outputPath = path.join(outputDir, `ai-generated-${hash}.mp4`)

  const videoRes = await fetch(outputUrl)
  const buffer = Buffer.from(await videoRes.arrayBuffer())
  await fs.writeFile(outputPath, buffer)

  return { filePath: outputPath, prompt, durationSec }
}

/**
 * Enhanced stock footage search with AI-refined queries.
 */
async function searchEnhancedStock(enhancedPrompt, outputDir, originalPrompt, exportFormat) {
  const hash = crypto.createHash("md5").update(`${exportFormat}:${enhancedPrompt}`).digest("hex")
  const outputPath = path.join(outputDir, `${hash}.mp4`)

  // Check cache
  try {
    await fs.access(outputPath)
    return { filePath: outputPath, source: "stock-cached", originalPrompt, enhancedPrompt }
  } catch { /* not cached */ }

  // Search with enhanced query
  let url = await searchBrollVideo(enhancedPrompt, exportFormat)

  // If enhanced query fails, try original
  if (!url) {
    url = await searchBrollVideo(originalPrompt, exportFormat)
  }

  if (!url) {
    throw new Error(`No B-roll found for "${enhancedPrompt}" or "${originalPrompt}"`)
  }

  await downloadBrollClip(url, outputPath)
  return { filePath: outputPath, source: "stock-enhanced", originalPrompt, enhancedPrompt }
}
