import React from "react"

export function TimelineRuler({ durationSec, zoom, playheadSec, onSeek }) {
  const widthPx = durationSec * zoom
  const stepSec = zoom < 20 ? 10 : zoom < 50 ? 5 : 1
  const markers = []
  
  for (let t = 0; t <= durationSec; t += stepSec) {
    markers.push(t)
  }

  const handleRulerClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const targetSec = Math.max(0, Math.min(durationSec, clickX / zoom))
    onSeek(targetSec)
  }

  return (
    <div 
      className="relative h-8 border-b border-slate-800 bg-[#151922] cursor-crosshair hover:bg-[#1a1f2b]"
      style={{ width: `${widthPx}px` }}
      onClick={handleRulerClick}
    >
      {/* Markers */}
      {markers.map((t) => (
        <div 
          key={t} 
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${t * zoom}px`, transform: 'translateX(-50%)' }}
        >
          <div className="h-2.5 w-px bg-slate-600"></div>
          <span className="text-[9px] text-slate-400 font-mono mt-1 font-bold">{t}s</span>
        </div>
      ))}
      
      {/* Playhead */}
      <div 
        className="absolute top-0 bottom-0 z-50 pointer-events-none"
        style={{ left: `${playheadSec * zoom}px` }}
      >
        <div className="absolute top-0 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-red-500"></div>
        <div className="absolute top-2 bottom-[-1000px] w-[2px] -translate-x-1/2 bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.7)]"></div>
      </div>
    </div>
  )
}
