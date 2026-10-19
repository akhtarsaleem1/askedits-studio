import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import config from "../../../config/default.js"
import { createHttpError } from "../utils/errors.js"
import { canRunCommand, runCommand } from "../utils/process-runner.js"
import { buildStructuredTranscript } from "./transcript-formatting-service.js"
import { groqChatJson } from "./groq-client.js"

// ---------------------------------------------------------------------------
// Groq Whisper API  (primary transcription path)
// ---------------------------------------------------------------------------

/**
 * Maps a Groq verbose_json transcription response into the same raw shape
 * that the faster-whisper Python script produces, so the rest of the
 * pipeline (buildStructuredTranscript, etc.) works unchanged.
 */
function mapGroqWhisperResponse(groqData, audioPath) {
  const segments = (groqData.segments ?? []).map((seg, idx) => ({
    id: idx,
    seek: 0,
    start: seg.start ?? 0,
    end: seg.end ?? 0,
    text: (seg.text ?? "").trim(),
    tokens: [],
    temperature: 0,
    avg_logprob: seg.avg_logprob ?? 0,
    compression_ratio: seg.compression_ratio ?? 1,
    no_speech_prob: seg.no_speech_prob ?? 0,
    words: (seg.words ?? []).map((w) => ({
      word: w.word ?? "",
      start: w.start ?? 0,
      end: w.end ?? 0,
      probability: w.probability ?? 1
    }))
  }))

  return {
    text: groqData.text ?? "",
    language: groqData.language ?? "en",
    duration: groqData.duration ?? 0,
    model: config.media.transcription.groqWhisperModel,
    task: "transcribe",
    segments
  }
}

