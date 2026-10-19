import React from "react"
import { StatTile } from "./ui/StatTile.jsx"

const CLIP_BADGES = {
  viral: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/20 border-pink-200/50",
  high: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-violet-200/50",
  medium: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200/50",
  low: "text-gray-500 bg-gray-50 dark:bg-gray-800/40 border-gray-300"
}

function TimelineSection({ title, color, items, renderItem }) {
  if (!items?.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
        {title} <span className="ml-1 text-gray-400 font-bold">({items.length})</span>
      </p>
      <div className="space-y-2">
        {items.slice(0, 6).map((item, i) => renderItem(item, i))}
        {items.length > 6 && (
          <p className="text-[10px] font-bold text-gray-400 pl-2">+ {items.length - 6} more clips planned…</p>
        )}
      </div>
    </div>
  )
}

export function EditPlanPanel({ editPlan }) {
  if (!editPlan) return null
  const tl = editPlan.timeline ?? {}
  const summary = editPlan.summary ?? {}
  const clips = editPlan.shortFormClips ?? []

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="AI Cut Points" value={summary.totalCuts} accent="text-cyan-600 dark:text-cyan-400" />
        <StatTile label="Voice Captions" value={summary.totalCaptions} accent="text-violet-600 dark:text-violet-400" />
        <StatTile label="Smart Zooms" value={summary.totalZooms} accent="text-amber-600 dark:text-amber-400" />
        <StatTile label="B-Roll Overlay" value={summary.totalBroll} accent="text-pink-600 dark:text-pink-400" />
      </div>

      <div className="flex items-center justify-between text-[10px] font-bold p-3.5 neu-inset bg-transparent text-gray-500">
        <span>Complexity: <strong className="text-gray-800 dark:text-gray-200 uppercase">{summary.editingComplexity ?? "--"}</strong></span>
        <span>Edited: <strong className="text-gray-800 dark:text-gray-200">{summary.estimatedEditedDurationSec ? `${Math.round(summary.estimatedEditedDurationSec)}s` : "--"}</strong></span>
      </div>

      {/* Short-form clips */}
      {clips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pink-600 dark:text-pink-400">Short-Form Clips ({clips.length})</p>
          <div className="space-y-2">
            {clips.map((clip) => {
              const badgeCls = CLIP_BADGES[clip.estimatedEngagement] ?? CLIP_BADGES.medium
              return (
                <div key={clip.id} className="flex items-center justify-between p-3.5 neu-card">
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-bold text-xs text-gray-800 dark:text-white">{clip.title}</p>
                    <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-wide">
                      {clip.startSec?.toFixed(1)}s – {clip.endSec?.toFixed(1)}s · {clip.aspectRatio} · {clip.platform}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${badgeCls}`}>
                    {clip.estimatedEngagement}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cuts */}
      <TimelineSection title="Cuts" color="#0891b2" items={tl.cuts} renderItem={(c) => (
        <div key={c.id} className="flex items-center gap-2.5 p-2.5 neu-card text-[10px] font-semibold text-gray-600 dark:text-gray-400">
          <span className="font-bold text-cyan-600 dark:text-cyan-400 shrink-0 font-mono">{c.timeSec?.toFixed(1)}s</span>
          <span className="rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">{c.type?.replace("_","-")}</span>
          <span className="truncate flex-1">{c.reason}</span>
        </div>
      )} />

      {/* Captions */}
      <TimelineSection title="Captions" color="#4f46e5" items={tl.captions} renderItem={(c) => (
        <div key={c.id} className="p-3 neu-card text-[10px] font-semibold text-gray-600 dark:text-gray-400">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-violet-600 dark:text-violet-400 font-mono">{c.startSec?.toFixed(1)}s – {c.endSec?.toFixed(1)}s</span>
            <span className="rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">{c.style}</span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 italic line-clamp-1">"{c.text}"</p>
        </div>
      )} />

      {/* Music */}
      <TimelineSection title="Music" color="#d97706" items={tl.music} renderItem={(m) => (
        <div key={m.id} className="flex items-center justify-between p-2.5 neu-card text-[10px] font-semibold text-gray-600 dark:text-gray-400">
          <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0 font-mono">{m.startSec?.toFixed(0)}s – {m.endSec?.toFixed(0)}s</span>
          <span className="truncate text-right">{m.suggestedGenre} · {m.mood?.replace("_"," ")} · {m.volumePercent ?? 20}% Vol</span>
        </div>
      )} />

      {/* B-Roll */}
      <TimelineSection title="B-Roll Overlay" color="#db2777" items={tl.broll} renderItem={(b) => (
        <div key={b.id} className="p-3 neu-card text-[10px] font-semibold text-gray-600 dark:text-gray-400">
          <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">{b.startSec?.toFixed(1)}s – {b.endSec?.toFixed(1)}s</span>
          <span className="ml-2 font-bold text-gray-800 dark:text-white">"{b.suggestedQuery}"</span>
          {b.purpose && <p className="mt-1 text-[9px] font-medium text-gray-400">{b.purpose}</p>}
        </div>
      )} />
    </div>
  )
}
