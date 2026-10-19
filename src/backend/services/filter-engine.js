/**
 * Filter Engine — Generates FFmpeg color grading and visual effect filters.
 */

export function generateEffectFilters({ settings }) {
  if (!settings?.enabled) {
    return { filterGraph: "" }
  }

  const filters = []
  const preset = settings.preset ?? "none"
  const intensity = settings.intensity ?? 0.5

  // 1. Color Grading presets
  if (preset === "vibrant_pop") {
    // Increase saturation and slight contrast
    const sat = 1.0 + (1.0 * intensity)
    const cont = 1.0 + (0.2 * intensity)
    filters.push(`eq=saturation=${sat}:contrast=${cont}`)
  } else if (preset === "warm_golden") {
    // Increase red and green slightly, reduce blue
    const r = 1.0 + (0.15 * intensity)
    const g = 1.0 + (0.05 * intensity)
    const b = 1.0 - (0.1 * intensity)
    const sat = 1.0 + (0.2 * intensity)
    filters.push(`colorchannelmixer=rr=${r}:gg=${g}:bb=${b},eq=saturation=${sat}`)
  } else if (preset === "cool_teal") {
    // Increase blue and green, reduce red
    const r = 1.0 - (0.15 * intensity)
    const g = 1.0 + (0.1 * intensity)
    const b = 1.0 + (0.2 * intensity)
    filters.push(`colorchannelmixer=rr=${r}:gg=${g}:bb=${b}`)
  } else if (preset === "moody_dark") {
    // Decrease brightness, increase contrast, decrease saturation
    const bright = -0.1 * intensity
    const cont = 1.0 + (0.3 * intensity)
    const sat = 1.0 - (0.3 * intensity)
    filters.push(`eq=brightness=${bright}:contrast=${cont}:saturation=${sat}`)
  } else if (preset === "film_noir") {
    // Black and white with high contrast
    const cont = 1.0 + (0.5 * intensity)
    filters.push(`eq=saturation=0:contrast=${cont}`)
  } else if (preset === "sunset_glow") {
    const r = 1.0 + (0.2 * intensity)
    const g = 1.0 - (0.05 * intensity)
    const b = 1.0 - (0.2 * intensity)
    filters.push(`colorchannelmixer=rr=${r}:gg=${g}:bb=${b}`)
  }

  // 2. Sharpen
  if (settings.sharpen) {
    // Unsharp mask: luma_msize_x:luma_msize_y:luma_amount
    filters.push(`unsharp=5:5:0.8`)
  }

  // 3. Vignette
  if (settings.vignette) {
    // vignette=PI/4
    const vIntensity = Math.PI / (4 + (1 - intensity) * 4) // adjust angle based on intensity
    filters.push(`vignette=angle=${vIntensity}`)
  }

  return { filterGraph: filters.join(",") }
}
