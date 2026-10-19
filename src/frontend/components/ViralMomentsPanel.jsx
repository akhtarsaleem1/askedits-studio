import React from "react"
import { StatTile } from "./ui/StatTile.jsx"

const MOMENT_COLORS = {
  hook: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-300/40",
  emotional_peak: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border-rose-300/40",
  engagement_peak: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border-orange-300/40",
  strong_statement: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-300/40",
  storytelling: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-violet-300/40",
  viral_clip: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/20 border-pink-300/40"
}

const PLATFORM_ICONS = {
  tiktok: "TK",
  youtube_shorts: "YT",
  instagram_reels: "IG"
}

function ViralBar({ score }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "from-pink-600 to-rose-400" : pct >= 60 ? "from-violet-600 to-indigo-400" : "from-gray-500 to-gray-400"
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 p-0.5 overflow-hidden rounded-full neu-inset bg-transparent">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-bold text-gray-700 dark:text-gray-300">{pct}%</span>
    </div>
  )
}

export function ViralMomentsPanel({ viralMoments }) {
  if (!viralMoments) return null
  const moments = viralMoments.moments ?? []
  const summary = viralMoments.summary ?? {}

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Total Moments" value={summary.totalMoments} accent="text-pink-600 dark:text-pink-400" />
        <StatTile label="Top Viral Clips" value={summary.topViralClips} accent="text-violet-600 dark:text-violet-400" />
        <StatTile label="Hooks Found" value={summary.hookCount} accent="text-amber-600 dark:text-amber-400" />
        <StatTile label="Peak Moments" value={summary.emotionalPeakCount} accent="text-rose-600 dark:text-rose-400" />
      </div>
      
      <div className="space-y-4">
        {moments.map((m) => {
          const cls = MOMENT_COLORS[m.type] ?? "text-gray-500 bg-gray-50 dark:bg-gray-800/40 border-gray-300"
          return (
            <div key={m.id} className="neu-card p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
                    {m.type.replace("_", " ")}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">{m.startSec?.toFixed(1)}s – {m.endSec?.toFixed(1)}s</span>
                </div>
                <div className="flex gap-1.5">
                  {(m.platform ?? []).map((p) => (
                    <span key={p} className="rounded-lg bg-gray-200 dark:bg-gray-800 border border-gray-300/40 px-2 py-0.5 text-[9px] font-bold text-gray-600 dark:text-gray-400 uppercase">
                      {PLATFORM_ICONS[p] ?? p}
                    </span>
                  ))}
                </div>
              </div>
              
              <div>
                <p className="font-bold text-sm text-gray-800 dark:text-white leading-snug">{m.title}</p>
                <p className="mt-1.5 text-xs italic text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">"{m.transcript}"</p>
              </div>

              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">Viral Script Potential</p>
                <ViralBar score={m.viralScore ?? 0} />
              </div>

              {m.suggestedCaption && (
                <div className="rounded-xl neu-inset bg-transparent p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-semibold">
                  💬 {m.suggestedCaption}
                </div>
              )}

              {m.reasoning && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">{m.reasoning}</p>
              )}
            </div>
          )
        })}
        {moments.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">No viral moments detected in this clip.</p>
        )}
      </div>
    </div>
  )
}
