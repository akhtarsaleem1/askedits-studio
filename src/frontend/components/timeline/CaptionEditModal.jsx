import React, { useState } from "react"
import { Bold, Italic } from "lucide-react"

const CAPTION_STYLES = [
  { value: "tiktok", label: "TikTok" },
  { value: "hormozi", label: "Hormozi" },
  { value: "cinematic", label: "Cinematic" },
  { value: "documentary", label: "Documentary" },
  { value: "podcast", label: "Podcast" },
  { value: "gaming", label: "Gaming" },
  { value: "news", label: "News" },
  { value: "minimalist", label: "Minimalist" },
  { value: "bold_pop", label: "Bold Pop" },
  { value: "subtitle_bar", label: "Subtitle Bar" },
  { value: "word_pop", label: "Word Pop" },
  { value: "kinetic", label: "Kinetic" }
]
const ANIMATIONS = ["none", "fade_up", "pop_in", "slide_in"]
const POSITIONS = ["bottom", "middle", "top"]
const FONTS = ["Arial", "Impact", "Helvetica", "Georgia", "Times New Roman", "Verdana"]

export function CaptionEditModal({ caption, onClose, onSave, onDelete }) {
  const [text, setText] = useState(caption.text || "")
  const [startSec, setStartSec] = useState(caption.startSec || 0)
  const [endSec, setEndSec] = useState(caption.endSec || 0)
  const [style, setStyle] = useState(caption.style || "tiktok")
  const [animation, setAnimation] = useState(caption.animation || "pop_in")
  const [position, setPosition] = useState(caption.position || "bottom")
  const [vmargin, setVmargin] = useState(caption.vmargin ?? 20)
  const [fontFamily, setFontFamily] = useState(caption.fontFamily || "Arial")
  const [fontSize, setFontSize] = useState(caption.fontSize ?? 28)
  const [bold, setBold] = useState(caption.bold ?? true)
  const [italic, setItalic] = useState(caption.italic ?? false)
  const [textColor, setTextColor] = useState(caption.textColor || "#ffffff")
  const [backgroundColor, setBackgroundColor] = useState(caption.backgroundColor || "#000000")
  const [outlineColor, setOutlineColor] = useState(caption.outlineColor || "#000000")
  const [outlineWidth, setOutlineWidth] = useState(caption.outlineWidth ?? 2)

  const handleSave = () => {
    onSave({
      ...caption,
      text,
      startSec: Number(startSec),
      endSec: Number(endSec),
      style,
      animation,
      position,
      vmargin: Number(vmargin),
      fontFamily,
      fontSize: Number(fontSize),
      bold,
      italic,
      textColor,
      backgroundColor,
      outlineColor,
      outlineWidth: Number(outlineWidth),
      updatedAt: new Date().toISOString()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <h3 className="font-bold text-white">Edit Caption</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Caption Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-violet-500 min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Start Time (s)</label>
              <input
                type="number"
                step="0.1"
                value={startSec}
                onChange={(e) => setStartSec(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">End Time (s)</label>
              <input
                type="number"
                step="0.1"
                value={endSec}
                onChange={(e) => setEndSec(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Style Template</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {CAPTION_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Animation</label>
              <select
                value={animation}
                onChange={(e) => setAnimation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {ANIMATIONS.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPosition(p)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors ${
                  position === p
                    ? "border-violet-400 bg-violet-600 text-white"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-violet-500"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Font</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Size</label>
              <input
                type="number"
                min="10"
                max="72"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-[auto_auto_1fr] gap-3 items-center">
            <button
              onClick={() => setBold((value) => !value)}
              title="Bold"
              aria-label="Bold"
              className={`h-10 w-10 rounded-lg border flex items-center justify-center ${
                bold ? "border-violet-400 bg-violet-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              <Bold size={16} />
            </button>
            <button
              onClick={() => setItalic((value) => !value)}
              title="Italic"
              aria-label="Italic"
              className={`h-10 w-10 rounded-lg border flex items-center justify-center ${
                italic ? "border-violet-400 bg-violet-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              <Italic size={16} />
            </button>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Vertical Offset</label>
              <input
                type="range"
                min="0"
                max="180"
                value={vmargin}
                onChange={(e) => setVmargin(e.target.value)}
                className="w-full accent-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <ColorField label="Text" value={textColor} onChange={setTextColor} />
            <ColorField label="Background" value={backgroundColor} onChange={setBackgroundColor} />
            <ColorField label="Outline" value={outlineColor} onChange={setOutlineColor} />
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Outline Width</label>
              <input
                type="number"
                min="0"
                max="8"
                value={outlineWidth}
                onChange={(e) => setOutlineWidth(e.target.value)}
                className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-2 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button onClick={onDelete} className="text-sm font-medium text-rose-500 hover:text-rose-400">Delete</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full bg-slate-950 border border-slate-700 rounded-lg p-1"
      />
    </div>
  )
}
