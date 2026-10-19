/**
 * Cut Engine — Removes silence, dead air, and creates smart pacing cuts based on settings and AI plan.
 */

export function generateCutFilters({ durationSec, silenceData, editPlan, settings, videoInputPad = "0:v", audioInputPad = "0:a" }) {
  if (!settings || settings.enabled === false) {
    return { filterGraph: "", outputPad: videoInputPad, audioPad: audioInputPad }
  }

  const mode = settings.mode ?? "silence_only"
  let segments = []

  // Collect intervals to CUT OUT (remove)
  let cutOutIntervals = []

  if (mode === "silence_only" || mode === "smart_cuts" || mode === "ai_driven") {
    // Process silence detection data
    if (silenceData && silenceData.intervals) {
      silenceData.intervals.forEach((interval) => {
        if (settings.removeDeadAir && interval.type === "dead-air") {
          cutOutIntervals.push(interval)
        } else if (settings.removePauses && interval.type === "pause") {
          cutOutIntervals.push(interval)
        } else if (!settings.keepMicroPauses && interval.type === "micro-pause") {
          cutOutIntervals.push(interval)
        }
      })
    }
  }

  if (mode === "smart_cuts" || mode === "ai_driven") {
    // Incorporate AI-driven cuts from editPlan
    if (editPlan && editPlan.timeline && editPlan.timeline.cuts) {
      editPlan.timeline.cuts.forEach((cut) => {
        // AI cut usually just defines a point in time where a cut should happen.
        // We'll treat jump cuts around pauses if the AI says so, but for now
        // we'll primarily rely on silence detection for the actual gaps.
      })
    }
  }

  // Merge overlapping cut-out intervals
  cutOutIntervals.sort((a, b) => a.startSec - b.startSec)
  const mergedCuts = []
  for (const interval of cutOutIntervals) {
    if (!mergedCuts.length) {
      mergedCuts.push({ ...interval })
    } else {
      const last = mergedCuts[mergedCuts.length - 1]
      if (interval.startSec <= last.endSec + 0.1) {
        last.endSec = Math.max(last.endSec, interval.endSec)
      } else {
        mergedCuts.push({ ...interval })
      }
    }
  }

  // Invert cuts to get "keep" segments
  let currentTime = 0
  for (const cut of mergedCuts) {
    if (cut.startSec > currentTime) {
      segments.push({ startSec: currentTime, endSec: cut.startSec })
    }
    currentTime = cut.endSec
  }
  if (currentTime < durationSec) {
    segments.push({ startSec: currentTime, endSec: durationSec })
  }

  // Filter out tiny segments
  segments = segments.filter(s => (s.endSec - s.startSec) > 0.1)

  if (segments.length <= 1) {
    return { filterGraph: "", outputPad: videoInputPad, audioPad: audioInputPad } // No cuts needed
  }

  // Generate FFmpeg trim/concat filter graph with split/asplit
  const vInput = videoInputPad.startsWith("[") ? videoInputPad : `[${videoInputPad}]`
  const aInput = audioInputPad.startsWith("[") ? audioInputPad : `[${audioInputPad}]`

  let filterChain = ""
  const vSplits = []
  const aSplits = []
  for (let i = 0; i < segments.length; i++) {
    vSplits.push(`v_split${i}`)
    aSplits.push(`a_split${i}`)
  }

  filterChain += `${vInput}split=${segments.length}${vSplits.map(p => `[${p}]`).join("")};`
  filterChain += `${aInput}asplit=${segments.length}${aSplits.map(p => `[${p}]`).join("")};`

  const segmentPads = []
  segments.forEach((seg, index) => {
    const vPad = `v_seg${index}`
    const aPad = `a_seg${index}`
    filterChain += `[v_split${index}]trim=start=${seg.startSec.toFixed(3)}:end=${seg.endSec.toFixed(3)},setpts=PTS-STARTPTS[${vPad}];`
    filterChain += `[a_split${index}]atrim=start=${seg.startSec.toFixed(3)}:end=${seg.endSec.toFixed(3)},asetpts=PTS-STARTPTS[${aPad}];`
    segmentPads.push(`[${vPad}][${aPad}]`)
  })

  filterChain += `${segmentPads.join("")}concat=n=${segments.length}:v=1:a=1[cut_v][cut_a]`

  return {
    filterGraph: filterChain,
    outputPad: "cut_v",
    audioPad: "cut_a",
    segmentsCount: segments.length
  }
}
