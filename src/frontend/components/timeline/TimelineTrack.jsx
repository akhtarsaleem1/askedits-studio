import React from "react"

export function TimelineTrack({ 
  title, color, items, durationSec, zoom,
  getLabel, getTime, 
  onClick, onDoubleClick, onDragStart, onResizeStart,
  selectedItemId
}) {
  if (!items) return null

  const widthPx = durationSec * zoom

  return (
    <div className="flex h-14 items-center relative group" style={{ minWidth: `${widthPx + 112}px` }}>
      {/* Track Label Left Pane */}
      <div className="sticky left-0 z-20 w-28 h-full flex items-center px-3 bg-[#151922] border-r border-slate-800 shrink-0">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">{title}</span>
      </div>
      
      {/* Track Content Area */}
      <div 
        className="relative h-full bg-[#0f1219] border-b border-slate-800"
        style={{ width: `${widthPx}px` }}
      >
        {items.map((item, idx) => {
          const { start, duration } = getTime(item)
          const safeStart = Math.max(0, start)
          const safeEnd = Math.min(durationSec, start + duration)
          const safeDuration = safeEnd - safeStart
          
          if (safeDuration <= 0 && duration > 0) return null
          
          const leftPx = safeStart * zoom
          const widthClipPx = Math.max(8, safeDuration * zoom)
          const isSelected = selectedItemId === (item.id || idx)

          return (
            <div
              key={item.id || idx}
              className={`absolute top-2 bottom-2 rounded-md border overflow-hidden whitespace-nowrap text-[9px] flex items-center font-bold transition-shadow select-none ${
                isSelected 
                  ? "ring-2 ring-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_8px_20px_rgba(0,0,0,0.35)] z-30" 
                  : "z-10 hover:z-20 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)]"
              } ${color}`}
              style={{ left: `${leftPx}px`, width: `${widthClipPx}px` }}
              title={getLabel(item)}
              onClick={(e) => {
                e.stopPropagation()
                onClick && onClick(item)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onDoubleClick && onDoubleClick(item)
              }}
            >
              {/* Left resize handle */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-30"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onResizeStart && onResizeStart(item, "left", e)
                }}
              />
              
              {/* Drag area (main body) */}
              <div 
                className="flex-1 h-full flex items-center px-3 cursor-grab active:cursor-grabbing min-w-0"
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  e.preventDefault()
                  onDragStart && onDragStart(item, e)
                }}
              >
                <span className="truncate w-full block">{getLabel(item)}</span>
              </div>

              {/* Right resize handle */}
              <div 
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-30"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onResizeStart && onResizeStart(item, "right", e)
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
