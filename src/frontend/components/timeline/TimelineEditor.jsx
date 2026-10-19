import React, { useState, useEffect, useRef, useCallback } from "react"
import { TimelineRuler } from "./TimelineRuler.jsx"
import { TimelineTrack } from "./TimelineTrack.jsx"
import { CaptionEditModal } from "./CaptionEditModal.jsx"
import { BrollEditModal } from "./BrollEditModal.jsx"
import { TimelineToolbar } from "./TimelineToolbar.jsx"
import { Bold, Italic, Type } from "lucide-react"

const CAPTION_STYLES = [
  { value: "tiktok", label: "TikTok" },
  { value: "hormozi", label: "Hormozi" },
  { value: "cinematic", label: "Cinematic" },
  { value: "documentary", label: "Documentary" },
  { value: "podcast", label: "Podcast" },
  { value: "gaming", label: "Gaming" },
  { value: "news", label: "News" },
  { value: "minimalist", label: "Minimal" },
  { value: "bold_pop", label: "Bold Pop" },
  { value: "subtitle_bar", label: "Subtitle" },
  { value: "word_pop", label: "Word Pop" },
  { value: "kinetic", label: "Kinetic" }
]
const CAPTION_FONTS = ["Arial", "Impact", "Helvetica", "Georgia", "Times New Roman", "Verdana"]
const CAPTION_POSITIONS = ["bottom", "middle", "top"]

function getCaptionDefaults(settings = {}) {
  return {
    enabled: true,
    style: "tiktok",
    position: "bottom",
    vmargin: 20,
    fontFamily: "Arial",
    fontSize: 28,
    bold: true,
    italic: false,
    textColor: "#ffffff",
    backgroundColor: "#000000",
    outlineColor: "#000000",
    outlineWidth: 2,
    ...settings
  }
}

