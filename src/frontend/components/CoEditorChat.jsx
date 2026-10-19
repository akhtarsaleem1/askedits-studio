import React, { useState, useRef, useEffect } from "react"

const QUICK_COMMANDS = [
  { label: "🎬 Cinematic", command: "Make more cinematic" },
  { label: "😂 Add memes", command: "Add more memes and funny SFX" },
  { label: "⚡ Faster cuts", command: "Make faster paced with more cuts" },
  { label: "🎵 Add music", command: "Add dramatic background music" },
  { label: "🔥 TikTok style", command: "Make it TikTok viral style" },
  { label: "📸 More B-roll", command: "Add more B-roll footage" },
  { label: "✨ Minimalist", command: "Make it clean and minimalist" },
  { label: "🎤 Podcast", command: "Make it podcast clean style" }
]

export default function CoEditorChat({ assetId, onPlanUpdated }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm your AI Co-Editor. Tell me how you want to change your video, or use the quick commands below. 🎬" }
  ])
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendCommand = async (command) => {
    if (!command.trim() || isProcessing) return

    const userMessage = { role: "user", content: command }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsProcessing(true)

    try {
      const chatHistory = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch(`/api/uploads/${assetId}/co-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, chatHistory })
      })

      let data = {}
      const text = await res.text()
      try {
        data = JSON.parse(text)
      } catch (err) {
        if (!res.ok) throw new Error(text || "Co-editor request failed")
      }

      if (!res.ok) {
        throw new Error(data.error || "Co-editor request failed")
      }

      let responseText = data.response || "Changes applied!"

      if (data.changesSummary?.length > 0) {
        responseText += "\n\n**Changes made:**"
        for (const change of data.changesSummary) {
          const icon = change.type === "added" ? "➕" : change.type === "removed" ? "➖" : "✏️"
          responseText += `\n${icon} ${change.detail || `${change.type} ${change.count} ${change.section}`}`
        }
      }

      setMessages(prev => [...prev, { role: "assistant", content: responseText }])
      onPlanUpdated?.(data.updatedPlan)
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `❌ Error: ${e.message}`, isError: true }])
    } finally {
      setIsProcessing(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendCommand(input)
    }
  }

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden neu-card" style={{ minHeight: "460px" }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-300/40 dark:border-gray-800/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md">
          <span className="text-sm text-white font-bold">✦</span>
        </div>
        <div>
          <h3 className="text-xs font-extrabold text-gray-800 dark:text-white uppercase tracking-wider">AI Co-Editor</h3>
          <p className="text-[9px] text-gray-400 font-semibold">Natural language video editing commands</p>
        </div>
        {isProcessing && (
          <div className="ml-auto flex items-center gap-2 text-[10px] text-blue-600 dark:text-blue-400 font-bold">
            <span className="h-3 w-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Quick Commands */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-300/30 dark:border-gray-800/30 px-4 py-2.5 bg-[#e5ebf3] dark:bg-[#1a1f29]">
        {QUICK_COMMANDS.map((qc) => (
          <button
            key={qc.command}
            onClick={() => sendCommand(qc.command)}
            disabled={isProcessing}
            className="neu-btn px-2.5 py-1 text-[9px] font-bold text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ maxHeight: "320px" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-semibold leading-relaxed ${
              msg.role === "user"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-md shadow-md"
                : msg.isError
                  ? "bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 text-rose-600 dark:text-rose-400 rounded-bl-md"
                  : "neu-card text-gray-700 dark:text-gray-200 rounded-bl-md"
            }`}>
              {msg.content.split("\n").map((line, j) => (
                <React.Fragment key={j}>
                  {line.startsWith("**") && line.endsWith("**")
                    ? <p className="font-extrabold mt-2.5 mb-1 text-[10px] text-gray-400 uppercase tracking-wider">{line.replace(/\*\*/g, "")}</p>
                    : line.startsWith("➕") || line.startsWith("➖") || line.startsWith("✏️")
                      ? <p className="text-[10px] ml-1 text-gray-600 dark:text-gray-300">{line}</p>
                      : <p>{line}</p>
                  }
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md neu-card px-4 py-3.5">
              <div className="flex gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-300/40 dark:border-gray-800/40 p-3 bg-[#e5ebf3] dark:bg-[#1a1f29]">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try: "Make more cinematic" or "Add dramatic music"'
            disabled={isProcessing}
            className="flex-1 neu-input px-4 py-2.5 text-xs font-semibold placeholder-gray-400 disabled:opacity-50"
          />
          <button
            onClick={() => sendCommand(input)}
            disabled={!input.trim() || isProcessing}
            className="neu-btn-gradient px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
