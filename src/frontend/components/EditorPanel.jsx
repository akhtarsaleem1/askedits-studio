import React, { useState, useEffect, useRef } from "react"
import { NeuToggle, NeuSlider } from "./ui/NeuControls.jsx"

export const PRESETS = {
  tiktok_viral: {
    id: "tiktok_viral",
    name: "TikTok Viral",
    emoji: "🔥",
    tagline: "High pacing, vibrant pop color grading, and TikTok captions.",
    cuts: { mode: "smart_cuts", removeDeadAir: true, removePauses: true, keepMicroPauses: true },
    captions: { enabled: true, style: "tiktok" },
    zooms: { enabled: true, mode: "punch_in", trackFaces: true },
    filter: { enabled: true, preset: "vibrant_pop", intensity: 0.8, sharpen: true, vignette: true },
    broll: { enabled: true, maxClips: 3 },
    audio: { voiceCleanup: true, sfx: { enabled: true, style: "pop" } },
    exportFormat: "tiktok",
    exportResizeMode: "crop_to_fill",
    exportQuality: "high"
  },
  hormozi: {
    id: "hormozi",
    name: "Alex Hormozi Style",
    emoji: "💼",
    tagline: "Bold text styling, fast zoom punches, and silence removal.",
    cuts: { mode: "silence_only", removeDeadAir: true, removePauses: true, keepMicroPauses: false },
    captions: { enabled: true, style: "hormozi" },
    zooms: { enabled: true, mode: "slow_push", trackFaces: true },
    filter: { enabled: true, preset: "warm_golden", intensity: 0.6, sharpen: true, vignette: false },
    broll: { enabled: true, maxClips: 3 },
    audio: { voiceCleanup: true, sfx: { enabled: true, style: "pop" } },
    exportFormat: "tiktok",
    exportResizeMode: "crop_to_fill",
    exportQuality: "high"
  },
  cinematic: {
    id: "cinematic",
    name: "Cinematic Reel",
    emoji: "🎬",
    tagline: "Moody filters, slow Ken Burns movements, and AI B-roll overlays.",
    cuts: { mode: "ai_driven", removeDeadAir: true, removePauses: false, keepMicroPauses: true },
    captions: { enabled: true, style: "cinematic" },
    zooms: { enabled: true, mode: "ken_burns", trackFaces: false },
    filter: { enabled: true, preset: "moody_dark", intensity: 0.7, sharpen: false, vignette: true },
    broll: { enabled: true, maxClips: 3 },
    audio: { voiceCleanup: true, sfx: { enabled: true, style: "cinematic" } },
    exportFormat: "youtube_landscape",
    exportResizeMode: "crop_to_fill",
    exportQuality: "max"
  },
  podcast: {
    id: "podcast",
    name: "Clean Podcast",
    emoji: "🎙️",
    tagline: "Removes dead space, cleans background audio, and retains layout.",
    cuts: { mode: "silence_only", removeDeadAir: true, removePauses: true, keepMicroPauses: false },
    captions: { enabled: true, style: "podcast" },
    zooms: { enabled: false, mode: "none", trackFaces: true },
    filter: { enabled: false, preset: "none", intensity: 0, sharpen: true, vignette: false },
    broll: { enabled: false, maxClips: 3 },
    audio: { voiceCleanup: true, sfx: { enabled: false, style: "minimal" } },
    exportFormat: "original",
    exportResizeMode: "crop_to_fill",
    exportQuality: "standard"
  },
  gaming: {
    id: "gaming",
    name: "Gaming Highlight",
    emoji: "🎮",
    tagline: "Vibrant high-contrast pop filters and energetic sound effects.",
    cuts: { mode: "smart_cuts", removeDeadAir: true, removePauses: true, keepMicroPauses: true },
    captions: { enabled: true, style: "gaming" },
    zooms: { enabled: true, mode: "punch_in", trackFaces: false },
    filter: { enabled: true, preset: "vibrant_pop", intensity: 1.0, sharpen: true, vignette: false },
    broll: { enabled: true, maxClips: 3 },
    audio: { voiceCleanup: false, sfx: { enabled: true, style: "pop" } },
    exportFormat: "tiktok",
    exportResizeMode: "crop_to_fill",
    exportQuality: "high"
  },
  minimalist: {
    id: "minimalist",
    name: "Minimalist Style",
    emoji: "✨",
    tagline: "Subtle titles, clean cuts, zero color filters or zoom effects.",
    cuts: { mode: "silence_only", removeDeadAir: true, removePauses: false, keepMicroPauses: true },
    captions: { enabled: true, style: "minimalist" },
    zooms: { enabled: false, mode: "none", trackFaces: false },
    filter: { enabled: false, preset: "none", intensity: 0, sharpen: false, vignette: false },
    broll: { enabled: false, maxClips: 3 },
    audio: { voiceCleanup: true, sfx: { enabled: true, style: "minimal" } },
    exportFormat: "original",
    exportResizeMode: "crop_to_fill",
    exportQuality: "standard"
  }
}

