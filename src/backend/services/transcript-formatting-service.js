import config from "../../../config/default.js"

const DEFAULT_SILENCE_THRESHOLD_SEC = config.media.transcription.silenceThresholdSec
const DEFAULT_SPEAKER_SECTION_GAP_SEC = config.media.transcription.speakerSectionGapSec

function roundNumber(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number(value.toFixed(digits))
}

function splitTextIntoWords(text = "") {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

function normalizeSegmentWords(segment, segmentIndex) {
  if (Array.isArray(segment.words) && segment.words.length > 0) {
    return segment.words.map((word, wordIndex) => ({
      id: `${segmentIndex}:${wordIndex}`,
      segmentIndex,
      text: String(word.word ?? word.text ?? "").trim(),
      startSec: roundNumber(Number(word.start ?? segment.start ?? 0)),
      endSec: roundNumber(Number(word.end ?? segment.end ?? word.start ?? segment.start ?? 0)),
      confidence: roundNumber(Number(word.probability ?? word.confidence ?? 0), 4)
    }))
  }

  const fallbackWords = splitTextIntoWords(segment.text)
  const durationSec = Math.max(0, Number(segment.end ?? 0) - Number(segment.start ?? 0))
  const sliceDuration = fallbackWords.length > 0 ? durationSec / fallbackWords.length : 0

  return fallbackWords.map((word, wordIndex) => {
    const startSec = Number(segment.start ?? 0) + sliceDuration * wordIndex
    const endSec = wordIndex === fallbackWords.length - 1 ? Number(segment.end ?? startSec) : startSec + sliceDuration

    return {
      id: `${segmentIndex}:${wordIndex}`,
      segmentIndex,
      text: word,
      startSec: roundNumber(startSec),
      endSec: roundNumber(endSec),
      confidence: roundNumber(Number(segment.avg_logprob ?? 0) <= 0 ? Math.exp(Number(segment.avg_logprob ?? 0)) : 0.5, 4)
    }
  })
}

function classifyPause(durationSec) {
  if (durationSec >= 2.5) {
    return "long"
  }

  if (durationSec >= 1.2) {
    return "medium"
  }

  if (durationSec >= 0.35) {
    return "short"
  }

  return "micro"
}

function deriveEmphasis(text, averageWordDurationSec, pauseBeforeSec) {
  let score = 0
  const signals = []

  if (/[!?]{1,}/.test(text)) {
    score += 0.35
    signals.push("punctuation")
  }

  const emphasizedWords = text
    .split(/\s+/)
    .filter((word) => /^[A-Z0-9]{2,}$/.test(word.replace(/[^A-Za-z0-9]/g, "")))

  if (emphasizedWords.length > 0) {
    score += 0.25
    signals.push("uppercase")
  }

  if (averageWordDurationSec >= 0.55) {
    score += 0.2
    signals.push("drawn_out_delivery")
  }

  if (pauseBeforeSec >= 0.9) {
    score += 0.15
    signals.push("setup_pause")
  }

  const level = score >= 0.6 ? "high" : score >= 0.3 ? "medium" : "low"

  return {
    level,
    score: roundNumber(Math.min(score, 1), 3),
    signals
  }
}

function buildSpeakerSections(sentenceGroups, speakerSectionGapSec) {
  if (sentenceGroups.length === 0) {
    return []
  }

  const sections = []
  let currentSection = {
    speakerLabel: "Speaker 1",
    inferred: true,
    startSec: sentenceGroups[0].startSec,
    endSec: sentenceGroups[0].endSec,
    sentenceGroupIds: [sentenceGroups[0].id],
    text: sentenceGroups[0].text
  }

  for (let index = 1; index < sentenceGroups.length; index += 1) {
    const nextGroup = sentenceGroups[index]
    const previousGroup = sentenceGroups[index - 1]
    const gapSec = roundNumber(nextGroup.startSec - previousGroup.endSec)

    if (gapSec >= speakerSectionGapSec) {
      sections.push(currentSection)
      currentSection = {
        speakerLabel: "Speaker 1",
        inferred: true,
        startSec: nextGroup.startSec,
        endSec: nextGroup.endSec,
        sentenceGroupIds: [nextGroup.id],
        text: nextGroup.text
      }
      continue
    }

    currentSection.endSec = nextGroup.endSec
    currentSection.sentenceGroupIds.push(nextGroup.id)
    currentSection.text = `${currentSection.text} ${nextGroup.text}`.trim()
  }

  sections.push(currentSection)

  return sections.map((section, index) => ({
    ...section,
    id: `speaker-section-${index + 1}`,
    durationSec: roundNumber(section.endSec - section.startSec)
  }))
}

export function buildStructuredTranscript(rawTranscript, options = {}) {
  const silenceThresholdSec = Number(options.silenceThresholdSec ?? DEFAULT_SILENCE_THRESHOLD_SEC)
  const speakerSectionGapSec = Number(options.speakerSectionGapSec ?? DEFAULT_SPEAKER_SECTION_GAP_SEC)
  const segments = Array.isArray(rawTranscript?.segments) ? rawTranscript.segments : []

  const words = []
  const sentenceGroups = []
  const pauses = []
  const silenceIntervals = []

  let previousWordEndSec = 0

  segments.forEach((segment, segmentIndex) => {
    const normalizedWords = normalizeSegmentWords(segment, segmentIndex).filter((word) => word.text.length > 0)

    normalizedWords.forEach((word, wordIndex) => {
      const pauseBeforeSec = words.length === 0 ? 0 : roundNumber(Math.max(0, word.startSec - previousWordEndSec))
      const nextWord = {
        ...word,
        durationSec: roundNumber(Math.max(0, word.endSec - word.startSec)),
        pauseBeforeSec,
        silenceBefore: pauseBeforeSec >= silenceThresholdSec
      }

      words.push(nextWord)

      if (words.length > 1 && pauseBeforeSec > 0) {
        const previousWord = words[words.length - 2]
        const pause = {
          id: `pause-${pauses.length + 1}`,
          afterWordId: previousWord.id,
          beforeWordId: nextWord.id,
          startSec: previousWord.endSec,
          endSec: nextWord.startSec,
          durationSec: pauseBeforeSec,
          classification: classifyPause(pauseBeforeSec)
        }

        pauses.push(pause)

        if (pauseBeforeSec >= silenceThresholdSec) {
          silenceIntervals.push({
            id: `silence-${silenceIntervals.length + 1}`,
            startSec: pause.startSec,
            endSec: pause.endSec,
            durationSec: pause.durationSec
          })
        }
      }

      previousWordEndSec = nextWord.endSec
    })

    const firstWord = normalizedWords[0]
    const lastWord = normalizedWords[normalizedWords.length - 1]
    const segmentStartSec = roundNumber(Number(firstWord?.startSec ?? segment.start ?? 0))
    const segmentEndSec = roundNumber(Number(lastWord?.endSec ?? segment.end ?? segmentStartSec))
    const averageWordDurationSec =
      normalizedWords.length > 0
        ? roundNumber(
            normalizedWords.reduce((total, word) => total + Math.max(0, word.endSec - word.startSec), 0) / normalizedWords.length
          )
        : 0
    const pauseBeforeSec = sentenceGroups.length === 0 ? 0 : roundNumber(Math.max(0, segmentStartSec - sentenceGroups[sentenceGroups.length - 1].endSec))

    sentenceGroups.push({
      id: `sentence-${segmentIndex + 1}`,
      text: String(segment.text ?? "").trim(),
      startSec: segmentStartSec,
      endSec: segmentEndSec,
      durationSec: roundNumber(segmentEndSec - segmentStartSec),
      wordIds: normalizedWords.map((word) => word.id),
      wordCount: normalizedWords.length,
      avgConfidence:
        normalizedWords.length > 0
          ? roundNumber(normalizedWords.reduce((total, word) => total + Number(word.confidence ?? 0), 0) / normalizedWords.length, 4)
          : 0,
      emphasis: deriveEmphasis(String(segment.text ?? "").trim(), averageWordDurationSec, pauseBeforeSec)
    })
  })

  const speakerSections = buildSpeakerSections(sentenceGroups, speakerSectionGapSec)
  const detectedLanguage = String(rawTranscript?.language ?? "unknown")
  const mediaDurationSec = roundNumber(Number(options.mediaDurationSec ?? rawTranscript?.duration ?? (words.at(-1)?.endSec ?? 0)))
  const totalSilenceSec = roundNumber(silenceIntervals.reduce((total, silence) => total + silence.durationSec, 0))
  const longestSilenceSec = silenceIntervals.reduce((longest, silence) => Math.max(longest, silence.durationSec), 0)

  return {
    schemaVersion: 1,
    provider: "faster-whisper",
    generatedAt: new Date().toISOString(),
    source: {
      model: rawTranscript?.model ?? config.media.transcription.model,
      device: rawTranscript?.device ?? config.media.transcription.device,
      computeType: rawTranscript?.computeType ?? config.media.transcription.computeType,
      task: rawTranscript?.task ?? config.media.transcription.task
    },
    language: {
      code: detectedLanguage,
      probability: roundNumber(Number(rawTranscript?.languageProbability ?? 0), 4)
    },
    durationSec: mediaDurationSec,
    summary: {
      language: detectedLanguage,
      wordCount: words.length,
      sentenceCount: sentenceGroups.length,
      speakerSectionCount: speakerSections.length,
      pauseCount: pauses.length,
      silenceCount: silenceIntervals.length,
      totalSilenceSec,
      longestSilenceSec: roundNumber(longestSilenceSec)
    },
    words,
    sentenceGroups,
    pauses,
    silenceDetection: {
      thresholdSec: silenceThresholdSec,
      totalSilenceSec,
      longestSilenceSec: roundNumber(longestSilenceSec),
      intervals: silenceIntervals
    },
    speakerSections,
    rawSegments: segments.map((segment) => ({
      id: segment.id ?? null,
      startSec: roundNumber(Number(segment.start ?? 0)),
      endSec: roundNumber(Number(segment.end ?? 0)),
      text: String(segment.text ?? "").trim(),
      avgLogProb: Number(segment.avgLogProb ?? segment.avg_logprob ?? 0),
      noSpeechProb: Number(segment.noSpeechProb ?? segment.no_speech_prob ?? 0)
    }))
  }
}
