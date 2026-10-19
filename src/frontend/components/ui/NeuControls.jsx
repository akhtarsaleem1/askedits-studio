import React from "react"

// Theme Toggle Button Component
export function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      onClick={toggleTheme}
      className="neu-btn p-2.5 rounded-xl flex items-center justify-center min-w-[44px] min-h-[44px]"
      aria-label="Toggle light/dark mode"
    >
      {theme === "dark" ? (
        <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 103.636 5.05l-.707.707a1 1 0 001.414 1.414l.707-.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  )
}

// Neumorphic Toggle Switch (ON/OFF status)
export function NeuToggle({ checked, onChange, label = "ON" }) {
  return (
    <div className="flex items-center gap-3">
      <div 
        onClick={() => onChange(!checked)}
        className={`w-[80px] h-[40px] rounded-full flex items-center p-1 cursor-pointer transition-all duration-300 ${
          checked 
            ? "neu-inset bg-gradient-to-r from-blue-600 to-indigo-600 shadow-none border-none" 
            : "neu-inset"
        }`}
      >
        <div 
          className={`w-[32px] h-[32px] rounded-full transition-all duration-300 flex items-center justify-center font-bold text-[10px] ${
            checked 
              ? "translate-x-[42px] bg-white text-blue-600 shadow-md" 
              : "translate-x-0 bg-white text-gray-400 shadow-sm"
          }`}
          style={{
            boxShadow: checked ? "inset 1px 1px 2px rgba(255,255,255,0.5)" : "2px 2px 5px rgba(163, 177, 198, 0.5), -2px -2px 5px rgba(255,255,255,0.8)"
          }}
        >
          {checked ? label : "OFF"}
        </div>
      </div>
    </div>
  )
}

// Neumorphic Range Slider
export function NeuSlider({ min = 0, max = 100, value, onChange, label }) {
  const percent = ((value - min) / (max - min)) * 100
  
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{value}%</span>
        </div>
      )}
      <div className="relative w-full h-8 flex items-center">
        {/* Track background */}
        <div className="w-full h-3 rounded-full neu-inset relative overflow-hidden">
          {/* Fill progress */}
          <div 
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
        
        {/* Slider input overlaid */}
        <input 
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        
        {/* Mock Thumb */}
        <div 
          className="absolute w-5 h-5 rounded-full bg-white border border-gray-300 pointer-events-none flex items-center justify-center transition-all duration-75"
          style={{ 
            left: `calc(${percent}% - 10px)`,
            boxShadow: "2px 2px 5px rgba(163,177,198,0.7), -2px -2px 5px #fff",
            zIndex: 5
          }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-600" />
        </div>
      </div>
    </div>
  )
}

// Neumorphic Sparkline Chart
export function NeuSparkline({ data = [20, 45, 28, 60, 50, 75, 45], trend = "+22.12", title = "Last 7 days" }) {
  // Generate SVG path points
  const width = 140
  const height = 40
  const maxVal = Math.max(...data)
  const minVal = Math.min(...data)
  const range = maxVal - minVal || 1
  
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - 5 - ((val - minVal) / range) * (height - 10)
    return `${x},${y}`
  }).join(" ")

  return (
    <div className="neu-card p-4 flex items-center justify-between min-h-[92px]">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] text-blue-600 dark:text-blue-400">▲</span>
          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{trend}</span>
        </div>
      </div>
      <div className="relative">
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id="sparklineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b5de7" />
              <stop offset="50%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <polyline
            fill="none"
            stroke="url(#sparklineGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
          {/* Highlight end point */}
          {data.length > 0 && (
            <circle
              cx={width}
              cy={height - 5 - ((data[data.length - 1] - minVal) / range) * (height - 10)}
              r="4.5"
              fill="#3b5de7"
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    </div>
  )
}