export default function EditorPanel({ assetId, onApplyTemplate }) {
  const [selectedTemplate, setSelectedTemplate] = useState("tiktok_viral")
  const [customSettings, setCustomSettings] = useState(PRESETS.tiktok_viral)
  const [showCustomConfig, setShowCustomConfig] = useState(false)

  const handleTemplateSelect = (id) => {
    setSelectedTemplate(id)
    setCustomSettings({ ...PRESETS[id] })
  }

  const handleCustomToggle = (path, val) => {
    setCustomSettings(prev => {
      const copy = JSON.parse(JSON.stringify(prev))
      let curr = copy
      const parts = path.split(".")
      for (let i = 0; i < parts.length - 1; i++) {
        curr = curr[parts[i]]
      }
      curr[parts[parts.length - 1]] = val
      return copy
    })
  }

  return (
    <div className="space-y-6">
      <div className="text-center max-w-xl mx-auto mb-6">
        <h2 className="text-xl font-extrabold text-gray-800 dark:text-white">Choose Editing Template</h2>
        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
          Select an AI-driven layout style. ASKEdits will scan and edit your footage according to the template rules.
        </p>
      </div>

      {/* Video Output Settings Card */}
      <div className="neu-card p-5 space-y-4">
        <h3 className="font-bold text-sm text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <span>🎬</span> Video Output Settings
        </h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
              Target Aspect Ratio
            </label>
            <div className="flex flex-wrap gap-2.5">
              {[
                { id: "original", label: "Original", icon: "📄" },
                { id: "tiktok", label: "Vertical 9:16", icon: "📱" },
                { id: "youtube_landscape", label: "Landscape 16:9", icon: "🖥️" },
                { id: "instagram_square", label: "Square 1:1", icon: "🔲" }
              ].map(opt => {
                const active = customSettings.exportFormat === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleCustomToggle("exportFormat", opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold transition-all rounded-xl ${
                      active
                        ? "neu-inset text-blue-600 dark:text-blue-400 font-bold bg-[#ebf0f7] dark:bg-[#202738]"
                        : "neu-btn text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Scaling Mode */}
          {customSettings.exportFormat !== "original" && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Scaling / Resize Mode
              </label>
              <div className="flex flex-wrap gap-2.5">
                {[
                  { id: "crop_to_fill", label: "Crop to Fill", icon: "✂️" },
                  { id: "fit_with_bars", label: "Fit with Bars", icon: "🎞️" }
                ].map(opt => {
                  const active = customSettings.exportResizeMode === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleCustomToggle("exportResizeMode", opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold transition-all rounded-xl ${
                        active
                          ? "neu-inset text-blue-600 dark:text-blue-400 font-bold bg-[#ebf0f7] dark:bg-[#202738]"
                          : "neu-btn text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid of presets */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(PRESETS).map(([key, template]) => {
          const isSelected = selectedTemplate === key
          return (
            <div
              key={key}
              onClick={() => handleTemplateSelect(key)}
              className={`p-5 neu-card cursor-pointer flex flex-col justify-between h-[180px] transition-all duration-300 ${
                isSelected 
                  ? "border-2 border-blue-600 dark:border-blue-400 bg-[#ebf0f7] dark:bg-[#202738]" 
                  : "hover:scale-[1.02]"
              }`}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{template.emoji}</span>
                  <h3 className="font-bold text-sm text-gray-800 dark:text-white">{template.name}</h3>
                </div>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  {template.tagline}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                  {template.exportFormat === "tiktok" ? "Vertical (9:16)" : "Landscape (16:9)"}
                </span>
                {isSelected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">✓</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Custom Accordion Trigger */}
      <div className="neu-card p-4">
        <button
          onClick={() => setShowCustomConfig(!showCustomConfig)}
          className="w-full flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300"
        >
          <span>🛠️ ADVANCED: CUSTOMIZE TEMPLATE RULES</span>
          <span>{showCustomConfig ? "▲" : "▼"}</span>
        </button>

        {showCustomConfig && (
          <div className="mt-5 pt-4 border-t border-gray-300 dark:border-gray-800 grid gap-6 md:grid-cols-2 text-xs">
            {/* Cuts & Audios */}
            <div className="space-y-4">
              <h4 className="font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Cuts & Transitions</h4>
              <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <span>Smart Auto Cuts</span>
                <NeuToggle 
                  checked={customSettings.cuts.mode === "smart_cuts"} 
                  onChange={(checked) => handleCustomToggle("cuts.mode", checked ? "smart_cuts" : "silence_only")}
                />
              </div>
              <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <span>Remove Pauses & Silence</span>
                <NeuToggle 
                  checked={customSettings.cuts.removePauses} 
                  onChange={(checked) => handleCustomToggle("cuts.removePauses", checked)}
                />
              </div>
              <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <span>Voice Audio Cleanup</span>
                <NeuToggle 
                  checked={customSettings.audio.voiceCleanup} 
                  onChange={(checked) => handleCustomToggle("audio.voiceCleanup", checked)}
                />
              </div>
            </div>

            {/* Captions & Visuals */}
            <div className="space-y-4">
              <h4 className="font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Captions & Effects</h4>
              <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <span>Generate Captions</span>
                <NeuToggle 
                  checked={customSettings.captions.enabled} 
                  onChange={(checked) => handleCustomToggle("captions.enabled", checked)}
                />
              </div>
              {customSettings.captions.enabled && (
                <>
                  <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                    <span>Caption Style</span>
                    <select
                      value={customSettings.captions.style || "tiktok"}
                      onChange={(e) => handleCustomToggle("captions.style", e.target.value)}
                      className="bg-white dark:bg-[#202738] border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 font-bold text-[11px] text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                    >
                      <option value="tiktok">TikTok Style</option>
                      <option value="hormozi">Alex Hormozi Style</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="documentary">Documentary</option>
                      <option value="podcast">Clean Podcast</option>
                      <option value="gaming">Gaming Highlight</option>
                      <option value="news">News Anchor</option>
                      <option value="minimalist">Minimalist</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                    <span>Caption Position</span>
                    <select
                      value={customSettings.captions.position || "bottom"}
                      onChange={(e) => handleCustomToggle("captions.position", e.target.value)}
                      className="bg-white dark:bg-[#202738] border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 font-bold text-[11px] text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                    >
                      <option value="bottom">Bottom of Screen</option>
                      <option value="middle">Middle of Screen</option>
                      <option value="top">Top of Screen</option>
                    </select>
                  </div>
                  <div className="bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                    <NeuSlider
                      label="Caption Vertical Margin"
                      min={5}
                      max={150}
                      value={customSettings.captions.vmargin !== undefined ? customSettings.captions.vmargin : 20}
                      onChange={(v) => handleCustomToggle("captions.vmargin", v)}
                    />
                  </div>
                </>
              )}
              <div className="flex justify-between items-center bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <span>Smart Framing / Zoom</span>
                <NeuToggle 
                  checked={customSettings.zooms.enabled} 
                  onChange={(checked) => handleCustomToggle("zooms.enabled", checked)}
                />
              </div>
              
              <div className="bg-[#e5ebf3] dark:bg-[#1a1f29] p-3 rounded-xl">
                <NeuSlider 
                  label="Color grading effect strength"
                  min={0}
                  max={100}
                  value={Math.round(customSettings.filter.intensity * 100)}
                  onChange={(v) => handleCustomToggle("filter.intensity", v / 100)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={() => onApplyTemplate(customSettings)}
          className="neu-btn-gradient px-8 py-4 text-sm tracking-widest uppercase transition-all duration-300"
        >
          Apply Template & Start AI Edit ✦
        </button>
      </div>
    </div>
  )
}
