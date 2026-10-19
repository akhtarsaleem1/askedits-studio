import React, { useState } from "react"

export function TimelineToolbar({ 
  assetId, onRegenerated, onSave, isSaving,
  zoom, onZoomIn, onZoomOut,
  isPlaying, onTogglePlay,
  playheadSec, durationSec
}) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [activeAction, setActiveAction] = useState(null)

  const handleRegenerate = async (mode) => {
    setIsRegenerating(true)
    setActiveAction(mode)
    try {
      const res = await fetch(`/api/uploads/${assetId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      })
      if (!res.ok) throw new Error("Regeneration failed")
      const updatedPlan = await res.json()
      onRegenerated(updatedPlan)
    } catch (err) {
      console.error(err)
      alert("Failed to regenerate: " + err.message)
    } finally {
      setIsRegenerating(false)
      setActiveAction(null)
    }
  }

  const formatTime = (sec) => {
    const s = Math.floor(sec ?? 0)
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${m}:${String(ss).padStart(2, "0")}`
  }

  const buttons = [
    { mode: "captions", icon: "📝", label: "Captions" },
    { mode: "broll", icon: "🎬", label: "B-Roll" },
    { mode: "cinematic", icon: "✨", label: "Cinematic" },
    { mode: "faster", icon: "⚡", label: "Faster" },
    { mode: "tiktok", icon: "📱", label: "TikTok" }
  ]

  return (
    <div className="flex flex-wrap gap-3 items-center justify-between p-3 bg-[#151922] border-b border-slate-800">
      
      {/* Left: Playback + Timecode */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:shadow-lg active:scale-95 transition-all shrink-0"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Timecode display */}
        <div className="px-3 py-1.5 rounded-md font-mono text-[11px] font-bold text-slate-200 tracking-wider min-w-[90px] text-center bg-[#0c0e13] border border-slate-700">
          {formatTime(playheadSec)} / {formatTime(durationSec)}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onZoomOut}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-white bg-[#202635] border border-slate-700 transition-colors font-bold text-sm"
            title="Zoom Out"
          >
            −
          </button>
          <span className="text-[10px] font-bold text-slate-500 w-10 text-center">{Math.round(zoom)}px/s</span>
          <button
            onClick={onZoomIn}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-white bg-[#202635] border border-slate-700 transition-colors font-bold text-sm"
            title="Zoom In"
          >
            +
          </button>
        </div>
      </div>

      {/* Middle: AI Re-scripters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">AI:</span>
        {buttons.map(btn => (
          <button
            key={btn.mode}
            disabled={isRegenerating}
            onClick={() => handleRegenerate(btn.mode)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-200 ${
              isRegenerating && activeAction === btn.mode 
                ? "bg-blue-600 text-white animate-pulse" 
                : "bg-[#202635] border border-slate-700 text-slate-200 hover:bg-[#293145] disabled:opacity-50"
            }`}
          >
            <span>{btn.icon}</span>
            <span className="hidden sm:inline">{isRegenerating && activeAction === btn.mode ? "..." : btn.label}</span>
          </button>
        ))}
      </div>
      
      {/* Right: Save Status */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isSaving ? 'text-blue-400 animate-pulse' : 'text-emerald-500'}`}>
          {isSaving ? "Saving…" : "Saved ✓"}
        </span>
      </div>
    </div>
  )
}
