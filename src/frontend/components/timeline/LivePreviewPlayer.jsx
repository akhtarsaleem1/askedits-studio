import React, { useEffect, useRef, useState, useMemo, forwardRef } from "react"

const STYLE_ALIASES = {
  bold_pop: "hormozi",
  subtitle_bar: "podcast",
  word_pop: "tiktok",
  kinetic: "tiktok"
}

const CAPTION_PRESETS = {
  tiktok: {
    fontFamily: "Arial, sans-serif",
    fontSize: 28,
    fontWeight: 800,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.58)",
    outlineColor: "#000000",
    outlineWidth: 2
  },
  hormozi: {
    fontFamily: "Impact, Arial Black, sans-serif",
    fontSize: 34,
    fontWeight: 900,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.62)",
    outlineColor: "#000000",
    outlineWidth: 3
  },
  cinematic: {
    fontFamily: "Georgia, serif",
    fontSize: 22,
    fontWeight: 600,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.3)",
    outlineColor: "#000000",
    outlineWidth: 1
  },
  documentary: {
    fontFamily: "Times New Roman, serif",
    fontSize: 21,
    fontWeight: 600,
    italic: true,
    textColor: "#fff2a8",
    backgroundColor: "rgba(0,0,0,0.55)",
    outlineColor: "#000000",
    outlineWidth: 1
  },
  podcast: {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: 20,
    fontWeight: 700,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.7)",
    outlineColor: "#000000",
    outlineWidth: 1
  },
  gaming: {
    fontFamily: "Verdana, sans-serif",
    fontSize: 30,
    fontWeight: 900,
    italic: false,
    textColor: "#ffe95c",
    backgroundColor: "rgba(0,0,0,0.45)",
    outlineColor: "#000000",
    outlineWidth: 3
  },
  news: {
    fontFamily: "Arial, sans-serif",
    fontSize: 22,
    fontWeight: 800,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(7,14,28,0.82)",
    outlineColor: "#000000",
    outlineWidth: 1
  },
  minimalist: {
    fontFamily: "Arial, sans-serif",
    fontSize: 18,
    fontWeight: 500,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.18)",
    outlineColor: "#000000",
    outlineWidth: 0
  }
}

function sanitizeFormatId(formatId = "original") {
  return String(formatId || "original").replace(/[^a-z0-9_-]/gi, "_")
}

function getBrollFileName(broll, exportFormat) {
  const query = String(broll?.suggestedQuery ?? broll?.keyword ?? "")
  if (query.startsWith("custom:")) {
    return query.slice("custom:".length)
  }
  return `broll_${broll.id}_${sanitizeFormatId(exportFormat)}.mp4`
}

