import test from "node:test"
import assert from "node:assert/strict"

import { buildAssetLayout, chunkFilePath, sanitizeFileName } from "../src/backend/utils/storage-layout.js"
import { buildStructuredTranscript } from "../src/backend/services/transcript-formatting-service.js"
import { DEFAULT_CHUNK_SIZE_BYTES, validateVideoSelection } from "../src/shared/upload-config.js"

test("validateVideoSelection accepts a supported mp4 file", () => {
  const result = validateVideoSelection({
    name: "launch-cut.mp4",
    size: DEFAULT_CHUNK_SIZE_BYTES
  })

  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test("validateVideoSelection rejects unsupported or empty files", () => {
  const result = validateVideoSelection({
    name: "notes.txt",
    size: 0
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((message) => message.includes("Unsupported file format")))
  assert.ok(result.errors.some((message) => message.includes("appears to be empty")))
})

test("storage layout sanitizes file names and builds deterministic paths", () => {
  const layout = buildAssetLayout("asset123", "My rough cut (final).mov")

  assert.equal(sanitizeFileName("My rough cut (final).mov"), "My-rough-cut-final-.mov")
  assert.ok(layout.originalFile.endsWith("original\\My-rough-cut-final-.mov") || layout.originalFile.endsWith("original/My-rough-cut-final-.mov"))
  assert.ok(chunkFilePath(layout, 7).includes("chunk-00007.part"))
  assert.ok(layout.audioFile.includes("audio"))
  assert.ok(layout.transcriptFile.includes("transcripts"))
})

test("buildStructuredTranscript produces pauses, silences, and speaker sections", () => {
  const transcript = buildStructuredTranscript(
    {
      model: "small",
      task: "transcribe",
      language: "en",
      languageProbability: 0.97,
      duration: 6.2,
      segments: [
        {
          id: 0,
          start: 0,
          end: 1.1,
          text: "Hello there!",
          words: [
            { word: "Hello", start: 0, end: 0.4, probability: 0.95 },
            { word: "there!", start: 0.45, end: 1.1, probability: 0.92 }
          ]
        },
        {
          id: 1,
          start: 2.4,
          end: 3.7,
          text: "How are you today?",
          words: [
            { word: "How", start: 2.4, end: 2.7, probability: 0.91 },
            { word: "are", start: 2.75, end: 2.95, probability: 0.9 },
            { word: "you", start: 3.0, end: 3.15, probability: 0.9 },
            { word: "today?", start: 3.2, end: 3.7, probability: 0.93 }
          ]
        }
      ]
    },
    {
      mediaDurationSec: 6.2,
      silenceThresholdSec: 0.6,
      speakerSectionGapSec: 1
    }
  )

  assert.equal(transcript.language.code, "en")
  assert.equal(transcript.summary.wordCount, 6)
  assert.equal(transcript.summary.sentenceCount, 2)
  assert.ok(transcript.pauses.some((pause) => pause.durationSec >= 1))
  assert.ok(transcript.silenceDetection.intervals.length >= 1)
  assert.equal(transcript.speakerSections.length, 2)
  assert.equal(transcript.sentenceGroups[0].emphasis.level, "medium")
})
