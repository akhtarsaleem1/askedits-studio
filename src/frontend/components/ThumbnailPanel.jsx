import React, { useState } from "react"

export default function ThumbnailPanel({ assetId }) {
  const [thumbnails, setThumbnails] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)

  const generate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/uploads/${assetId}/thumbnails/generate`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Generation failed")
      const data = await res.json()
      setThumbnails(data.thumbnails)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const loadExisting = async () => {
    try {
      const res = await fetch(`/api/uploads/${assetId}/thumbnails/ai`)
      const data = await res.json()
      if (data.thumbnails?.length) setThumbnails(data.thumbnails)
    } catch {}
  }

  React.useEffect(() => { if (assetId) loadExisting() }, [assetId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            🖼️ AI Thumbnail Generator
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-semibold uppercase tracking-wide">Click-worthy frames powered by AI</p>
        </div>
        <button
          onClick={generate}
          disabled={isGenerating}
          className="neu-btn-gradient px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : thumbnails ? "Regenerate ✦" : "Generate Thumbnails ✦"}
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      {isGenerating && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 neu-inset">
          <div className="h-6 w-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-xs font-bold text-gray-500">AI is scanning scenes and rendering thumbnails...</p>
        </div>
      )}

      {thumbnails && thumbnails.length > 0 && !isGenerating && (
        <div className="space-y-5">
          {thumbnails.map((thumb, i) => (
            <div key={thumb.id} className="neu-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300/40 dark:border-gray-800/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-gray-800 dark:text-white">Thumbnail {i + 1}</span>
                  <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    {thumb.style}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-gray-400">Time: {thumb.frameTimeSec?.toFixed(1)}s</span>
              </div>

              <div className="p-4 space-y-4">
                {/* AI title details */}
                <div className="rounded-xl neu-inset bg-transparent p-3.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">AI Hook Suggestion</p>
                  <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400">{thumb.titleText}</p>
                  {thumb.subtitleText && <p className="text-[10px] text-gray-500 font-semibold mt-1">{thumb.subtitleText}</p>}
                </div>

                {thumb.reason && (
                  <p className="text-[10px] text-gray-400 italic">💡 {thumb.reason}</p>
                )}

                {/* Thumbnail variants grid */}
                <div className="grid grid-cols-3 gap-2.5">
                  {Object.entries(thumb.variants).map(([variant, url]) => (
                    <div key={variant} className="group relative">
                      <img
                        src={url}
                        alt={`${variant} variant`}
                        className="w-full aspect-video rounded-lg object-cover shadow-inner transition duration-200 border border-transparent group-hover:border-blue-600"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150 bg-black/40 rounded-lg">
                        <a
                          href={url}
                          download={`thumbnail-${i}-${variant}.jpg`}
                          className="rounded-full bg-white text-blue-600 px-3 py-1.5 text-[9px] font-extrabold uppercase shadow-md hover:scale-105"
                        >
                          ↓ Download
                        </a>
                      </div>
                      <p className="mt-1 text-center text-[9px] font-extrabold text-gray-400 capitalize">{variant}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!thumbnails && !isGenerating && !error && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center neu-inset bg-transparent">
          <span className="text-3xl opacity-40">🖼️</span>
          <p className="text-xs font-bold text-gray-500 mt-2">Generate Click-Worthy Thumbnails</p>
          <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto leading-relaxed mt-1">AI selects the most engaging video frames and suggests overlay layouts.</p>
        </div>
      )}
    </div>
  )
}
