import React from "react"

export function StatTile({ label, value, sub, accent }) {
  return (
    <div className="neu-card p-4 transition-all duration-300">
      <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`mt-1.5 text-xl font-extrabold tracking-tight ${accent ?? "text-gray-700 dark:text-gray-200"}`}>
        {value ?? "--"}
      </p>
      {sub && <p className="mt-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}