async function transcribeWithGroqWhisper(audioPath) {
  const groqApiKey = config.ai.groqApiKey
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY not configured — skipping Groq Whisper")
  }

  const fileBuffer = await fs.readFile(audioPath)
  const fileName = path.basename(audioPath)

  // Build multipart/form-data body using FormData
  const formData = new FormData()
  formData.append("file", new Blob([fileBuffer]), fileName)
  formData.append("model", config.media.transcription.groqWhisperModel)
  formData.append("response_format", "verbose_json")
  formData.append("temperature", "0")

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`
      // Content-Type is set automatically by fetch when using FormData
    },
    body: formData
  })

  if (!response.ok) {
    let errText = ""
    try {
      const errBody = await response.json()
      errText = errBody?.error?.message ?? response.statusText
    } catch {
      errText = response.statusText
    }
    throw new Error(`Groq Whisper API error ${response.status}: ${errText}`)
  }

  const groqData = await response.json()
  return mapGroqWhisperResponse(groqData, audioPath)
}

async function translateTranscriptToEnglish(structuredTranscript) {
  if (!structuredTranscript || !structuredTranscript.sentenceGroups || structuredTranscript.sentenceGroups.length === 0) {
    return structuredTranscript
  }

  const detectedLanguage = structuredTranscript.language?.code || ""
  if (!detectedLanguage || detectedLanguage.toLowerCase() === "en" || detectedLanguage.toLowerCase().startsWith("en-")) {
    return structuredTranscript
  }

  const batchSize = 40
  const sentenceGroups = structuredTranscript.sentenceGroups
  const totalSentences = sentenceGroups.length

  for (let i = 0; i < totalSentences; i += batchSize) {
    const batch = sentenceGroups.slice(i, i + batchSize)
    const payload = batch.map(s => ({ id: s.id, text: s.text }))

    try {
      const messages = [
        {
          role: "system",
          content: "You are a professional translator. Translate the provided list of video transcription segments to natural English. " +
            "Return a JSON object with a single key 'translations' which maps to an array of objects. Each object in the array must contain the original 'id' and the translated English 'translatedText'. " +
            "Maintain the context and tone of a spoken video script. Do not output anything other than valid JSON."
        },
        {
          role: "user",
          content: JSON.stringify({ segments: payload })
        }
      ]

      const response = await groqChatJson({
        model: config.ai.fastModel || "llama-3.1-8b-instant",
        messages,
        temperature: 0.1
      })

      const translations = response.data?.translations || []
      const translationMap = new Map(translations.map(t => [t.id, t.translatedText]))

      for (const segment of batch) {
        if (translationMap.has(segment.id)) {
          segment.translatedText = translationMap.get(segment.id)
        } else {
          segment.translatedText = segment.text
        }
      }
    } catch (error) {
      console.error(`Error translating transcript batch starting at index ${i}:`, error)
      for (const segment of batch) {
        segment.translatedText = segment.text
      }
    }
  }

  return structuredTranscript
}

const TRANSCRIBE_SCRIPT_PATH = path.resolve("python/transcribe_with_faster_whisper.py")
const LOCAL_PYTHON_PACKAGES_PATH = path.resolve(".python-packages")

function getBundledPythonCandidate() {
  if (process.platform === "win32") {
    return path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
  }

  return path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3")
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function resolvePythonRuntime() {
  const envCandidate = process.env.PYTHON_BIN?.trim()
  const bundledCandidate = getBundledPythonCandidate()
  const candidates = [
    envCandidate ? { command: envCandidate, argsPrefix: [] } : null,
    { command: "python", argsPrefix: ["-B"] },
    (await pathExists(bundledCandidate)) ? { command: bundledCandidate, argsPrefix: [] } : null,
    process.platform === "win32" ? { command: "py", argsPrefix: ["-3", "-B"] } : null
  ].filter(Boolean)

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const available = await canRunCommand(candidate.command, [...candidate.argsPrefix, "--version"])

    if (available) {
      return candidate
    }
  }

  throw createHttpError(
    500,
    "Python runtime not found for transcription. Install Python 3.11+ or set PYTHON_BIN to a valid executable path."
  )
}

function buildPythonPathEnv() {
  const entries = []

  if (process.env.PYTHONPATH) {
    entries.push(process.env.PYTHONPATH)
  }

  entries.push(LOCAL_PYTHON_PACKAGES_PATH)

  return entries.join(path.delimiter)
}

export async function transcribeAudioAsset({
  audioPath,
  transcriptPath,
  rawTranscriptPath,
  mediaDurationSec,
  onProgress
}) {
  // -------------------------------------------------------------------
  // PRIMARY PATH: Groq Whisper API (cloud, fast, whisper-large-v3)
  // -------------------------------------------------------------------
  let rawTranscript = null
  let transcriptionProvider = "groq-whisper"

  try {
    console.log(`[transcription] Trying Groq Whisper API (${config.media.transcription.groqWhisperModel})...`)
    onProgress?.(5)
    rawTranscript = await transcribeWithGroqWhisper(audioPath)
    console.log(`[transcription] ✓ Groq Whisper succeeded (lang: ${rawTranscript.language})`)
    onProgress?.(60)

    // Save raw transcript for debugging
    await fs.writeFile(rawTranscriptPath, JSON.stringify(rawTranscript, null, 2))
  } catch (groqErr) {
    console.warn(`[transcription] Groq Whisper failed: ${groqErr.message}. Falling back to local faster-whisper GPU...`)
    transcriptionProvider = "faster-whisper"

    // ---------------------------------------------------------------
    // FALLBACK PATH: local faster-whisper Python (GPU)
    // ---------------------------------------------------------------
    const pythonRuntime = await resolvePythonRuntime()
    const args = [
      ...pythonRuntime.argsPrefix,
      TRANSCRIBE_SCRIPT_PATH,
      "--input",
      audioPath,
      "--output",
      transcriptPath,
      "--raw-output",
      rawTranscriptPath,
      "--model",
      config.media.transcription.model,
      "--task",
      config.media.transcription.task,
      "--language",
      config.media.transcription.language,
      "--beam-size",
      String(config.media.transcription.beamSize)
    ]

    if (config.media.transcription.vadFilter) args.push("--vad-filter")
    if (config.media.transcription.wordTimestamps) args.push("--word-timestamps")
    if (config.media.transcription.device) args.push("--device", config.media.transcription.device)
    if (config.media.transcription.computeType) args.push("--compute-type", config.media.transcription.computeType)

    const { stdout } = await runCommand({
      command: pythonRuntime.command,
      args,
      env: {
        ...process.env,
        ASKEDITS_PYTHONPATH: buildPythonPathEnv()
      },
      onStderrData: (text) => {
        const match = text.match(/PROGRESS:(\d+)/)
        if (match) {
          onProgress?.(Number(match[1]))
        }
      },
      notFoundMessage:
        "Python runtime could not be started for transcription. Install Python 3.11+ or set PYTHON_BIN to a valid executable path."
    })

    rawTranscript = JSON.parse(stdout)
  }

  // -------------------------------------------------------------------
  // Common post-processing (same regardless of which path was used)
  // -------------------------------------------------------------------
  let structuredTranscript = buildStructuredTranscript(rawTranscript, { mediaDurationSec })

  try {
    structuredTranscript = await translateTranscriptToEnglish(structuredTranscript)
  } catch (err) {
    console.error("[transcription] English translation failed:", err)
  }

  await fs.writeFile(transcriptPath, JSON.stringify(structuredTranscript, null, 2))

  return {
    structuredTranscript,
    summary: {
      status: "ready",
      provider: transcriptionProvider,
      model: rawTranscript.model ?? config.media.transcription.groqWhisperModel,
      task: rawTranscript.task ?? config.media.transcription.task,
      language: structuredTranscript.language.code,
      languageProbability: structuredTranscript.language.probability,
      wordCount: structuredTranscript.summary.wordCount,
      sentenceCount: structuredTranscript.summary.sentenceCount,
      speakerSectionCount: structuredTranscript.summary.speakerSectionCount,
      pauseCount: structuredTranscript.summary.pauseCount,
      silenceCount: structuredTranscript.summary.silenceCount
    }
  }
}
