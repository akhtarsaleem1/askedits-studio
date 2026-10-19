import React from "react"

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 100)
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`
}

function SceneTimeline({ scenes, durationSec }) {
  if (!scenes?.length || !durationSec) return null

  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Scene Timeline</p>
      <div className="flex h-8 w-full overflow-hidden rounded-xl neu-inset bg-transparent p-0.5">
        {scenes.map((scene, idx) => {
          const width = Math.max(0.5, (scene.durationSec / durationSec) * 100)
          const hue = (idx * 37) % 360
          return (
            <div
              key={scene.id}
              className="group relative h-full transition-all hover:brightness-105"
              style={{
                width: `${width}%`,
                backgroundColor: `hsl(${hue}, 60%, 55%)`,
                borderRight: "1px solid rgba(255,255,255,0.2)",
                borderRadius: idx === 0 ? "10px 0 0 10px" : idx === scenes.length - 1 ? "0 10px 10px 0" : "0"
              }}
              title={`Scene ${idx + 1}: ${formatTime(scene.startSec)} → ${formatTime(scene.endSec)} (${scene.durationSec.toFixed(1)}s)`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-extrabold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                {idx + 1}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] font-bold text-gray-400 dark:text-gray-500">
        <span>0:00</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  )
}

function SilenceTimeline({ intervals, durationSec }) {
  if (!intervals?.length || !durationSec) return null

  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Silence Map</p>
      <div className="relative h-6 w-full rounded-xl neu-inset bg-transparent overflow-hidden">
        {intervals.map((interval) => {
          const left = (interval.startSec / durationSec) * 100
          const width = Math.max(0.3, (interval.durationSec / durationSec) * 100)
          const color = interval.type === "dead-air" ? "bg-rose-500/80" : interval.type === "pause" ? "bg-amber-500/70" : "bg-gray-400/40"
          return (
            <div
              key={interval.id}
              className={`absolute top-0 h-full ${color}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${interval.type}: ${formatTime(interval.startSec)} → ${formatTime(interval.endSec)} (${interval.durationSec.toFixed(2)}s)`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex gap-4 text-[9px] font-bold text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded bg-rose-500/80" /> Dead Air</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded bg-amber-500/70" /> Pause</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded bg-gray-400/40" /> Micro</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon }) {
  return (
    <div className="neu-card p-3 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm font-extrabold text-gray-800 dark:text-gray-100 mt-0.5">
          {value}
          {unit && <span className="ml-0.5 text-[10px] font-bold text-gray-400">{unit}</span>}
        </p>
      </div>
    </div>
  )
}

export function SceneAnalysisPanel({ sceneData, faceData, silenceData }) {
  const hasScene = sceneData && sceneData.status !== "failed"
  const hasFace = faceData && faceData.status !== "failed"
  const hasSilence = silenceData && silenceData.status !== "failed"

  if (!hasScene && !hasFace && !hasSilence) {
    return (
      <div className="neu-inset p-6 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">Scene analysis data is not available yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scene Detection */}
      {hasScene && (
        <div className="neu-card p-5">
          <h3 className="mb-4 text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">🎬 Scene Detection</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="🎞️" label="Scenes" value={sceneData.summary?.sceneCount ?? 0} unit="" />
            <StatCard icon="⏱️" label="Avg Duration" value={(sceneData.summary?.avgSceneDurationSec ?? 0).toFixed(1)} unit="s" />
            <StatCard icon="⚡" label="Shortest" value={(sceneData.summary?.shortestSceneSec ?? 0).toFixed(1)} unit="s" />
            <StatCard icon="🕐" label="Longest" value={(sceneData.summary?.longestSceneSec ?? 0).toFixed(1)} unit="s" />
          </div>
          <SceneTimeline scenes={sceneData.scenes} durationSec={sceneData.video?.durationSec} />
        </div>
      )}

      {/* Face Detection */}
      {hasFace && (
        <div className="neu-card p-5">
          <h3 className="mb-4 text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">👤 Face Detection</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard icon="📊" label="Face Presence" value={((faceData.summary?.facePresenceRatio ?? 0) * 100).toFixed(0)} unit="%" />
            <StatCard icon="👥" label="Max Face Count" value={faceData.summary?.maxSimultaneousFaces ?? 0} unit="" />
            <StatCard icon="🔍" label="Total Samples" value={faceData.summary?.totalSamples ?? 0} unit="" />
          </div>

          {/* Per-scene face summary */}
          {faceData.sceneSummaries?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Speaker Focus by Scene</p>
              <div className="flex gap-2 overflow-x-auto pb-1.5">
                {faceData.sceneSummaries.map((s, idx) => (
                  <div
                    key={s.sceneId}
                    className={`flex flex-col items-center rounded-xl p-2 min-w-[50px] text-[9px] font-bold border transition-all ${
                      s.hasFace 
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[1px_1px_3px_rgba(0,0,0,0.05)]" 
                        : "neu-inset text-gray-400"
                    }`}
                    title={`Scene ${idx + 1}: ${s.hasFace ? `Face at ${s.dominantPosition?.horizontal ?? "center"}` : "No face"}`}
                  >
                    <span>{idx + 1}</span>
                    <span className="mt-1 font-extrabold uppercase">{s.hasFace ? s.dominantPosition?.horizontal ?? "✓" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Silence Detection */}
      {hasSilence && (
        <div className="neu-card p-5">
          <h3 className="mb-4 text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">🔇 Silence & Pause</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="⏸️" label="Total Pauses" value={silenceData.summary?.totalIntervals ?? 0} unit="" />
            <StatCard icon="🚫" label="Dead Air" value={silenceData.summary?.deadAirCount ?? 0} unit="" />
            <StatCard icon="⏱️" label="Silence Total" value={(silenceData.summary?.totalSilenceSec ?? 0).toFixed(1)} unit="s" />
            <StatCard icon="📏" label="Longest Silence" value={(silenceData.summary?.longestSilenceSec ?? 0).toFixed(1)} unit="s" />
          </div>
          <SilenceTimeline intervals={silenceData.intervals} durationSec={silenceData.summary?.totalSilenceSec > 0 ? (silenceData.intervals?.at(-1)?.endSec ?? 0) + 1 : 0} />
        </div>
      )}
    </div>
  )
}
