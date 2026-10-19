import React from "react"
import { StatTile } from "./ui/StatTile.jsx"

const STYLE_COLORS = {
  podcast: "#22d3ee", documentary: "#a78bfa", motivational: "#f472b6",
  cinematic: "#fbbf24", tutorial: "#34d399", gaming: "#f87171",
  vlog: "#60a5fa", tiktok_fast: "#fb923c"
}

function StyleBar({ style, score }) {
  const color = STYLE_COLORS[style] ?? "#64748b"
  const pct = Math.round(score * 100)
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{style.replace("_", " ")}</span>
      <div className="flex-1 overflow-hidden rounded-full h-2.5 neu-inset bg-transparent p-0.5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-xs font-bold text-gray-700 dark:text-gray-300">{pct}%</span>
    </div>
  )
}

export function StyleAnalysisPanel({ styleAnalysis }) {
  if (!styleAnalysis) return null
  const recs = styleAnalysis.editingRecommendations ?? {}
  const chars = styleAnalysis.characteristics ?? {}
  const allStyles = styleAnalysis.allStyles ?? {}

  const primaryColor = STYLE_COLORS[styleAnalysis.primaryStyle] ?? "#64748b"

  return (
    <div className="space-y-6">
      {/* Primary Style Info Header */}
      <div className="neu-card p-5 border-l-4" style={{ borderLeftColor: primaryColor }}>
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Primary Edit Style</p>
        <p className="mt-1 text-xl font-extrabold capitalize text-gray-800 dark:text-white">
          {styleAnalysis.primaryStyle?.replace("_", " ")}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-gray-500">
          {Math.round((styleAnalysis.primaryConfidence ?? 0) * 100)}% Match Confidence
          {styleAnalysis.secondaryStyle && ` · Secondary: ${styleAnalysis.secondaryStyle.replace("_", " ")}`}
        </p>
        {styleAnalysis.styleReasoning && (
          <p className="mt-3.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400 font-medium">{styleAnalysis.styleReasoning}</p>
        )}
      </div>

      {/* Style Breakdown List */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Pacing & Accent Breakdown</p>
        <div className="space-y-3 neu-card p-4">
          {Object.entries(allStyles)
            .sort(([, a], [, b]) => b - a)
            .map(([style, score]) => (
              <StyleBar key={style} style={style} score={score} />
            ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Speech Pace" value={chars.paceCategory?.replace("_", " ")} />
        <StatTile label="Words Per Min" value={chars.averageWordsPerMinute} />
        <StatTile label="Est Speakers" value={chars.estimatedSpeakerCount} />
      </div>

      {/* Recommendations Checklist */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Editing Directives</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Cut Pacing", recs.cutPace],
            ["Transitions", recs.transitionStyle?.replace("_", " ")],
            ["Captions Style", recs.captionStyle?.replace("_", " ")],
            ["Background Music", recs.musicMood?.replace("_", " ")],
            ["Auto Zoom", recs.zoomUsage],
            ["B-Roll Frequency", recs.brollFrequency]
          ].map(([label, val]) => (
            <div key={label} className="neu-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
              <p className="mt-1 text-xs font-extrabold capitalize text-gray-800 dark:text-gray-100">{val ?? "--"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
