import React from "react"

const lightTones = {
  neutral: "bg-[#e0e5ec] text-gray-500 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff]",
  success: "bg-emerald-50 text-emerald-600 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff] border border-emerald-200/50",
  warn: "bg-amber-50 text-amber-600 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff] border border-amber-200/50",
  danger: "bg-rose-50 text-rose-600 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff] border border-rose-200/50",
  ai: "bg-indigo-50 text-indigo-600 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff] border border-indigo-200/50",
  info: "bg-cyan-50 text-cyan-600 shadow-[2px_2px_5px_#a3b1c6,-2px_-2px_5px_#fff] border border-cyan-200/50"
}

const darkTones = {
  neutral: "bg-[#202530] text-gray-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e]",
  success: "bg-[#162e21] text-emerald-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e] border border-emerald-900/50",
  warn: "bg-[#2d2215] text-amber-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e] border border-amber-900/50",
  danger: "bg-[#2c151b] text-rose-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e] border border-rose-900/50",
  ai: "bg-[#1c1d3a] text-indigo-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e] border border-indigo-900/50",
  info: "bg-[#122c37] text-cyan-400 shadow-[2px_2px_5px_#0d0f14,-2px_-2px_5px_#29303e] border border-cyan-900/50"
}

export function StatusPill({ label, tone = "neutral", dot = false }) {
  // We can read context or class to determine dark mode
  const isDark = document.documentElement.classList.contains("dark")
  const toneClass = isDark ? darkTones[tone] : lightTones[tone]
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${toneClass}`}>
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${
          tone === "warn" 
            ? "bg-amber-400 animate-pulse" 
            : tone === "success" 
              ? "bg-emerald-400" 
              : tone === "ai" 
                ? "bg-indigo-400 animate-pulse" 
                : "bg-slate-400"
        }`} />
      )}
      {label}
    </span>
  )
}
