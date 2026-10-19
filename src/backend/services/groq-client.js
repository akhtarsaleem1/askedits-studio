import config from "../../../config/default.js"

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractJsonFromText(text) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text.trim())
  } catch {
    // Fall through to fence extraction
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      // Fall through
    }
  }

  const jsonStart = text.search(/[{[]/)
  if (jsonStart !== -1) {
    const slice = text.slice(jsonStart)
    let depth = 0
    let inString = false
    let escape = false
    let end = -1
    const opener = slice[0]
    const closer = opener === "{" ? "}" : "]"

    for (let i = 0; i < slice.length; i++) {
      const char = slice[i]

      if (escape) {
        escape = false
        continue
      }

      if (char === "\\") {
        escape = true
        continue
      }

      if (char === '"') {
        inString = !inString
        continue
      }

      if (inString) {
        continue
      }

      if (char === opener) {
        depth++
      } else if (char === closer) {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    if (end !== -1) {
      try {
        return JSON.parse(slice.slice(0, end + 1))
      } catch {
        // Failed
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Provider descriptors
// ---------------------------------------------------------------------------

function buildGroqProvider() {
  return {
    name: "groq",
    apiKey: config.ai.groqApiKey,
    baseUrl: config.ai.groqBaseUrl,
    defaultModel: config.ai.groqPrimaryModel ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    fastModel: config.ai.groqFastModel ?? "llama-3.1-8b-instant",
    headers: {}
  }
}

function buildOpenRouterProvider() {
  return {
    name: "openrouter",
    apiKey: config.ai.openrouterApiKey,
    baseUrl: config.ai.openrouterBaseUrl,
    defaultModel: config.ai.openrouterPrimaryModel ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    fastModel: config.ai.openrouterFastModel ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    headers: {
      ...(config.ai.openrouterSiteUrl ? { "HTTP-Referer": config.ai.openrouterSiteUrl } : {}),
      ...(config.ai.openrouterSiteName ? { "X-Title": config.ai.openrouterSiteName } : {})
    }
  }
}

/**
 * Build the general-purpose provider chain: Groq → OpenRouter (fallback).
 * Used by services that just want "the best available AI".
 */
function buildProviderCandidates() {
  return [
    buildGroqProvider(),
    buildOpenRouterProvider()
  ].filter((p) => Boolean(p.apiKey))
}

// ---------------------------------------------------------------------------
// Core single-provider request (with retries)
// ---------------------------------------------------------------------------

async function fetchFromProvider(provider, { model, messages, temperature, maxTokens }) {
  const selectedModel = model ?? provider.defaultModel
  const selectedTemp = temperature ?? config.ai.temperature
  const maxRetries = config.ai.maxRetries
  const retryDelayMs = config.ai.retryDelayMs

  const body = {
    model: selectedModel,
    messages,
    temperature: selectedTemp,
    max_tokens: maxTokens ?? 4096
  }

  // NOTE: We intentionally do NOT use response_format: { type: "json_object" }.
  // Some APIs will return a hard 400 error if json_object mode fails.
  // Instead, we prompt for JSON and use our robust extractJsonFromText parser.

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(retryDelayMs * attempt)
    }

    let response

    try {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          ...provider.headers
        },
        body: JSON.stringify(body)
      })
    } catch (fetchError) {
      lastError = new Error(`${provider.name} network error: ${fetchError.message}`)
      continue
    }

    // Retry on rate-limit or server errors
    if (response.status === 429 || response.status >= 500) {
      let errText = ""
      try {
        const errBody = await response.json()
        errText = errBody?.error?.message ?? response.statusText
      } catch {
        errText = response.statusText
      }
      lastError = new Error(`${provider.name} ${response.status}: ${errText}`)
      continue
    }

    if (!response.ok) {
      let errText = ""
      try {
        const errBody = await response.json()
        errText = errBody?.error?.message ?? response.statusText
      } catch {
        errText = response.statusText
      }
      throw new Error(`${provider.name} API error ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ""

    return {
      content,
      model: data.model ?? selectedModel,
      provider: provider.name,
      usage: data.usage ?? null
    }
  }

  throw lastError ?? new Error(`${provider.name} failed after ${maxRetries} retries.`)
}

// ---------------------------------------------------------------------------
// Public: Sequential fallback (Groq → OpenRouter)
// General-purpose function used by edit planning, style detection, viral
// moments, translation, etc.
// ---------------------------------------------------------------------------

export async function groqChatCompletion({ model, messages, temperature, maxTokens }) {
  const providers = buildProviderCandidates()

  if (providers.length === 0) {
    throw new Error(
      "No AI provider API key configured. Set OPENROUTER_API_KEY or GROQ_API_KEY in your .env file."
    )
  }

  let lastError

  for (const provider of providers) {
    try {
      const result = await fetchFromProvider(provider, { model, messages, temperature, maxTokens })
      console.log(`[ai] ✓ ${provider.name} responded (model: ${result.model})`)
      return result
    } catch (err) {
      lastError = err
      console.warn(`[ai] ${provider.name} failed: ${err.message}. Trying next provider...`)
    }
  }

  throw lastError ?? new Error("All AI providers failed.")
}

// ---------------------------------------------------------------------------
// Public: Groq-only request (no fallback)
// Used by edit-plan-service, style-detection, viral-moments — everything
// that is NOT the co-editor.
// ---------------------------------------------------------------------------

export async function groqChatCompletionDirect({ model, messages, temperature, maxTokens }) {
  const provider = buildGroqProvider()

  if (!provider.apiKey) {
    throw new Error("GROQ_API_KEY is not configured.")
  }

  const result = await fetchFromProvider(provider, { model, messages, temperature, maxTokens })
  console.log(`[ai] ✓ groq responded (model: ${result.model})`)
  return result
}

// ---------------------------------------------------------------------------
// Public: OpenRouter-only request (no fallback)
// Used exclusively by the Co-Editor for chat interactions.
// ---------------------------------------------------------------------------

export async function openrouterChatCompletion({ model, messages, temperature, maxTokens }) {
  const provider = buildOpenRouterProvider()

  if (!provider.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.")
  }

  const result = await fetchFromProvider(provider, { model, messages, temperature, maxTokens })
  console.log(`[ai] ✓ openrouter responded (model: ${result.model})`)
  return result
}

// ---------------------------------------------------------------------------
// Public: JSON helpers
// ---------------------------------------------------------------------------

/**
 * General-purpose JSON chat — tries Groq first, falls back to OpenRouter.
 * Used by style-detection, viral-moments, edit-plan, translation, etc.
 */
export async function groqChatJson({ model, messages, temperature, maxTokens }) {
  const result = await groqChatCompletion({
    model,
    messages,
    temperature,
    maxTokens
  })

  const parsed = extractJsonFromText(result.content)

  if (!parsed) {
    throw new Error(`AI returned non-JSON content from model ${result.model}. Content: ${result.content.slice(0, 200)}`)
  }

  return {
    data: parsed,
    model: result.model,
    provider: result.provider,
    usage: result.usage
  }
}

/**
 * OpenRouter-only JSON chat — used exclusively by the Co-Editor.
 */
export async function openrouterChatJson({ model, messages, temperature, maxTokens }) {
  const result = await openrouterChatCompletion({
    model,
    messages,
    temperature,
    maxTokens
  })

  const parsed = extractJsonFromText(result.content)

  if (!parsed) {
    throw new Error(`AI returned non-JSON content from model ${result.model}. Content: ${result.content.slice(0, 200)}`)
  }

  return {
    data: parsed,
    model: result.model,
    provider: result.provider,
    usage: result.usage
  }
}
