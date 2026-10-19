const invalid = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 })
}
const numeric = (value, fallback, min, max) => {
  const result = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(result) || result < min || result > max)
    invalid("Invalid visual or sound timing/level.")
  return result
}
const choose = (value, fallback, values) => {
  const result = value ?? fallback
  if (!values.includes(result))
    invalid("Choose a supported visual, transition, or sound style.")
  return result
}
export function normalizeVisualSettings(input, defaults, duration) {
  if (
    input.removeBackground !== undefined &&
    typeof input.removeBackground !== "boolean"
  )
    invalid("Presenter cutout must be true or false.")
  if (
    input.cardTitles !== undefined &&
    (!Array.isArray(input.cardTitles) ||
      input.cardTitles.length > 10 ||
      input.cardTitles.some((t) => typeof t !== "string" || t.length > 60))
  )
    invalid("Use up to 10 chapter titles under 60 characters.")
  if (input.graphics !== undefined && typeof input.graphics !== "boolean")
    invalid("Motion graphics must be true or false.")
  const headline = input.headline ?? defaults.headline
  if (typeof headline !== "string" || headline.length > 80)
    invalid("Keep the headline under 80 characters.")
  const visuals = input.visuals ?? []
  if (!Array.isArray(visuals) || visuals.length > 12)
    invalid("Use at most 12 B-roll placements per edit.")
  return {
    layout: choose(input.layout, defaults.layout, [
      "standard",
      "presenter",
      "reference"
    ]),
    removeBackground: input.removeBackground === true,
    sourceCropTop: numeric(input.sourceCropTop, 0, 0, 0.3),
    sourceCropBottom: numeric(input.sourceCropBottom, 0, 0, 0.35),
    cardTitles: input.cardTitles ?? [],
    transition: choose(input.transition, defaults.transition, [
      "template",
      "cut",
      "dissolve",
      "slide",
      "wipe",
      "flash"
    ]),
    captionPosition: choose(input.captionPosition, defaults.captionPosition, [
      "lower",
      "middle",
      "upper"
    ]),
    graphics: input.graphics ?? defaults.graphics,
    headline: headline.trim(),
    sfx: choose(input.sfx, defaults.sfx, ["none", "subtle", "punchy"]),
    sfxVolume: numeric(input.sfxVolume, 0.35, 0, 1),
    visuals: visuals
      .map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          !/^[a-f0-9]{32}$/.test(item.assetId)
        )
          invalid("Choose a B-roll asset from this project's library.")
        const startSec = numeric(item.startSec, 0, 0, duration)
        const endSec = numeric(
          item.endSec,
          Math.min(duration, startSec + 3),
          startSec + 0.1,
          duration + 0.1
        )
        if (endSec - startSec > 30)
          invalid("Each B-roll placement can last up to 30 seconds.")
        if (
          typeof (item.label ?? "") !== "string" ||
          (item.label ?? "").length > 80
        )
          invalid("Keep B-roll labels under 80 characters.")
        return {
          assetId: item.assetId,
          startSec,
          endSec,
          clipStartSec: numeric(item.clipStartSec, 0, 0, 86400),
          label: (item.label ?? "").trim()
        }
      })
      .sort((a, b) => a.startSec - b.startSec)
  }
}
export function transitionDuration(settings, template) {
  return settings.transition === "cut"
    ? 0
    : settings.transition === "template"
      ? template.transition
      : 0.18
}
export function kineticCaptions(captions) {
  return captions.flatMap((caption) => {
    if (caption.words?.length)
      return caption.words.map((word) => ({
        startSec: word.startSec,
        endSec: word.endSec,
        text: word.text
      }))
    const words = caption.text.split(/\s+/).filter(Boolean)
    const step = (caption.endSec - caption.startSec) / Math.max(1, words.length)
    return words.map((text, index) => ({
      text,
      startSec: caption.startSec + step * index,
      endSec: caption.startSec + step * (index + 1)
    }))
  })
}
export function buildVisualTracks(
  settings,
  segments,
  duration,
  assets,
  warnings
) {
  const visuals = []
  for (const placement of settings.visuals) {
    const asset = assets.find((item) => item.id === placement.assetId)
    if (!asset)
      invalid(
        "A selected B-roll asset is missing. Remove it or upload it again."
      )
    if (
      asset.kind === "video" &&
      placement.clipStartSec >= asset.durationSec - 0.05
    )
      invalid("The B-roll source in-point is past the end of the clip.")
    if (placement.startSec >= duration - 0.1) {
      warnings.push(
        "A B-roll placement falls outside this edit/preview and was left out."
      )
      continue
    }
    const previous = visuals.at(-1)
    if (previous && placement.startSec < previous.endSec - 0.001)
      invalid(
        "B-roll placements overlap. Move the next clip after the previous one ends."
      )
    visuals.push({
      ...placement,
      endSec: Math.min(duration, placement.endSec),
      kind: asset.kind
    })
  }
  const events = [
    ...segments
      .slice(1)
      .map((shot) => ({ timeSec: shot.outputStartSec, type: "whoosh" })),
    ...visuals.flatMap((visual) => [
      { timeSec: visual.startSec, type: "whoosh" },
      { timeSec: visual.endSec, type: "click" }
    ])
  ]
  if (settings.graphics && settings.headline)
    events.push({ timeSec: 0.1, type: "impact" })
  const sfx =
    settings.sfx === "none"
      ? []
      : events
          .sort((a, b) => a.timeSec - b.timeSec)
          .filter(
            (event, index, array) =>
              event.timeSec < duration - 0.05 &&
              (!index || event.timeSec - array[index - 1].timeSec > 0.2)
          )
          .slice(0, 40)
  return {
    visuals,
    sfx,
    credits: [...new Set(visuals.map((item) => item.assetId))].map((id) => {
      const asset = assets.find((item) => item.id === id)
      return { title: asset.originalName, ...asset.source }
    })
  }
}
