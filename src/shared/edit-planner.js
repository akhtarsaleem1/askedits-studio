import { defaultEditSettings, getEditTemplate } from "./edit-templates.js"
import { referenceCards } from "./reference-sequence.js"
import { directCaptions, captionScenes } from "./caption-director.js"
import {
  normalizeVisualSettings,
  transitionDuration,
  kineticCaptions,
  buildVisualTracks
} from "./visual-plan.js"

const fail = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 })
}
const round = (value) => Math.round(value * 1000) / 1000
const number = (value, fallback, min, max, name) => {
  const parsed =
    value === undefined || value === null ? fallback : Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max)
    fail("Invalid " + name + ".")
  return parsed
}
const option = (value, fallback, allowed, name) => {
  const result = value ?? fallback
  if (!allowed.includes(result)) fail("Invalid " + name + ".")
  return result
}
export function normalizeEditSettings(input = {}, media = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Editing settings must be an object.")
  const template = getEditTemplate(input.templateId)
  const defaults = defaultEditSettings(template.id)
  const sourceDuration = number(
    media.durationSec,
    0,
    0.1,
    86400,
    "video duration"
  )
  const settings = { ...defaults }
  settings.startSec = number(
    input.startSec,
    0,
    0,
    sourceDuration - 0.1,
    "clip start"
  )
  settings.endSec = number(
    input.endSec,
    sourceDuration,
    settings.startSec + 0.1,
    sourceDuration,
    "clip end"
  )
  settings.aspect = option(
    input.aspect,
    defaults.aspect,
    ["9:16", "16:9", "1:1", "4:5", "original"],
    "aspect ratio"
  )
  settings.framing = option(
    input.framing,
    defaults.framing,
    ["fit", "crop"],
    "framing"
  )
  settings.pace = option(
    input.pace,
    defaults.pace,
    ["gentle", "balanced", "punchy"],
    "pacing"
  )
  settings.captionStyle = option(
    input.captionStyle,
    defaults.captionStyle,
    ["bold", "clean", "minimal", "kinetic"],
    "caption style"
  )
  settings.music = option(
    input.music,
    defaults.music,
    ["none", "focus", "cinematic", "pulse", "custom"],
    "soundtrack"
  )
  settings.resolution = number(input.resolution, 1080, 540, 1080, "resolution")
  if (![540, 720, 1080].includes(settings.resolution))
    fail("Choose 540p, 720p, or 1080p.")
  settings.focalX = number(input.focalX, 50, 0, 100, "horizontal framing")
  settings.focalY = number(input.focalY, 50, 0, 100, "vertical framing")
  settings.musicVolume = number(
    input.musicVolume,
    defaults.musicVolume,
    0,
    0.6,
    "music volume"
  )
  settings.sourceVolume = number(
    input.sourceVolume,
    1,
    0,
    2,
    "original audio volume"
  )
  settings.duration = input.duration ?? defaults.duration
  if (settings.duration !== "full")
    settings.duration = number(settings.duration, 30, 1, 3600, "target length")
  for (const key of [
    "removeSilence",
    "captions",
    "motion",
    "colorGrade",
    "voiceCleanup",
    "autoStock"
  ]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean")
      fail(key + " must be true or false.")
    settings[key] = input[key] ?? defaults[key]
  }
  if (
    input.captionColor !== undefined &&
    !/^#[0-9a-f]{6}$/i.test(input.captionColor)
  )
    fail("Invalid caption color.")
  settings.captionColor = input.captionColor ?? defaults.captionColor
  if (input.manualCaptions !== undefined && input.manualCaptions !== null) {
    if (
      !Array.isArray(input.manualCaptions) ||
      input.manualCaptions.length > 3000
    )
      fail("Captions must be an array with at most 3000 entries.")
    settings.manualCaptions = input.manualCaptions
      .map((caption, index) => {
        if (!caption || typeof caption !== "object")
          fail("Each caption needs a start, end, and text.")
        const startSec = number(
          caption.startSec,
          NaN,
          0,
          sourceDuration,
          "caption start"
        )
        const endSec = number(
          caption.endSec,
          NaN,
          startSec + 0.01,
          sourceDuration + 0.1,
          "caption end"
        )
        if (typeof caption.text !== "string" || caption.text.length > 500)
          fail("Caption text must be under 500 characters.")
        return {
          id: "caption-" + index,
          startSec,
          endSec,
          text: caption.text.trim()
        }
      })
      .filter((caption) => caption.text)
  }
  Object.assign(
    settings,
    normalizeVisualSettings(input, defaults, sourceDuration)
  )
  settings.preview = input.preview === true
  return settings
}
export function outputDimensions(media, settings) {
  const short = settings.preview ? 540 : settings.resolution
  const ratio = {
    "9:16": [9, 16],
    "16:9": [16, 9],
    "1:1": [1, 1],
    "4:5": [4, 5]
  }[settings.aspect]
  const even = (value) => Math.max(2, Math.round(value / 2) * 2)
  if (ratio) {
    const scale = short / Math.min(...ratio)
    return { width: even(ratio[0] * scale), height: even(ratio[1] * scale) }
  }
  const scale = Math.min(1, short / Math.min(media.width, media.height))
  return {
    width: even(media.width * scale),
    height: even(media.height * scale)
  }
}
function keepOutsideSilence(start, end, intervals, pace) {
  const threshold = { gentle: 1.2, balanced: 0.75, punchy: 0.45 }[pace]
  const padding = { gentle: 0.24, balanced: 0.17, punchy: 0.12 }[pace]
  const cuts = intervals
    .filter(
      (i) =>
        Number.isFinite(i.startSec) &&
        Number.isFinite(i.endSec) &&
        i.endSec - i.startSec >= threshold
    )
    .map((i) => ({
      start:
        i.startSec <= start ? start : Math.max(start, i.startSec + padding),
      end: i.endSec >= end ? end : Math.min(end, i.endSec - padding)
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const cut of cuts) {
    const last = merged.at(-1)
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end)
    else merged.push({ ...cut })
  }
  const segments = []
  let cursor = start
  for (const cut of merged) {
    if (cut.start - cursor >= 0.12)
      segments.push({ startSec: cursor, endSec: cut.start })
    cursor = Math.max(cursor, cut.end)
  }
  if (end - cursor >= 0.12) segments.push({ startSec: cursor, endSec: end })
  return segments.length ? segments : [{ startSec: start, endSec: end }]
}
function splitShots(segments, shotSeconds) {
  const output = []
  for (const segment of segments) {
    for (
      let start = segment.startSec;
      start < segment.endSec - 0.04;
      start += shotSeconds
    ) {
      output.push({
        startSec: start,
        endSec: Math.min(segment.endSec, start + shotSeconds)
      })
      if (output.length >= 80) {
        output.at(-1).endSec = segments.at(-1).endSec
        return output
      }
    }
  }
  return output
}
export function transcriptCaptions(transcript, style = "bold") {
  if (transcript?.words?.length) {
    const groups = []
    let current = []
    const limit = style === "kinetic" ? 1 : style === "bold" ? 4 : 9
    for (let i = 0; i < transcript.words.length; i++) {
      const word = transcript.words[i]
      current.push(word)
      const next = transcript.words[i + 1]
      if (
        current.length >= limit ||
        !next ||
        next.startSec - word.endSec > 0.45 ||
        /[.!?]$/.test(word.text)
      ) {
        groups.push({
          startSec: current[0].startSec,
          endSec: word.endSec,
          text: current
            .map((w) => w.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
          words: current.map((w) => ({ ...w }))
        })
        current = []
      }
    }
    return groups
  }
  return (transcript?.sentenceGroups ?? []).map((s) => ({
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text
  }))
}
export function remapCaptions(captions, segments, duration) {
  const result = []
  for (const caption of captions) {
    for (const segment of segments) {
      const start = Math.max(caption.startSec, segment.startSec)
      const end = Math.min(caption.endSec, segment.endSec)
      if (end - start < 0.035) continue
      const words = caption.words?.filter(
        (w) => w.endSec > start && w.startSec < end
      )
      const text = words?.length
        ? words
            .map((w) => w.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        : caption.text
      result.push({
        id: "caption-" + result.length,
        startSec: round(segment.outputStartSec + start - segment.startSec),
        endSec: round(
          Math.min(duration, segment.outputStartSec + end - segment.startSec)
        ),
        text
      })
    }
  }
  return result
    .filter((c) => c.endSec > c.startSec && c.text)
    .sort((a, b) => a.startSec - b.startSec)
}
export function buildEditPlan({
  media,
  settings: input,
  silence = {},
  transcript = null,
  hasCustomMusic = false,
  visualAssets = [],
  semanticScores = {},
  matchingEngine = "keyword-rules"
}) {
  const settings = normalizeEditSettings(input, media)
  const template = getEditTemplate(settings.templateId)
  const sourceCaptions =
    settings.manualCaptions ??
    transcriptCaptions(transcript, settings.captionStyle)
  const transitionSeconds =
    settings.visualMode === "captions" && template.kind === "speech"
      ? 0
      : transitionDuration(settings, template)
  const warnings = []
  if (settings.music === "custom" && !hasCustomMusic)
    fail("Upload a music track before choosing custom music.")
  let segments
  const range = settings.endSec - settings.startSec
  let target =
    settings.duration === "full" ? range : Math.min(range, settings.duration)
  if (template.kind === "montage") {
    const shot =
      template.shotSeconds *
      { gentle: 1.35, balanced: 1, punchy: 0.7 }[settings.pace]
    const count = Math.min(12, Math.max(1, Math.ceil(target / shot)))
    const transition = Math.min(transitionSeconds, target / count / 4)
    const length = Math.min(range, (target + transition * (count - 1)) / count)
    segments = Array.from({ length: count }, (_, i) => {
      const startSec =
        settings.startSec +
        (count === 1 ? 0 : ((range - length) * i) / (count - 1))
      return { startSec, endSec: startSec + length }
    })
  } else {
    segments =
      settings.removeSilence && media.hasAudio
        ? keepOutsideSilence(
            settings.startSec,
            settings.endSec,
            silence.intervals ?? [],
            settings.pace
          )
        : [{ startSec: settings.startSec, endSec: settings.endSec }]
    if (settings.removeSilence && media.hasAudio && !silence.intervals?.length)
      warnings.push("No pauses detected; the spoken content is preserved.")
    if (settings.visualMode === "captions" && sourceCaptions.length) {
      const points = captionScenes(
        kineticCaptions(sourceCaptions),
        media.durationSec,
        settings.headline
      ).map((c) => c.startSec)
      segments = segments.flatMap((segment) => {
        const boundaries = [
          segment.startSec,
          ...points.filter(
            (p) => p > segment.startSec + 0.4 && p < segment.endSec - 0.4
          ),
          segment.endSec
        ]
        return boundaries
          .slice(1)
          .map((end, index) => ({ startSec: boundaries[index], endSec: end }))
      })
    } else
      segments = splitShots(
        segments,
        settings.motion && template.zoom > 1 ? template.shotSeconds : 86400
      )
  }
  let outputCursor = 0
  const timed = []
  for (const item of segments) {
    if (outputCursor >= target - 0.035) break
    const overlap = timed.length
      ? Math.min(
          transitionSeconds,
          (item.endSec - item.startSec) / 4,
          (timed.at(-1).endSec - timed.at(-1).startSec) / 4
        )
      : 0
    const length = Math.min(
      item.endSec - item.startSec,
      target - outputCursor + overlap
    )
    timed.push({
      id: "shot-" + (timed.length + 1),
      startSec: round(item.startSec),
      endSec: round(item.startSec + length),
      outputStartSec: round(outputCursor - overlap),
      transitionSec: round(overlap),
      zoom: settings.motion
        ? template.kind === "montage"
          ? template.zoom
          : timed.length % 2
            ? template.zoom
            : 1
        : 1
    })
    outputCursor += length - overlap
  }
  if (!timed.length) fail("The selected clip is too short to edit.")
  const directed =
    settings.visualMode === "captions"
      ? directCaptions({
          captions: remapCaptions(
            kineticCaptions(sourceCaptions),
            timed,
            outputCursor
          ),
          assets: visualAssets,
          duration: outputCursor,
          headline: settings.headline,
          semanticScores
        })
      : null
  if (directed && !sourceCaptions.length)
    warnings.push(
      "Caption-directed editing needs timed captions. Transcribe the recording or import SRT first."
    )
  if (settings.preview && outputCursor > 12) {
    const previewShots = timed
      .filter(
        (shot) =>
          shot.outputStartSec < 12 &&
          12 - shot.outputStartSec > shot.transitionSec + 0.04
      )
      .map((shot) => ({
        ...shot,
        endSec: round(
          Math.min(shot.endSec, shot.startSec + 12 - shot.outputStartSec)
        )
      }))
    timed.splice(0, timed.length, ...previewShots)
    outputCursor = 12
  }
  const captions = settings.captions
    ? remapCaptions(
        settings.captionStyle === "kinetic"
          ? kineticCaptions(sourceCaptions)
          : sourceCaptions,
        timed,
        outputCursor
      )
    : []
  if (settings.captions && !captions.length)
    warnings.push(
      "Captions are unavailable. Add captions or import an SRT file; video export is still available."
    )
  if (!media.hasAudio)
    warnings.push(
      "This source has no audio. A silent audio track or your selected music will be added."
    )
  const keptDuration = timed.reduce((sum, s) => sum + s.endSec - s.startSec, 0)
  const storyCards =
    settings.layout === "reference"
      ? (
          directed?.scenes ??
          referenceCards(captions, outputCursor, settings.headline)
        )
          .filter((card) => card.startSec < outputCursor)
          .map((card, index) => ({
            ...card,
            endSec: Math.min(card.endSec, outputCursor),
            title: settings.cardTitles[index]?.trim() || card.title
          }))
      : []
  const visualTracks = buildVisualTracks(
    directed ? { ...settings, visuals: directed.placements } : settings,
    settings.visualMode === "captions"
      ? []
      : settings.layout === "reference"
        ? storyCards.map((c) => ({ outputStartSec: c.startSec }))
        : timed,
    outputCursor,
    visualAssets,
    warnings
  )
  return {
    schemaVersion: 2,
    templateId: template.id,
    templateName: template.name,
    settings,
    dimensions: outputDimensions(media, settings),
    sourceWidth: media.width,
    sourceHeight: media.height,
    segments: timed,
    captions,
    sourceCaptions,
    warnings,
    ...visualTracks,
    storyCards,
    visualDecisions:
      directed?.decisions
        .filter((c) => c.startSec < outputCursor)
        .map((c) => ({ ...c, endSec: Math.min(c.endSec, outputCursor) })) ?? [],
    matchingEngine: directed ? matchingEngine : null,
    summary: {
      sourceDurationSec: round(range),
      outputDurationSec: round(outputCursor),
      removedSeconds: round(Math.max(0, range - keptDuration)),
      shotCount: timed.length,
      captionCount: captions.length,
      transitionCount: timed.filter((s) => s.transitionSec > 0).length,
      brollCount: visualTracks.visuals.length,
      soundEffectCount: visualTracks.sfx.length
    }
  }
}
export function suggestClips(media, transcript, length = 45) {
  const duration = media.durationSec
  const clipLength = Math.min(length, duration)
  const sentences = transcript?.sentenceGroups ?? []
  const candidates = sentences.length
    ? sentences
        .filter((s) => s.startSec <= duration - Math.min(clipLength, 5))
        .map((s) => {
          const end = Math.min(duration, s.startSec + clipLength)
          const words = (transcript.words ?? []).filter(
            (w) => w.startSec >= s.startSec && w.endSec <= end
          ).length
          return {
            startSec: s.startSec,
            endSec: end,
            title: s.text.slice(0, 74),
            score:
              words / Math.max(1, end - s.startSec) +
              (/\?|how|why|reason|remember|important/i.test(s.text) ? 1 : 0)
          }
        })
        .sort((a, b) => b.score - a.score)
    : [0, 0.4, 0.8].map((f) => {
        const start = Math.max(0, (duration - clipLength) * f)
        return {
          startSec: start,
          endSec: Math.min(duration, start + clipLength),
          title:
            "Excerpt " +
            Math.round(start) +
            "s – " +
            Math.round(Math.min(duration, start + clipLength)) +
            "s",
          score: 0
        }
      })
  const chosen = []
  for (const candidate of candidates) {
    if (
      chosen.every(
        (c) => Math.abs(c.startSec - candidate.startSec) >= clipLength * 0.55
      )
    )
      chosen.push({
        ...candidate,
        startSec: round(candidate.startSec),
        endSec: round(candidate.endSec),
        basis: sentences.length
          ? "Transcript-based suggestion"
          : "Timeline excerpt"
      })
    if (chosen.length === 3) break
  }
  return chosen
}
export function parseSrt(text) {
  if (typeof text !== "string" || text.length > 500000)
    fail("SRT file is too large.")
  const time = (value) => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/)
    if (!match) fail("Invalid SRT timestamp.")
    return (
      Number(match[1]) * 3600 +
      Number(match[2]) * 60 +
      Number(match[3]) +
      Number(match[4]) / 1000
    )
  }
  const captions = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n")
      const i = lines.findIndex((l) => l.includes("-->"))
      if (i < 0) fail("This file does not contain valid SRT captions.")
      const [start, end] = lines[i].split("-->")
      const startSec = time(start),
        endSec = time(end)
      if (!(endSec > startSec)) fail("Caption end must follow its start.")
      return {
        startSec,
        endSec,
        text: lines
          .slice(i + 1)
          .join(" ")
          .replace(/<[^>]*>/g, "")
          .trim()
      }
    })
  if (!captions.length) fail("No captions found in this SRT file.")
  return captions
}
export function captionsToSrt(captions) {
  const time = (sec) => {
    const ms = Math.round(sec * 1000)
    return (
      [
        Math.floor(ms / 3600000),
        Math.floor(ms / 60000) % 60,
        Math.floor(ms / 1000) % 60
      ]
        .map((n) => String(n).padStart(2, "0"))
        .join(":") +
      "," +
      String(ms % 1000).padStart(3, "0")
    )
  }
  return captions
    .map(
      (c, i) =>
        i +
        1 +
        "\n" +
        time(c.startSec) +
        " --> " +
        time(c.endSec) +
        "\n" +
        c.text +
        "\n"
    )
    .join("\n")
}

export function editFingerprint(input, media) {
  const settings = normalizeEditSettings(input, media)
  settings.preview = false
  const text = JSON.stringify(settings)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}
