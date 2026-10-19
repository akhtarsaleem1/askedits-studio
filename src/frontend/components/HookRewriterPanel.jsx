import React, { useState } from "react"

const STRATEGY_ICONS = {
  question: "❓",
  statistic: "📊",
  controversy: "🔥",
  story: "📖",
  challenge: "💪"
}

const STRATEGY_COLORS = {
  question: "border-cyan-200/50 bg-cyan-50 dark:bg-cyan-950/20",
  statistic: "border-amber-200/50 bg-amber-50 dark:bg-amber-950/20",
  controversy: "border-rose-200/50 bg-rose-50 dark:bg-rose-950/20",
  story: "border-violet-200/50 bg-violet-50 dark:bg-violet-950/20",
  challenge: "border-emerald-200/50 bg-emerald-50 dark:bg-emerald-950/20"
}

export default function HookRewriterPanel({ assetId, onPlanUpdated }) {
  const [analysis, setAnalysis] = useState(null)
  const [variations, setVariations] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(null)
  const [error, setError] = useState(null)

  const analyzeHook = async () => {
    setIsAnalyzing(true)
    setError(null)
    try {
      const res = await fetch(`/api/uploads/${assetId}/hooks/analyze`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Analysis failed")
      setAnalysis(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const generateVariations = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/uploads/${assetId}/hooks/variations`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Generation failed")
      const data = await res.json()
      setVariations(data.variations)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const applyHook = async (hookVariant) => {
    setIsApplying(hookVariant.id)
    try {
      const res = await fetch(`/api/uploads/${assetId}/hooks/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hookVariant)
      })
      if (!res.ok) throw new Error((await res.json()).error || "Apply failed")
      const updatedPlan = await res.json()
      onPlanUpdated?.(updatedPlan)
      alert("Hook applied! Switch to Timeline Editor to see the changes.")
    } catch (e) {
      setError(e.message)
    } finally {
      setIsApplying(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            🎣 AI Hook Rewriter
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-semibold">Maximize viewer retention with AI-optimized intros</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={analyzeHook}
            disabled={isAnalyzing}
            className="neu-btn px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Hook"}
          </button>
          <button
            onClick={generateVariations}
            disabled={isGenerating}
            className="neu-btn-gradient px-4 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Alternatives ✦"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* Hook Analysis */}
      {analysis && (
        <div className="neu-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-gray-800 dark:text-white uppercase tracking-wider">Current Hook Analysis</h4>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
              (analysis.analysis?.hookScore ?? 0) >= 70 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
              (analysis.analysis?.hookScore ?? 0) >= 40 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
              "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
            }`}>
              {analysis.analysis?.hookScore ?? 0}/100
            </span>
          </div>

          <div className="rounded-xl neu-inset bg-transparent p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">First {analysis.durationSec}s transcript</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 italic font-semibold leading-relaxed">"{analysis.hookText}"</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="neu-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Hook Type</p>
              <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400 capitalize mt-0.5">{analysis.analysis?.hookType?.replace("_", " ")}</p>
            </div>
            <div className="neu-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Retention</p>
              <p className="text-xs font-extrabold text-violet-600 dark:text-violet-400 capitalize mt-0.5">{analysis.analysis?.retentionPrediction}</p>
            </div>
            <div className="neu-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Emotional Trigger</p>
              <p className="text-xs font-extrabold text-pink-600 dark:text-pink-400 capitalize mt-0.5">{analysis.analysis?.emotionalTrigger}</p>
            </div>
            <div className="neu-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Open Loop</p>
              <p className="text-xs font-extrabold mt-0.5">{analysis.analysis?.openLoopPresent
                ? <span className="text-emerald-600 dark:text-emerald-400">✓ Present</span>
                : <span className="text-rose-600 dark:text-rose-400">✗ Missing</span>
              }</p>
            </div>
          </div>

          {analysis.analysis?.weaknesses?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">Weaknesses</p>
              <ul className="space-y-1.5">
                {analysis.analysis.weaknesses.map((w, i) => (
                  <li key={i} className="text-[10px] text-rose-600 dark:text-rose-400 flex items-start gap-1.5 font-semibold">
                    <span className="mt-0.5 shrink-0">⚠️</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {(isAnalyzing || isGenerating) && (
        <div className="flex flex-col items-center gap-3 py-10 neu-inset bg-transparent">
          <div className="h-6 w-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-xs font-bold text-gray-500">{isAnalyzing ? "Analyzing your hook..." : "AI crafting hook alternatives..."}</p>
        </div>
      )}

      {/* Hook Variations */}
      {variations && variations.length > 0 && !isGenerating && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">AI Hook Variations</h4>
          {variations.map((v) => (
            <div key={v.id} className={`neu-card p-4 border transition-all hover:scale-[1.005] ${STRATEGY_COLORS[v.strategy] ?? "border-gray-300 bg-gray-50 dark:bg-gray-800/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{STRATEGY_ICONS[v.strategy] ?? "✦"}</span>
                    <span className="text-xs font-extrabold text-gray-800 dark:text-white capitalize">{v.strategyLabel || v.strategy}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      (v.engagementScore ?? 0) >= 80 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                      (v.engagementScore ?? 0) >= 60 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                      "bg-gray-200 dark:bg-gray-700 text-gray-500"
                    }`}>
                      {v.engagementScore}/100
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-200 font-semibold mb-2 leading-relaxed">"{v.rewrittenText}"</p>
                  {v.whyItWorks && (
                    <p className="text-[10px] text-gray-400 italic">💡 {v.whyItWorks}</p>
                  )}
                </div>
                <button
                  onClick={() => applyHook(v)}
                  disabled={isApplying === v.id}
                  className="shrink-0 neu-btn-gradient px-4 py-2 text-[9px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {isApplying === v.id ? "Applying..." : "Apply →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!analysis && !variations && !isAnalyzing && !isGenerating && !error && (
        <div className="flex flex-col items-center gap-2 py-12 text-center neu-inset bg-transparent">
          <span className="text-3xl opacity-40">🎣</span>
          <p className="text-xs font-bold text-gray-500 mt-2">Improve Your Video Hook</p>
          <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto leading-relaxed mt-1">Analyze your intro and get AI-optimized alternatives for higher retention.</p>
        </div>
      )}
    </div>
  )
}