function getBrollUrl(assetId, broll, exportFormat) {
  if (!assetId || !broll?.id) return null
  const fileName = getBrollFileName(broll, exportFormat)
  const cacheKey = encodeURIComponent(broll.updatedAt || broll.suggestedQuery || broll.id)
  return `/api/uploads/${assetId}/assets/broll:${encodeURIComponent(fileName)}?v=${cacheKey}`
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeStyleName(styleName) {
  const key = String(styleName || "tiktok")
  return STYLE_ALIASES[key] || key
}

function resolveCaptionStyles(caption, settings = {}) {
  const styleName = normalizeStyleName(caption?.style || settings.style || "tiktok")
  const preset = CAPTION_PRESETS[styleName] || CAPTION_PRESETS.tiktok
  const merged = { ...preset, ...settings, ...caption }
  const position = merged.position || "bottom"
  const vmargin = clampNumber(merged.vmargin, 20, 0, 240)
  const justifyContent = merged.align === "left" ? "flex-start" : merged.align === "right" ? "flex-end" : "center"

  const frameStyle = {
    left: 0,
    right: 0,
    display: "flex",
    justifyContent,
    paddingLeft: "24px",
    paddingRight: "24px"
  }

  if (position === "top") {
    frameStyle.top = `${vmargin}px`
  } else if (position === "middle") {
    frameStyle.top = "50%"
    frameStyle.transform = "translateY(-50%)"
  } else {
    frameStyle.bottom = `${vmargin}px`
  }

  const outlineWidth = clampNumber(merged.outlineWidth, preset.outlineWidth, 0, 8)
  const outlineColor = merged.outlineColor || preset.outlineColor
  const textShadow = outlineWidth > 0
    ? [
        `${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`,
        `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor}`,
        `${outlineWidth}px -${outlineWidth}px 0 ${outlineColor}`,
        `-${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`
      ].join(", ")
    : "none"

  return {
    frameStyle,
    textStyle: {
      fontFamily: merged.fontFamily || preset.fontFamily,
      fontSize: `${clampNumber(merged.fontSize, preset.fontSize, 10, 72)}px`,
      fontWeight: merged.bold === false ? 600 : (merged.fontWeight || preset.fontWeight),
      fontStyle: merged.italic ? "italic" : "normal",
      color: merged.textColor || preset.textColor,
      backgroundColor: merged.backgroundColor ?? preset.backgroundColor,
      textShadow,
      maxWidth: "86%",
      lineHeight: 1.12
    }
  }
}

export const LivePreviewPlayer = forwardRef(({ assetId, editPlan, silenceData, videoUrl, style = {} }, forwardedRef) => {
  const localVideoRef = useRef(null)
  const videoRef = forwardedRef || localVideoRef
  const brollRef = useRef(null)
  const [playheadSec, setPlayheadSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const cutOutIntervals = useMemo(() => {
    if (!silenceData?.intervals || !editPlan?.settings?.cuts) return []
    const settings = editPlan.settings.cuts
    const mode = settings.mode ?? "silence_only"
    const cuts = []

    if (mode === "silence_only" || mode === "smart_cuts" || mode === "ai_driven") {
      silenceData.intervals.forEach((interval) => {
        if (settings.removeDeadAir && interval.type === "dead-air") cuts.push(interval)
        else if (settings.removePauses && interval.type === "pause") cuts.push(interval)
        else if (!settings.keepMicroPauses && interval.type === "micro-pause") cuts.push(interval)
      })
    }

    cuts.sort((a, b) => a.startSec - b.startSec)
    const merged = []
    for (const interval of cuts) {
      if (!merged.length) merged.push({ ...interval })
      else {
        const last = merged[merged.length - 1]
        if (interval.startSec <= last.endSec + 0.1) last.endSec = Math.max(last.endSec, interval.endSec)
        else merged.push({ ...interval })
      }
    }
    return merged
  }, [silenceData, editPlan?.settings?.cuts])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return

    const onTimeUpdate = () => {
      let current = vid.currentTime
      const activeCut = cutOutIntervals.find((c) => current >= c.startSec && current < c.endSec)
      if (activeCut && !vid.seeking) {
        vid.currentTime = activeCut.endSec + 0.05
        current = vid.currentTime
      }
      setPlayheadSec(current)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onSeeking = () => setPlayheadSec(vid.currentTime)

    vid.addEventListener("timeupdate", onTimeUpdate)
    vid.addEventListener("play", onPlay)
    vid.addEventListener("pause", onPause)
    vid.addEventListener("seeking", onSeeking)

    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate)
      vid.removeEventListener("play", onPlay)
      vid.removeEventListener("pause", onPause)
      vid.removeEventListener("seeking", onSeeking)
    }
  }, [cutOutIntervals, videoRef])

  const activeCaption = editPlan?.timeline?.captions?.find((c) => playheadSec >= c.startSec && playheadSec <= c.endSec)
  const activeBroll = editPlan?.timeline?.broll?.find((b) => playheadSec >= b.startSec && playheadSec <= b.endSec)
  const captionSettings = editPlan?.settings?.captions || {}
  const captionsEnabled = captionSettings.enabled !== false
  const exportFormat = editPlan?.settings?.exportFormat || "original"
  const brollUrl = activeBroll ? getBrollUrl(assetId, activeBroll, exportFormat) : null
  const captionStyles = activeCaption ? resolveCaptionStyles(activeCaption, captionSettings) : null

  useEffect(() => {
    const brollVideo = brollRef.current
    if (!activeBroll || !brollVideo) return

    const desiredTime = Math.max(0, playheadSec - Number(activeBroll.startSec || 0))
    if (Number.isFinite(desiredTime) && Math.abs(brollVideo.currentTime - desiredTime) > 0.2) {
      brollVideo.currentTime = desiredTime
    }

    if (isPlaying) {
      brollVideo.play().catch(() => {})
    } else {
      brollVideo.pause()
    }
  }, [activeBroll?.id, activeBroll?.startSec, playheadSec, isPlaying, brollUrl])

  useEffect(() => {
    if (!activeBroll && brollRef.current && !brollRef.current.paused) {
      brollRef.current.pause()
    }
  }, [activeBroll])

  return (
    <div className="relative overflow-hidden bg-black flex items-center justify-center w-full h-full" style={style}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="absolute inset-0 w-full h-full object-contain z-10"
      />

      {activeBroll && (
        <div className="absolute inset-0 z-20 bg-black pointer-events-none flex items-center justify-center">
          {brollUrl && (
            <video
              key={brollUrl}
              ref={brollRef}
              src={brollUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          )}
          <div className="absolute top-4 right-4 bg-pink-600/80 text-white px-2 py-1 text-[10px] font-bold rounded">
            B-ROLL: {activeBroll.suggestedQuery}
          </div>
        </div>
      )}

      {captionsEnabled && activeCaption && captionStyles && (
        <div
          className="absolute z-30 pointer-events-none"
          style={captionStyles.frameStyle}
        >
          <div
            className="px-4 py-2 rounded-lg text-center shadow-lg break-words"
            style={captionStyles.textStyle}
          >
            {activeCaption.text}
          </div>
        </div>
      )}
    </div>
  )
})
