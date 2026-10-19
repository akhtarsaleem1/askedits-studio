/**
 * Zoom Engine - Generates aspect-safe FFmpeg zoom filters for dynamic camera motion.
 */

function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function sanitizeZoomWindows(durationSec, editPlan, settings) {
  const duration = Math.max(0, Number(durationSec) || 0)
  const planned = Array.isArray(editPlan?.timeline?.zooms) ? editPlan.timeline.zooms : []
  const maxWindows = settings?.maxWindows ?? 8

  const windows = planned
    .map((zoom, index) => {
      const startSec = clampNumber(zoom.startSec, 0, duration, 0)
      const requestedEnd = Number(zoom.endSec)
      const endSec = Number.isFinite(requestedEnd)
        ? clampNumber(requestedEnd, startSec + 0.35, duration, Math.min(duration, startSec + 2.5))
        : Math.min(duration, startSec + 2.5)
      const zoomLevel = clampNumber(zoom.zoomLevel, 1.05, 1.45, settings?.mode === "slow_push" ? 1.16 : 1.22)

      return {
        id: zoom.id ?? `zoom-${index}`,
        startSec,
        endSec,
        zoomLevel
      }
    })
    .filter((zoom) => zoom.endSec - zoom.startSec >= 0.35)
    .sort((a, b) => a.startSec - b.startSec)
    .slice(0, maxWindows)

  if (windows.length > 0) return windows

  const hookDuration = Math.min(duration || 3, settings?.mode === "slow_push" ? 4 : 2.8)
  if (hookDuration <= 0.35) return []

  return [{
    id: "hook-zoom",
    startSec: 0,
    endSec: hookDuration,
    zoomLevel: settings?.mode === "slow_push" ? 1.14 : 1.2
  }]
}

function getFocus(faceData, settings) {
  const focus = { x: 0.5, y: 0.5 }

  if (!settings?.trackFaces || !faceData?.sceneSummaries?.length) {
    return focus
  }

  const dominantFace = faceData.sceneSummaries.find((scene) => scene.hasFace)?.dominantPosition
  if (!dominantFace) return focus

  if (dominantFace.horizontal === "left") focus.x = 0.35
  if (dominantFace.horizontal === "right") focus.x = 0.65
  if (dominantFace.vertical === "top") focus.y = 0.38
  if (dominantFace.vertical === "bottom") focus.y = 0.62

  return focus
}

function buildZoomExpression(windows, fps) {
  const timeExpr = `(on/${Number(fps).toFixed(3)})`
  const terms = windows.map((zoom) => {
    const start = zoom.startSec.toFixed(3)
    const end = zoom.endSec.toFixed(3)
    const duration = Math.max(0.35, zoom.endSec - zoom.startSec)
    const durationText = duration.toFixed(3)
    const amount = (zoom.zoomLevel - 1).toFixed(4)

    return `if(between(${timeExpr},${start},${end}),${amount}*sin(PI*(${timeExpr}-${start})/${durationText}),0)`
  })

  if (terms.length === 0) return "1"

  return `min(1.45,1+${terms.join("+")})`
}

export function generateZoomFilter({ durationSec, videoMeta, faceData, editPlan, settings }) {
  if (!settings?.enabled || settings?.mode === "none") {
    return { filterGraph: "" }
  }

  const width = Math.max(2, Math.round(Number(videoMeta?.width) || 0))
  const height = Math.max(2, Math.round(Number(videoMeta?.height) || 0))
  if (!width || !height) {
    return { filterGraph: "" }
  }

  const fps = clampNumber(videoMeta?.frameRate, 1, 120, 30)
  const windows = sanitizeZoomWindows(durationSec, editPlan, settings)
  if (windows.length === 0) {
    return { filterGraph: "" }
  }

  const focus = getFocus(faceData, settings)
  const zoomExpr = buildZoomExpression(windows, fps)
  const xExpr = `max(0,min(iw-iw/zoom,${focus.x.toFixed(2)}*iw-(iw/zoom/2)))`
  const yExpr = `max(0,min(ih-ih/zoom,${focus.y.toFixed(2)}*ih-(ih/zoom/2)))`

  return {
    filterGraph: `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${width}x${height}:fps=${fps},setsar=1`
  }
}
