import fs from "node:fs/promises"
import path from "node:path"

/**
 * Caption Engine: Generates ASS subtitles from either manual edit-plan captions
 * or word-level transcript data as a fallback.
 */

const POSITION_ALIGNMENT = {
  bottom: 2,
  middle: 5,
  top: 8
}

const STYLE_PRESETS = {
  tiktok: {
    fontFamily: "Arial",
    fontSize: 24,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: -1,
    italic: 0,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 0,
    position: "bottom",
    marginV: 20
  },
  hormozi: {
    fontFamily: "Impact",
    fontSize: 32,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H0000FFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: -1,
    italic: 0,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 4,
    shadow: 2,
    position: "bottom",
    marginV: 25
  },
  cinematic: {
    fontFamily: "Georgia",
    fontSize: 18,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    spacing: 2,
    angle: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    position: "bottom",
    marginV: 15
  },
  documentary: {
    fontFamily: "Times New Roman",
    fontSize: 16,
    primaryColour: "&H0000FFFF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: 0,
    italic: -1,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 1,
    position: "bottom",
    marginV: 10
  },
  podcast: {
    fontFamily: "Helvetica",
    fontSize: 14,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: 0,
    italic: 0,
    spacing: 0,
    angle: 0,
    borderStyle: 3,
    outline: 1,
    shadow: 0,
    position: "bottom",
    marginV: 10
  },
  gaming: {
    fontFamily: "Verdana",
    fontSize: 28,
    primaryColour: "&H0000FFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H00000000",
    backColour: "&H00000000",
    bold: -1,
    italic: 0,
    spacing: 0,
    angle: 10,
    borderStyle: 1,
    outline: 3,
    shadow: 2,
    position: "bottom",
    marginV: 30
  },
  news: {
    fontFamily: "Arial",
    fontSize: 18,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: 0,
    italic: 0,
    spacing: 0,
    angle: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    position: "bottom",
    marginV: 10
  },
  minimalist: {
    fontFamily: "Arial",
    fontSize: 12,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    spacing: 1,
    angle: 0,
    borderStyle: 1,
    outline: 0,
    shadow: 0,
    position: "bottom",
    marginV: 5
  }
}

const STYLE_ALIASES = {
  bold_pop: "hormozi",
  subtitle_bar: "podcast",
  word_pop: "tiktok",
  kinetic: "tiktok"
}

function normalizeStyleName(styleName) {
  const key = String(styleName || "tiktok")
  return STYLE_ALIASES[key] || key
}

function formatAssTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.floor((sec % 1) * 100)
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function cssColorToAss(value, fallback) {
  if (!value) return fallback
  const text = String(value).trim()
  const hex = text.startsWith("#") ? text.slice(1) : null

  if (hex && (hex.length === 3 || hex.length === 6)) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
    const rr = full.slice(0, 2)
    const gg = full.slice(2, 4)
    const bb = full.slice(4, 6)
    return `&H00${bb}${gg}${rr}`.toUpperCase()
  }

  const rgba = text.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i)
  if (rgba) {
    const r = clampNumber(rgba[1], 255, 0, 255)
    const g = clampNumber(rgba[2], 255, 0, 255)
    const b = clampNumber(rgba[3], 255, 0, 255)
    const alpha = rgba[4] === undefined ? 1 : clampNumber(rgba[4], 1, 0, 1)
    const assAlpha = Math.round((1 - alpha) * 255)
    const toHex = (n) => Math.round(n).toString(16).padStart(2, "0")
    return `&H${toHex(assAlpha)}${toHex(b)}${toHex(g)}${toHex(r)}`.toUpperCase()
  }

  return fallback
}

function assBool(value, fallback) {
  if (value === undefined || value === null) return fallback
  return value ? -1 : 0
}

function sanitizeFontName(value, fallback) {
  const font = String(value || fallback).replace(/[{},]/g, "").trim()
  return font || fallback
}

function getMergedCaptionStyle(styleName, overrides = {}) {
  const preset = STYLE_PRESETS[normalizeStyleName(styleName)] || STYLE_PRESETS.tiktok
  const position = overrides.position || preset.position || "bottom"

  return {
    fontFamily: sanitizeFontName(overrides.fontFamily, preset.fontFamily),
    fontSize: clampNumber(overrides.fontSize, preset.fontSize, 8, 96),
    primaryColour: cssColorToAss(overrides.textColor, preset.primaryColour),
    secondaryColour: preset.secondaryColour,
    outlineColour: cssColorToAss(overrides.outlineColor, preset.outlineColour),
    backColour: cssColorToAss(overrides.backgroundColor, preset.backColour),
    bold: assBool(overrides.bold, preset.bold),
    italic: assBool(overrides.italic, preset.italic),
    spacing: preset.spacing,
    angle: preset.angle,
    borderStyle: preset.borderStyle,
    outline: clampNumber(overrides.outlineWidth, preset.outline, 0, 10),
    shadow: preset.shadow,
    alignment: POSITION_ALIGNMENT[position] || POSITION_ALIGNMENT.bottom,
    marginV: Math.round(clampNumber(overrides.vmargin, preset.marginV, 0, 250))
  }
}

