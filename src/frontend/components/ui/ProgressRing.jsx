import React from "react"

export function ProgressRing({ value = 0, size = 48, stroke = 4 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(Math.max(value, 0), 100) / 100) * circ
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer Card with Soft Shadow */}
      <div 
        className="absolute rounded-full neu-inset bg-transparent" 
        style={{ width: size - stroke, height: size - stroke }}
      />
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", zIndex: 1 }} className="overflow-visible">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neu-accent)" />
            <stop offset="100%" stopColor="var(--neu-accent-light)" />
          </linearGradient>
        </defs>
        <circle 
          cx={size / 2} 
          cy={size / 2} 
          r={r} 
          fill="none" 
          stroke="rgba(163, 177, 198, 0.2)" 
          strokeWidth={stroke} 
        />
        <circle
          cx={size / 2} 
          cy={size / 2} 
          r={r} 
          fill="none"
          stroke="url(#ringGrad)" 
          strokeWidth={stroke}
          strokeDasharray={circ} 
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      {/* Percentage Center Text */}
      <div className="absolute text-[10px] font-bold text-gray-700 dark:text-gray-200">
        {Math.round(value)}%
      </div>
    </div>
  )
}

export function ProgressBar({ value = 0, animated = false }) {
  const cleanVal = Math.min(Math.max(value, 0), 100)
  
  return (
    <div className="h-4 rounded-full p-1 neu-inset flex items-center bg-transparent">
      <div
        className={`h-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-500 ease-out ${
          animated ? "animate-pulse" : ""
        }`}
        style={{ width: `${cleanVal}%` }}
      />
    </div>
  )
}