// Neumorphic Donut Chart
export function NeuDonut({ percent = 75, label = "Lorem ipsum", sub = "dolor sit amet" }) {
  const radius = 45
  const stroke = 9
  const normalizedRadius = radius - stroke * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <div className="neu-card p-6 flex flex-col items-center justify-center text-center">
      <div className="relative w-[130px] h-[130px] flex items-center justify-center">
        {/* Sunken neumorphic circle base */}
        <div className="absolute w-[110px] h-[110px] rounded-full neu-inset flex items-center justify-center bg-transparent" />
        
        {/* SVG Progress Ring */}
        <svg height={radius * 2} width={radius * 2} className="absolute transform -rotate-90">
          <defs>
            <linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3b5de7" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            stroke="rgba(163, 177, 198, 0.2)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Active progress circle */}
          <circle
            stroke="url(#donutGrad)"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + " " + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>

        {/* Center label */}
        <div className="z-10 text-center flex flex-col items-center justify-center w-[80px] h-[80px] rounded-full bg-[#f0f4f8] dark:bg-[#202530] shadow-sm">
          <span className="text-xl font-bold text-gray-700 dark:text-gray-100">{percent}%</span>
        </div>
      </div>
      
      <div className="mt-4">
        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">{label}</h4>
        <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

// Neumorphic Top Navigation Bar / Menu
export function NeuNavBar({ activeTab, onTabSelect }) {
  const items = [
    { id: "home", label: "Home", icon: "🏠" },
    { id: "calendar", label: "Calender", icon: "📅" },
    { id: "notification", label: "Notification", icon: "🔔" },
    { id: "settings", label: "Setting", icon: "⚙️" }
  ]

  return (
    <div className="flex gap-4">
      {items.map((item) => {
        const active = activeTab === item.id
        return (
          <button
            key={item.id}
            onClick={() => onTabSelect(item.id)}
            className={`w-[68px] h-[68px] flex flex-col items-center justify-center gap-1 transition-all rounded-2xl ${
              active 
                ? "neu-inset text-blue-600 dark:text-blue-400 font-bold" 
                : "neu-card text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[9px] font-semibold tracking-wide uppercase">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Neumorphic Horizontal Timeline (2019, 2020, 2021, 2022 dots)
export function NeuTimeline({ years = ["2019", "2020", "2021", "2022"], activeIndex = 0, onChange }) {
  return (
    <div className="neu-card p-6 w-full flex flex-col justify-center min-h-[92px]">
      <div className="relative w-[90%] mx-auto flex items-center justify-between">
        {/* Timeline connecting track */}
        <div className="absolute left-0 right-0 h-1.5 rounded-full neu-inset bg-transparent" />
        
        {/* Active progress overlay */}
        <div 
          className="absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300"
          style={{ width: `${(activeIndex / (years.length - 1)) * 100}%` }}
        />
        
        {years.map((year, idx) => {
          const active = idx <= activeIndex
          const selected = idx === activeIndex
          
          return (
            <div key={year} className="relative flex flex-col items-center z-10">
              <button
                onClick={() => onChange && onChange(idx)}
                className={`w-[22px] h-[22px] rounded-full transition-all duration-300 flex items-center justify-center ${
                  selected
                    ? "bg-white ring-4 ring-blue-500 scale-110"
                    : active
                      ? "bg-blue-600 border border-white"
                      : "bg-[#e0e5ec] dark:bg-[#202530] border-2 border-gray-300 dark:border-gray-700"
                }`}
                style={{
                  boxShadow: selected ? "3px 3px 6px rgba(0,0,0,0.16)" : "inset 1px 1px 2px rgba(255,255,255,0.8)"
                }}
              />
              <span 
                className={`absolute top-8 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 ${
                  selected 
                    ? "bg-blue-600 text-white shadow-md transform -translate-y-1"
                    : "bg-white dark:bg-[#202530] text-gray-500 shadow-sm"
                }`}
                style={{
                  boxShadow: selected ? "3px 3px 6px rgba(59, 93, 231, 0.4)" : "2px 2px 4px rgba(163,177,198,0.4)"
                }}
              >
                {year}
              </span>
            </div>
          )
        })}
      </div>
      <div className="h-6" /> {/* spacer for labels */}
    </div>
  )
}