function getStyleDefinition(styleName, overrides = {}) {
  const s = getMergedCaptionStyle(styleName, overrides)

  return [
    "Style: Default",
    s.fontFamily,
    s.fontSize,
    s.primaryColour,
    s.secondaryColour,
    s.outlineColour,
    s.backColour,
    s.bold,
    s.italic,
    0,
    0,
    100,
    100,
    s.spacing,
    s.angle,
    s.borderStyle,
    s.outline,
    s.shadow,
    s.alignment,
    10,
    10,
    s.marginV,
    1
  ].join(",")
}

function escapeAssText(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "\\N")
    .replace(/[{}]/g, "")
    .trim()
}

function buildOverrideTags(style) {
  const tags = []
  const resolved = getMergedCaptionStyle(style.style, style)
  const overrideColor = (ass) => {
    return `&H${ass.slice(4)}&`
  }

  tags.push(`\\an${resolved.alignment}`)
  tags.push(`\\fn${resolved.fontFamily}`)
  tags.push(`\\fs${Math.round(resolved.fontSize)}`)
  tags.push(`\\b${resolved.bold === -1 ? 1 : 0}`)
  tags.push(`\\i${resolved.italic === -1 ? 1 : 0}`)
  tags.push(`\\c${overrideColor(resolved.primaryColour)}`)
  tags.push(`\\3c${overrideColor(resolved.outlineColour)}`)
  tags.push(`\\bord${resolved.outline}`)

  return tags.length ? `{${tags.join("")}}` : ""
}

function createAssHeader({ playResX, playResY, settings }) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${getStyleDefinition(settings.style, settings)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

function createManualCaptionEvents(captions, settings) {
  return captions
    .filter((caption) => Number(caption.endSec) > Number(caption.startSec) && String(caption.text ?? "").trim())
    .sort((a, b) => Number(a.startSec) - Number(b.startSec))
    .map((caption) => {
      const mergedStyle = { ...settings, ...caption, style: caption.style || settings.style }
      const marginV = Math.round(clampNumber(mergedStyle.vmargin, settings.vmargin ?? 20, 0, 250))
      const text = `${buildOverrideTags(mergedStyle)}${escapeAssText(caption.text)}`
      return `Dialogue: 0,${formatAssTime(Number(caption.startSec))},${formatAssTime(Number(caption.endSec))},Default,,0,0,${marginV},,${text}\n`
    })
    .join("")
}

function createTranscriptCaptionEvents(transcript, settings) {
  const maxWords = ["tiktok", "hormozi", "gaming", "word_pop", "bold_pop", "kinetic"].includes(settings.style) ? 3 : 8
  let currentSegment = []
  let events = ""

  for (let i = 0; i < transcript.words.length; i++) {
    const word = transcript.words[i]
    currentSegment.push(word)

    const isEndOfSentence = /[.!?]/.test(word.text)
    const isPause = i < transcript.words.length - 1 && (transcript.words[i + 1].startSec - word.endSec) > 0.5
    const isFull = currentSegment.length >= maxWords

    if (isEndOfSentence || isPause || isFull || i === transcript.words.length - 1) {
      const startSec = currentSegment[0].startSec
      const endSec = currentSegment[currentSegment.length - 1].endSec

      let text = ""
      if (["tiktok", "hormozi", "gaming", "word_pop", "bold_pop", "kinetic"].includes(settings.style)) {
        currentSegment.forEach((w) => {
          const durationCs = Math.max(1, Math.round((w.endSec - w.startSec) * 100))
          text += `{\\k${durationCs}}${escapeAssText(w.text)} `
        })
      } else {
        text = currentSegment.map((w) => escapeAssText(w.text)).join(" ")
      }

      events += `Dialogue: 0,${formatAssTime(startSec)},${formatAssTime(endSec)},Default,,0,0,0,,${text.trim()}\n`
      currentSegment = []
    }
  }

  return events
}

export async function generateCaptionAss({ transcript, settings, videoMeta, outputPath, editPlan }) {
  if (!settings?.enabled) {
    return null
  }

  const plannedCaptions = Array.isArray(editPlan?.timeline?.captions) ? editPlan.timeline.captions : []
  const hasTranscriptWords = Array.isArray(transcript?.words) && transcript.words.length > 0
  if (!plannedCaptions.length && !hasTranscriptWords) {
    return null
  }

  const isVertical = videoMeta && videoMeta.width < videoMeta.height
  const playResX = isVertical ? 360 : 640
  const playResY = isVertical ? 640 : 360
  const resolvedSettings = { style: "tiktok", position: "bottom", vmargin: 20, ...settings }

  let assContent = createAssHeader({ playResX, playResY, settings: resolvedSettings })
  assContent += plannedCaptions.length
    ? createManualCaptionEvents(plannedCaptions, resolvedSettings)
    : createTranscriptCaptionEvents(transcript, resolvedSettings)

  await fs.writeFile(outputPath, assContent, "utf8")
  return outputPath
}

export function generateCaptionFilter({ settings, assPath }) {
  if (!settings?.enabled || !assPath) {
    return { filterGraph: "" }
  }

  const relativePath = path.relative(process.cwd(), assPath)
  const escapedPath = relativePath.replace(/\\/g, "/")

  return {
    filterGraph: `ass='${escapedPath}'`
  }
}
