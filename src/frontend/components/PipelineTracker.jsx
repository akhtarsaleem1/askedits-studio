import React from "react"
import { ProgressBar } from "./ui/ProgressRing.jsx"

const STAGES = [
  { key: "validation",       label: "Client Validation",      phase: 1, icon: "✓", desc: "Format, size, and local preview checks." },
  { key: "uploading",        label: "Chunk Transport",         phase: 1, icon: "⬆", desc: "Sending file in 5 MB chunks." },
  { key: "probing",          label: "Media Probe",             phase: 1, icon: "⌖", desc: "ffprobe reads duration, resolution, codecs." },
  { key: "video-derivatives",label: "Video Derivatives",       phase: 1, icon: "▶", desc: "Optimized + proxy MP4s via FFmpeg." },
  { key: "audio-extraction", label: "Audio Extraction",        phase: 2, icon: "♪", desc: "16 kHz mono WAV for transcription." },
  { key: "transcription",    label: "Transcription",           phase: 2, icon: "📝", desc: "Faster-Whisper multilingual transcript." },
  { key: "scene-detection",  label: "Scene Detection",         phase: 4, icon: "🎬", desc: "PySceneDetect camera cuts & transitions." },
  { key: "face-detection",   label: "Face Detection",          phase: 4, icon: "👤", desc: "MediaPipe speaker position tracking." },
  { key: "silence-detection",label: "Silence Detection",       phase: 4, icon: "🔇", desc: "FFmpeg dead-air & pause detection." },
  { key: "ai-analysis",      label: "AI Analysis",             phase: 3, icon: "✦", desc: "Groq detects viral moments, style, edit plan." },
  { key: "complete",         label: "Complete",                phase: 3, icon: "★", desc: "All artifacts ready." }
]

function stageIndex(stageKey) {
  return STAGES.findIndex((s) => s.key === stageKey)
}

function resolveActiveIndex(processingStage, processingStatus, uploadStage) {
  if (uploadStage === "uploading") return 1
  if (uploadStage === "analyzing") return 0
  if (processingStatus === "ready") return STAGES.length - 1
  if (processingStatus === "failed") return stageIndex(processingStage)
  const idx = stageIndex(processingStage)
  return idx === -1 ? 2 : idx
}

export function PipelineTracker({ uploadStage, uploadProgress, processingStage, processingStatus, processingProgress = 0 }) {
  const active = resolveActiveIndex(processingStage, processingStatus, uploadStage)
  const done = processingStatus === "ready"
  const failed = processingStatus === "failed" || uploadStage === "failed"

  const phaseColors = { 
    1: "text-blue-600 dark:text-blue-400", 
    2: "text-indigo-600 dark:text-indigo-400", 
    3: "text-purple-600 dark:text-purple-400", 
    4: "text-cyan-600 dark:text-cyan-400" 
  }
  
  const phaseLabels = { 
    1: "Phase 1 · Upload", 
    2: "Phase 2 · Transcript", 
    3: "Phase 3 · AI Analysis", 
    4: "Phase 4 · Vision Processing" 
  }

  let currentPhase = null

  return (
    <div className="space-y-4">
      {STAGES.map((stage, idx) => {
        const isActive = idx === active && !done
        const isDone = idx < active || done
        const isFailed = failed && idx === active
        const isLocked = idx > active && !done

        const showPhaseHeader = stage.phase !== currentPhase
        currentPhase = stage.phase
        const colorClass = phaseColors[stage.phase]

        // Calculate granular progress for the active stage
        let barPct = 0
        if (isDone) {
          barPct = 100
        } else if (isActive) {
          if (stage.key === "uploading") {
            barPct = uploadProgress
          } else {
            barPct = processingProgress > 0 ? processingProgress : 40 
          }
        }

        return (
          <div key={stage.key} className="transition-all duration-300">
            {showPhaseHeader && (
              <p className={`mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>
                {phaseLabels[stage.phase]}
              </p>
            )}
            
            <div className={`p-4 transition-all duration-300 ${
              isActive 
                ? "neu-card border-l-4 border-l-blue-600 dark:border-l-blue-400 scale-[1.01]"
                : isDone 
                  ? "neu-card opacity-90"
                  : isFailed 
                    ? "neu-card border-l-4 border-l-rose-500" 
                    : "neu-inset opacity-60"
            }`}>
              <div className="flex items-center gap-3">
                {/* Stage Status Marker */}
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm transition-all ${
                  isFailed 
                    ? "bg-rose-500 text-white"
                    : isDone 
                      ? "bg-emerald-500 text-white"
                      : isActive 
                        ? "bg-gradient-to-r from-blue-600 to-cyan-400 text-white" 
                        : "bg-[#e0e5ec] dark:bg-[#202530] text-gray-400 dark:text-gray-600"
                }`}>
                  {isDone && !isFailed ? "✓" : isFailed ? "✕" : stage.icon}
                </span>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-bold tracking-wide ${
                      isLocked 
                        ? "text-gray-400 dark:text-gray-600" 
                        : isDone 
                          ? "text-gray-500 dark:text-gray-400" 
                          : "text-gray-800 dark:text-gray-100"
                    }`}>
                      {stage.label}
                    </p>
                    
                    {isActive && stage.key === "uploading" && (
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">{uploadProgress}%</span>
                    )}
                    {isActive && stage.key !== "uploading" && processingProgress > 0 && (
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">{processingProgress}%</span>
                    )}
                  </div>
                  
                  {(isActive || isDone) && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{stage.desc}</p>
                  )}
                  
                  {isActive && (
                    <div className="mt-3">
                      <ProgressBar value={barPct} animated={true} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
