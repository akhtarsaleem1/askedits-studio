import React, { useState, useRef } from "react"

export function BrollEditModal({ assetId, broll, exportFormat = "original", onClose, onSave, onDelete }) {
  const [query, setQuery] = useState(broll.suggestedQuery || "")
  const [startSec, setStartSec] = useState(broll.startSec || 0)
  const [endSec, setEndSec] = useState(broll.endSec || 0)
  
  const [isReplacing, setIsReplacing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [replaceError, setReplaceError] = useState(null)
  const fileInputRef = useRef(null)

  const handleSave = () => {
    onSave({
      ...broll,
      suggestedQuery: query,
      startSec: Number(startSec),
      endSec: Number(endSec),
      updatedAt: new Date().toISOString()
    })
  }

  const handleSearchReplace = async () => {
    if (!query) return
    setIsReplacing(true)
    setReplaceError(null)
    try {
      const res = await fetch(`/api/uploads/${assetId}/broll/${broll.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, exportFormat })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to replace B-roll")
      }
      const updatedBroll = await res.json()
      onSave(updatedBroll)
    } catch (err) {
      setReplaceError(err.message)
    } finally {
      setIsReplacing(false)
    }
  }

  const handleGenerateAi = async () => {
    if (!query) return
    setIsGenerating(true)
    setReplaceError(null)
    try {
      const durationSec = Math.max(1, Number(endSec) - Number(startSec))
      const res = await fetch(`/api/uploads/${assetId}/broll/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query, durationSec, exportFormat })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate AI B-roll")
      }
      const aiResult = await res.json()
      onSave({
        ...broll,
        suggestedQuery: `custom:${aiResult.filePath.split(/[\\/]/).pop()}`,
        updatedAt: new Date().toISOString()
      })
    } catch (err) {
      setReplaceError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUploadCustom = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsReplacing(true)
    setReplaceError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("brollId", broll.id)
      
      const res = await fetch(`/api/uploads/${assetId}/broll/upload`, {
        method: "POST",
        body: formData
      })
      if (!res.ok) throw new Error("Failed to upload custom B-roll")
      
      const updatedBroll = await res.json()
      onSave(updatedBroll)
    } catch (err) {
      setReplaceError(err.message)
    } finally {
      setIsReplacing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <h3 className="font-bold text-white">Edit B-Roll</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Search Query / AI Prompt</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={query} onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-pink-500"
                placeholder="e.g. cinematic cityscape"
              />
              <button 
                onClick={handleSearchReplace}
                disabled={isReplacing || isGenerating || !query}
                className="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-bold flex shrink-0 items-center justify-center min-w-[80px]"
              >
                {isReplacing ? "..." : "Fetch"}
              </button>
            </div>
            {replaceError && <p className="mt-2 text-xs text-rose-400">{replaceError}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Start Time (s)</label>
              <input 
                type="number" step="0.1" 
                value={startSec} onChange={e => setStartSec(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">End Time (s)</label>
              <input 
                type="number" step="0.1" 
                value={endSec} onChange={e => setEndSec(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span className="text-xs text-slate-500 uppercase font-bold">OR</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={handleGenerateAi}
                disabled={isReplacing || isGenerating || !query}
                className="w-full border border-dashed border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-400 text-violet-300 rounded-lg p-4 text-sm font-medium transition-colors disabled:opacity-50 flex flex-col items-center gap-1 justify-center"
              >
                {isGenerating ? (
                   <span className="h-4 w-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin"></span>
                ) : (
                  <><span>Generate AI B-Roll ✦</span><span className="text-[10px] text-violet-400/70 opacity-80">(Requires AI Query)</span></>
                )}
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-slate-600 hover:border-pink-500 hover:text-pink-400 text-slate-400 rounded-lg p-4 text-sm font-medium transition-colors flex flex-col items-center justify-center"
              >
                Upload Custom Video
              </button>
            </div>
            <input 
              type="file" 
              accept="video/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleUploadCustom}
            />
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button onClick={onDelete} className="text-sm font-medium text-rose-500 hover:text-rose-400">Delete</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}