export function TimelineEditor({ assetId, initialEditPlan, videoRef, renderSettings, onEditPlanChange }) {
  const [editPlan, setEditPlan] = useState(initialEditPlan)
  const [isSaving, setIsSaving] = useState(false)
  const [dirtyRevision, setDirtyRevision] = useState(0)
  
  // Modal state
  const [editingCaption, setEditingCaption] = useState(null)
  const [editingBroll, setEditingBroll] = useState(null)

  // Interactive timeline state
  const [zoom, setZoom] = useState(12) // pixels per second
  const [playheadSec, setPlayheadSec] = useState(0)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Drag/resize refs (avoid re-renders during mouse movement)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const pendingNotifyRef = useRef(null)

  // Keep state synced if initialEditPlan changes
  useEffect(() => {
    if (initialEditPlan && initialEditPlan !== editPlan) {
      setEditPlan(initialEditPlan)
      setDirtyRevision(0)
      pendingNotifyRef.current = null
    }
  }, [initialEditPlan])

  const updateEditPlan = useCallback((updater) => {
    setEditPlan(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      pendingNotifyRef.current = next
      return next
    })
    setDirtyRevision(prev => prev + 1)
  }, [])

  useEffect(() => {
    if (!pendingNotifyRef.current) return
    onEditPlanChange?.(pendingNotifyRef.current)
    pendingNotifyRef.current = null
  }, [dirtyRevision, onEditPlanChange])

  // Sync playhead with video element
  useEffect(() => {
    const vid = videoRef?.current
    if (!vid) return

    const onTimeUpdate = () => setPlayheadSec(vid.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    vid.addEventListener("timeupdate", onTimeUpdate)
    vid.addEventListener("play", onPlay)
    vid.addEventListener("pause", onPause)

    // Sync initial state
    setPlayheadSec(vid.currentTime)
    setIsPlaying(!vid.paused)

    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate)
      vid.removeEventListener("play", onPlay)
      vid.removeEventListener("pause", onPause)
    }
  }, [videoRef])

  // Seek the video
  const seekVideo = useCallback((timeSec) => {
    const vid = videoRef?.current
    if (vid) {
      vid.currentTime = timeSec
      setPlayheadSec(timeSec)
    }
  }, [videoRef])

  // Handle ruler click-to-seek
  const handleRulerSeek = useCallback((timeSec) => {
    seekVideo(timeSec)
  }, [seekVideo])

  // --- Drag Logic ---
  const handleDragStart = useCallback((trackKey, getTime, setTime) => (item, e) => {
    const startX = e.clientX
    const { start } = getTime(item)
    dragRef.current = { item, trackKey, startX, originalStart: start, latestStart: start, getTime, setTime }
    setSelectedItemId(item.id || null)
    if (trackKey === "captions" || trackKey === "broll") seekVideo(start)
  }, [seekVideo])

  // --- Resize Logic ---
  const handleResizeStart = useCallback((trackKey, getTime, setTime) => (item, side, e) => {
    const startX = e.clientX
    const { start, duration } = getTime(item)
    resizeRef.current = { item, trackKey, side, startX, originalStart: start, originalDuration: duration, latestStart: start, getTime, setTime }
    setSelectedItemId(item.id || null)
    if (trackKey === "captions" || trackKey === "broll") seekVideo(start)
  }, [seekVideo])

  // Global mouse handlers for drag/resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (dragRef.current) {
        const { startX, originalStart, item } = dragRef.current
        const dx = e.clientX - startX
        const dtSec = dx / zoom
        const newStart = Math.max(0, originalStart + dtSec)
        dragRef.current.latestStart = newStart

        updateEditPlan(prev => {
          if (!prev?.timeline) return prev
          const copy = JSON.parse(JSON.stringify(prev))
          dragRef.current.setTime(copy, item, newStart)
          return copy
        })
      }

      if (resizeRef.current) {
        const { side, startX, originalStart, originalDuration, item } = resizeRef.current
        const dx = e.clientX - startX
        const dtSec = dx / zoom

        updateEditPlan(prev => {
          if (!prev?.timeline) return prev
          const copy = JSON.parse(JSON.stringify(prev))
          if (side === "left") {
            const newStart = Math.max(0, originalStart + dtSec)
            const newDuration = Math.max(0.1, originalDuration - (newStart - originalStart))
            resizeRef.current.latestStart = newStart
            resizeRef.current.setTime(copy, item, newStart, newDuration)
          } else {
            const newDuration = Math.max(0.1, originalDuration + dtSec)
            resizeRef.current.latestStart = originalStart
            resizeRef.current.setTime(copy, item, originalStart, newDuration)
          }
          return copy
        })
      }
    }

    const handleMouseUp = () => {
      const previewStart = dragRef.current?.latestStart ?? resizeRef.current?.latestStart
      const previewTrack = dragRef.current?.trackKey ?? resizeRef.current?.trackKey
      if ((previewTrack === "captions" || previewTrack === "broll") && previewStart !== undefined) {
        seekVideo(previewStart)
      }
      dragRef.current = null
      resizeRef.current = null
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [zoom, updateEditPlan, seekVideo])

  if (!editPlan || !editPlan.timeline) return null

  const timeline = editPlan.timeline
  const durationSec = editPlan.videoDurationSec || 60
  const captionSettings = getCaptionDefaults(editPlan.settings?.captions)
  const selectedCaption = timeline.captions?.find(c => c.id === selectedItemId) || null

  const updateCaptionStyle = (patch) => {
    updateEditPlan(prev => {
      if (!prev?.timeline) return prev
      const copy = JSON.parse(JSON.stringify(prev))
      copy.settings = copy.settings || {}
      copy.settings.captions = getCaptionDefaults(copy.settings.captions)

      if (selectedCaption) {
        copy.timeline.captions = (copy.timeline.captions ?? []).map(c => (
          c.id === selectedCaption.id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
        ))
      } else {
        copy.settings.captions = { ...copy.settings.captions, ...patch }
        copy.timeline.captions = (copy.timeline.captions ?? []).map(c => ({
          ...c,
          ...patch,
          updatedAt: new Date().toISOString()
        }))
      }
      return copy
    })
  }

  // --- Track Configuration ---
  const trackConfigs = [
    {
      key: "cuts",
      title: "Cuts",
      color: "border-sky-400/60 bg-sky-500/25 text-sky-100",
      items: timeline.cuts ?? [],
      getLabel: (c) => c.type,
      getTime: (c) => ({ start: c.timeSec, duration: 0.5 }),
      setTime: (plan, item, newStart) => {
        const found = plan.timeline.cuts.find(c => c.id === item.id)
        if (found) found.timeSec = newStart
      }
    },
    {
      key: "broll",
      title: "B-Roll",
      color: "border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-100",
      items: timeline.broll ?? [],
      getLabel: (b) => b.suggestedQuery,
      getTime: (b) => ({ start: b.startSec, duration: b.endSec - b.startSec }),
      setTime: (plan, item, newStart, newDuration) => {
        const found = plan.timeline.broll.find(b => b.id === item.id)
        if (found) {
          const dur = newDuration ?? (found.endSec - found.startSec)
          found.startSec = newStart
          found.endSec = newStart + dur
        }
      },
      onClick: (b) => {
        setSelectedItemId(b.id || null)
        seekVideo(b.startSec || 0)
      },
      onDoubleClick: (b) => setEditingBroll(b)
    },
    {
      key: "captions",
      title: "Captions",
      color: "border-violet-400/60 bg-violet-500/25 text-violet-100",
      items: timeline.captions ?? [],
      getLabel: (c) => `"${c.text}"`,
      getTime: (c) => ({ start: c.startSec, duration: c.endSec - c.startSec }),
      setTime: (plan, item, newStart, newDuration) => {
        const found = plan.timeline.captions.find(c => c.id === item.id)
        if (found) {
          const dur = newDuration ?? (found.endSec - found.startSec)
          found.startSec = newStart
          found.endSec = newStart + dur
        }
      },
      onClick: (c) => {
        setSelectedItemId(c.id || null)
        seekVideo(c.startSec || 0)
      },
      onDoubleClick: (c) => setEditingCaption(c)
    },
    {
      key: "zooms",
      title: "Zooms",
      color: "border-amber-400/70 bg-amber-500/25 text-amber-100",
      items: timeline.zooms ?? [],
      getLabel: (z) => z.reason || z.target || `${z.zoomLevel ?? 1.2}x zoom`,
      getTime: (z) => ({ start: z.startSec, duration: z.endSec - z.startSec }),
      setTime: (plan, item, newStart, newDuration) => {
        const found = plan.timeline.zooms.find(z => z.id === item.id)
        if (found) {
          const dur = newDuration ?? (found.endSec - found.startSec)
          found.startSec = newStart
          found.endSec = newStart + dur
        }
      }
    },
    {
      key: "sfx",
      title: "SFX",
      color: "border-emerald-400/60 bg-emerald-500/25 text-emerald-100",
      items: timeline.sfx ?? [],
      getLabel: (s) => s.suggestedQuery,
      getTime: (s) => ({ start: s.timeSec, duration: 1.0 }),
      setTime: (plan, item, newStart) => {
        const found = plan.timeline.sfx.find(s => s.id === item.id)
        if (found) found.timeSec = newStart
      }
    }
  ]

  const handleSaveEditPlan = useCallback(async (planToSave) => {
    setIsSaving(true)
    try {
      await fetch(`/api/uploads/${assetId}/edit-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planToSave)
      })
      // We no longer trigger a full FFmpeg render here! The user will click "Export" to render.
    } catch (err) {
      console.error("Failed to auto-save edit plan", err)
    } finally {
      setIsSaving(false)
    }
  }, [assetId])

  // Debounced auto-save effect
  useEffect(() => {
    if (!editPlan || dirtyRevision === 0) return
    const timer = setTimeout(() => {
      handleSaveEditPlan(editPlan)
    }, 1000)
    return () => clearTimeout(timer)
  }, [editPlan, dirtyRevision, handleSaveEditPlan])

  // Handle updates from modals
  const updateCaption = (updatedCaption) => {
    updateEditPlan(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        captions: prev.timeline.captions.map(c => c.id === updatedCaption.id ? { ...updatedCaption, updatedAt: updatedCaption.updatedAt || new Date().toISOString() } : c)
      }
    }))
  }

  const deleteCaption = (captionId) => {
    updateEditPlan(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        captions: prev.timeline.captions.filter(c => c.id !== captionId)
      }
    }))
  }

  const updateBroll = (updatedBroll) => {
    updateEditPlan(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        broll: prev.timeline.broll.map(b => b.id === updatedBroll.id ? { ...updatedBroll, updatedAt: updatedBroll.updatedAt || new Date().toISOString() } : b)
      }
    }))
  }

  const deleteBroll = (brollId) => {
    updateEditPlan(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        broll: prev.timeline.broll.filter(b => b.id !== brollId)
      }
    }))
  }

  // Toggle playback
  const togglePlayback = () => {
    const vid = videoRef?.current
    if (!vid) return
    if (vid.paused) vid.play()
    else vid.pause()
  }

  return (
    <div className="flex flex-col rounded-lg overflow-hidden bg-[#111318] border border-slate-800 shadow-2xl transition-all duration-300">
      <TimelineToolbar 
        assetId={assetId} 
        onRegenerated={(newPlan) => {
          setEditPlan(newPlan)
          setDirtyRevision(0)
          onEditPlanChange?.(newPlan)
        }} 
        isSaving={isSaving}
        zoom={zoom}
        onZoomIn={() => setZoom(prev => Math.min(120, prev * 1.4))}
        onZoomOut={() => setZoom(prev => Math.max(4, prev / 1.4))}
        isPlaying={isPlaying}
        onTogglePlay={togglePlayback}
        playheadSec={playheadSec}
        durationSec={durationSec}
      />

      <CaptionStylePanel
        settings={captionSettings}
        selectedCaption={selectedCaption}
        onPatch={updateCaptionStyle}
        onEditSelected={() => selectedCaption && setEditingCaption(selectedCaption)}
        onClearSelection={() => setSelectedItemId(null)}
      />
      
      <div 
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden bg-[#0c0e13] border-t border-slate-800"
      >
        <div className="relative" style={{ minWidth: `${durationSec * zoom + 112}px` }}>
          {/* Ruler with left padding for track labels */}
          <div style={{ paddingLeft: "112px" }}>
            <TimelineRuler 
              durationSec={durationSec} 
              zoom={zoom}
              playheadSec={playheadSec}
              onSeek={handleRulerSeek}
            />
          </div>
          
          <div className="flex flex-col relative">
            {trackConfigs.map(track => (
              <TimelineTrack 
                key={track.key}
                title={track.title} 
                color={track.color}
                items={track.items} 
                durationSec={durationSec}
                zoom={zoom}
                getLabel={track.getLabel}
                getTime={track.getTime}
                onClick={track.onClick || ((item) => setSelectedItemId(item.id || null))}
                onDoubleClick={track.onDoubleClick}
                onDragStart={handleDragStart(track.key, track.getTime, track.setTime)}
                onResizeStart={handleResizeStart(track.key, track.getTime, track.setTime)}
                selectedItemId={selectedItemId}
              />
            ))}
          </div>
        </div>
      </div>

      {editingCaption && (
        <CaptionEditModal 
          caption={editingCaption}
          onClose={() => setEditingCaption(null)}
          onSave={(c) => { updateCaption(c); setEditingCaption(null) }}
          onDelete={() => { deleteCaption(editingCaption.id); setEditingCaption(null) }}
        />
      )}

      {editingBroll && (
        <BrollEditModal 
          assetId={assetId}
          broll={editingBroll}
          exportFormat={renderSettings?.exportFormat || editPlan.settings?.exportFormat || "original"}
          onClose={() => setEditingBroll(null)}
          onSave={(b) => { updateBroll(b); setEditingBroll(null) }}
          onDelete={() => { deleteBroll(editingBroll.id); setEditingBroll(null) }}
        />
      )}
    </div>
  )
}

function CaptionStylePanel({ settings, selectedCaption, onPatch, onEditSelected, onClearSelection }) {
  const active = getCaptionDefaults(selectedCaption ? { ...settings, ...selectedCaption } : settings)
  const scopeLabel = selectedCaption ? `Selected: ${selectedCaption.text || selectedCaption.id}` : "All captions"

  return (
    <div className="border-b border-slate-800 bg-[#111722] px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[130px] items-center gap-2 text-slate-200">
          <Type size={15} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Captions</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">{scopeLabel}</p>
          </div>
        </div>

        <select
          value={active.style}
          onChange={(e) => onPatch({ style: e.target.value })}
          className="h-9 min-w-[120px] rounded-md border border-slate-700 bg-[#0c0e13] px-2 text-[11px] font-bold text-slate-100 outline-none focus:border-violet-500"
        >
          {CAPTION_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
        </select>

        <select
          value={active.fontFamily}
          onChange={(e) => onPatch({ fontFamily: e.target.value })}
          className="h-9 min-w-[120px] rounded-md border border-slate-700 bg-[#0c0e13] px-2 text-[11px] font-bold text-slate-100 outline-none focus:border-violet-500"
        >
          {CAPTION_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>

        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-[#0c0e13] p-1">
          <button
            onClick={() => onPatch({ bold: !active.bold })}
            title="Bold"
            aria-label="Bold"
            className={`h-7 w-7 rounded flex items-center justify-center ${active.bold ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => onPatch({ italic: !active.italic })}
            title="Italic"
            aria-label="Italic"
            className={`h-7 w-7 rounded flex items-center justify-center ${active.italic ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Italic size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-[#0c0e13] p-1">
          {CAPTION_POSITIONS.map((position) => (
            <button
              key={position}
              onClick={() => onPatch({ position })}
              className={`h-7 px-2 rounded text-[10px] font-bold uppercase ${active.position === position ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {position}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Size
          <input
            type="number"
            min="10"
            max="72"
            value={active.fontSize}
            onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
            className="h-9 w-16 rounded-md border border-slate-700 bg-[#0c0e13] px-2 text-[11px] text-slate-100 outline-none focus:border-violet-500"
          />
        </label>

        <label className="flex min-w-[130px] items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Offset
          <input
            type="range"
            min="0"
            max="180"
            value={active.vmargin}
            onChange={(e) => onPatch({ vmargin: Number(e.target.value) })}
            className="w-24 accent-violet-500"
          />
        </label>

        <ColorSwatch label="Text" value={active.textColor} onChange={(textColor) => onPatch({ textColor })} />
        <ColorSwatch label="Bg" value={active.backgroundColor} onChange={(backgroundColor) => onPatch({ backgroundColor })} />

        <div className="ml-auto flex items-center gap-2">
          {selectedCaption && (
            <>
              <button
                onClick={onEditSelected}
                className="h-9 rounded-md border border-slate-700 bg-[#202635] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 hover:bg-[#293145]"
              >
                Edit Text
              </button>
              <button
                onClick={onClearSelection}
                className="h-9 rounded-md border border-slate-700 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-100"
              >
                All
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ColorSwatch({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
      {label}
      <input
        type="color"
        value={value || "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded-md border border-slate-700 bg-[#0c0e13] p-1"
      />
    </label>
  )
}
