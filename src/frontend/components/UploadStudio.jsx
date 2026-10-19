import { useEffect, useMemo, useRef, useState } from "react"
import { formatBytes, formatDuration } from "../../shared/formatters.js"
import { DEFAULT_CHUNK_SIZE_BYTES, SUPPORTED_VIDEO_FORMATS, validateVideoSelection } from "../../shared/upload-config.js"
import { extractVideoPreview } from "../utils/file-intel.js"
import {
  analyzeUploadSession, completeUploadSession, createUploadSession,
  reprocessUploadSession, uploadFileInChunks, waitForProcessing
} from "../utils/upload-client.js"
import { EditPlanPanel } from "./EditPlanPanel.jsx"
import { PipelineTracker } from "./PipelineTracker.jsx"
import { SceneAnalysisPanel } from "./SceneAnalysisPanel.jsx"
import { StyleAnalysisPanel } from "./StyleAnalysisPanel.jsx"
import { StatusPill } from "./ui/StatusPill.jsx"
import { StatTile } from "./ui/StatTile.jsx"
import { ViralMomentsPanel } from "./ViralMomentsPanel.jsx"
import EditorPanel from "./EditorPanel.jsx"
import { TimelineEditor } from "./timeline/TimelineEditor.jsx"
import { LivePreviewPlayer } from "./timeline/LivePreviewPlayer.jsx"
import ThumbnailPanel from "./ThumbnailPanel.jsx"
import HookRewriterPanel from "./HookRewriterPanel.jsx"
import CoEditorChat from "./CoEditorChat.jsx"

// Neumorphic Controls Imports
import { ThemeToggle, NeuSlider, NeuSparkline, NeuDonut } from "./ui/NeuControls.jsx"

const TABS = ["Scene Analysis", "Viral Moments", "Style Analysis", "Edit Plan", "AI Thumbnails", "Hook Rewriter", "Co-Editor"]
const AI_ARTIFACT_URLS = { "Viral Moments": "viral-moments", "Style Analysis": "style-analysis", "Edit Plan": "edit-plan" }

function getAspectRatio(formatId, media) {
  if (formatId === "tiktok") return { css: "9 / 16", ratio: 9 / 16 }
  if (formatId === "instagram_square") return { css: "1 / 1", ratio: 1 }
  if (formatId === "youtube_landscape" || formatId === "twitter") return { css: "16 / 9", ratio: 16 / 9 }

  const width = Number(media?.width)
  const height = Number(media?.height)
  if (width > 0 && height > 0) {
    return { css: `${width} / ${height}`, ratio: width / height }
  }

  return { css: "16 / 9", ratio: 16 / 9 }
}

function getVideoFrameStyle(formatId, media, maxVh = 60) {
  const aspect = getAspectRatio(formatId, media)
  return {
    aspectRatio: aspect.css,
    maxHeight: `${maxVh}vh`,
    width: `min(100%, ${(aspect.ratio * maxVh).toFixed(2)}vh)`
  }
}

function mergeSectionSettings(base, override) {
  return {
    ...(base || {}),
    ...(override || {})
  }
}

function attachRenderSettings(editPlan, renderSettings) {
  if (!editPlan) return editPlan
  const planSettings = editPlan.settings || {}

  return {
    ...editPlan,
    settings: {
      ...(renderSettings || {}),
      ...planSettings,
      captions: mergeSectionSettings(renderSettings?.captions, planSettings.captions),
      cuts: mergeSectionSettings(renderSettings?.cuts, planSettings.cuts),
      broll: mergeSectionSettings(renderSettings?.broll, planSettings.broll),
      zooms: mergeSectionSettings(renderSettings?.zooms, planSettings.zooms),
      filter: mergeSectionSettings(renderSettings?.filter, planSettings.filter),
      audio: mergeSectionSettings(renderSettings?.audio, planSettings.audio)
    }
  }
}

export default function UploadStudio() {
  // Theme state
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light"
    }
    return "light"
  })

  // Workflow states
  const [workflowStep, setWorkflowStep] = useState(1) // 1: Upload, 2: Template, 3: Processing, 4: Preview/Adjust
  const [selectedTemplateSettings, setSelectedTemplateSettings] = useState(null)
  const [showManualAdjust, setShowManualAdjust] = useState(false)

  // Core file/asset states
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [stage, setStage] = useState("idle")   // idle | analyzing | uploading | processing | ready | failed
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("Choose a file to begin.")
  const [error, setError] = useState(null)
  const [asset, setAsset] = useState(null)
  const [drag, setDrag] = useState(false)
  const [preparing, setPreparing] = useState(false)

  // Subpanel states
  const [activeTab, setActiveTab] = useState("Scene Analysis")
  const [aiData, setAiData] = useState({ viralMoments: null, styleAnalysis: null, editPlan: null })
  const [sceneTabData, setSceneTabData] = useState({ sceneDetection: null, faceDetection: null, silenceDetection: null })
  const [aiLoading, setAiLoading] = useState({})

  // Render & Output States
  const [renderJob, setRenderJob] = useState(null)
  const [renderedVideoUrl, setRenderedVideoUrl] = useState(null)
  const [timelineDirty, setTimelineDirty] = useState(false)
  const activeRenderSettings = aiData.editPlan?.settings || renderJob?.settings || selectedTemplateSettings || null

  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const pollRef = useRef(null)
  const renderPollRef = useRef(null)
  const latestEditPlanRef = useRef(null)
  const editRevisionRef = useRef(0)

  useEffect(() => {
    latestEditPlanRef.current = aiData.editPlan
  }, [aiData.editPlan])

  // Theme Toggler
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light"
    setTheme(nextTheme)
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }

  // Auto-load AI artifact JSON when tab changes and asset is ready
  useEffect(() => {
    const aiStatus = asset?.aiAnalysis?.status
    if (aiStatus !== "ready") return
    const key = activeTab
    const artifactKey = AI_ARTIFACT_URLS[key]
    if (!artifactKey) return
    const dataKey = key === "Viral Moments" ? "viralMoments" : key === "Style Analysis" ? "styleAnalysis" : "editPlan"
    if (aiData[dataKey] || aiLoading[key]) return

    setAiLoading((p) => ({ ...p, [key]: true }))
    fetch(`/api/uploads/${asset.assetId}/assets/${artifactKey}`)
      .then((r) => r.json())
      .then((json) => setAiData((p) => ({ ...p, [dataKey]: dataKey === "editPlan" ? attachRenderSettings(json, activeRenderSettings) : json })))
      .catch(() => {})
      .finally(() => setAiLoading((p) => ({ ...p, [key]: false })))
  }, [activeTab, asset?.aiAnalysis?.status, asset?.assetId, activeRenderSettings])

  // Auto-load scene analysis artifacts when Scene Analysis tab is active
  useEffect(() => {
    if (activeTab !== "Scene Analysis" || !asset?.assetId) return
    const ready = asset?.processingStatus === "ready" || asset?.sceneAnalysis
    if (!ready) return
    if (sceneTabData.sceneDetection || aiLoading["Scene Analysis"]) return

    setAiLoading((p) => ({ ...p, ["Scene Analysis"]: true }))
    Promise.all([
      fetch(`/api/uploads/${asset.assetId}/assets/scene-detection`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/uploads/${asset.assetId}/assets/face-detection`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/uploads/${asset.assetId}/assets/silence-detection`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([scene, face, silence]) => {
      setSceneTabData({ sceneDetection: scene, faceDetection: face, silenceDetection: silence })
    }).finally(() => setAiLoading((p) => ({ ...p, ["Scene Analysis"]: false })))
  }, [activeTab, asset?.assetId, asset?.processingStatus, asset?.sceneAnalysis])

  // Poll for AI analysis completion
  useEffect(() => {
    if (asset?.aiAnalysis?.status === "running") {
      const id = setInterval(async () => {
        try {
          const res = await fetch(`/api/uploads/${asset.assetId}/status`)
          const payload = await res.json()
          setAsset(payload.asset)
          if (payload.asset?.aiAnalysis?.status !== "running") clearInterval(id)
        } catch { clearInterval(id) }
      }, 3000)
      pollRef.current = id
      return () => clearInterval(id)
    }
  }, [asset?.aiAnalysis?.status, asset?.assetId])

  const waitForRenderReady = (assetId, renderId, options = {}) => new Promise((resolve, reject) => {
    if (renderPollRef.current) clearInterval(renderPollRef.current)

    renderPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/uploads/${assetId}/render/${renderId}/status`)
        if (!res.ok) throw new Error("Could not check render status.")
        const data = await res.json()
        setRenderJob(data)

        if (data.status === "ready") {
          clearInterval(renderPollRef.current)
          renderPollRef.current = null

          const url = `/api/uploads/${assetId}/assets/render:${renderId}`
          setRenderedVideoUrl(url)
          setWorkflowStep(4)

          if (options.renderRevision === undefined || options.renderRevision === editRevisionRef.current) {
            setTimelineDirty(false)
          }

          resolve(url)
        } else if (data.status === "failed") {
          clearInterval(renderPollRef.current)
          renderPollRef.current = null
          reject(new Error(data.error || "Render failed."))
        }
      } catch (err) {
        clearInterval(renderPollRef.current)
        renderPollRef.current = null
        reject(err)
      }
    }, 1000)
  })

  // Start video rendering with selected template or current manual timeline settings.
  const startVideoRender = async (assetId, settings, options = {}) => {
    try {
      setRenderJob({ status: "queued", progress: 0, settings })
      const res = await fetch(`/api/uploads/${assetId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to start render.")
      }
      const data = await res.json()
      setRenderJob({ ...data, progress: 0, settings })

      if (options.waitForReady) {
        return await waitForRenderReady(assetId, data.renderId, options)
      }

      pollRenderStatus(assetId, data.renderId, options)
      return data
    } catch (err) {
      console.error(err)
      setRenderJob({ status: "failed", error: err.message })
      throw err
    }
  }

  // Poll video rendering status
  const pollRenderStatus = (assetId, renderId, options = {}) => {
    waitForRenderReady(assetId, renderId, options).catch((err) => {
      console.error("Render poll error", err)
      setRenderJob((current) => ({ ...(current || {}), status: "failed", error: err.message }))
    })
  }

  const handleExport = async (url, filename) => {
    try {
      if (!url) throw new Error("No rendered video is ready yet.")
      const res = await fetch(url)
      if (!res.ok) throw new Error("Rendered video could not be downloaded.")
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error("Export failed", err)
      alert("Export failed: " + err.message)
    }
  }

  const saveCurrentEditPlan = async (planToSave) => {
    if (!asset?.assetId || !planToSave) throw new Error("No timeline is ready to render.")

    const res = await fetch(`/api/uploads/${asset.assetId}/edit-plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planToSave)
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.error || "Could not save timeline before rendering.")
    }

    return await res.json()
  }

  const renderCurrentMaster = async ({ download = false } = {}) => {
    if (!asset?.assetId) return null

    const currentPlan = attachRenderSettings(latestEditPlanRef.current || aiData.editPlan, activeRenderSettings)
    if (!currentPlan) throw new Error("No edit plan is loaded.")

    const renderRevision = editRevisionRef.current
    const savedPlan = await saveCurrentEditPlan(currentPlan)
    const planForRender = attachRenderSettings(savedPlan, currentPlan.settings)
    latestEditPlanRef.current = planForRender
    setAiData((p) => ({ ...p, editPlan: planForRender }))

    const url = await startVideoRender(asset.assetId, planForRender.settings || activeRenderSettings, {
      waitForReady: true,
      renderRevision
    })

    if (download && url && renderRevision === editRevisionRef.current) {
      await handleExport(url, `${file?.name || "master"}_manual_master.mp4`)
    } else if (download && renderRevision !== editRevisionRef.current) {
      throw new Error("Timeline changed during render. Render the master again to export the latest version.")
    }

    return url
  }

  const handleMasterExport = async () => {
    try {
      if (!timelineDirty && renderedVideoUrl) {
        await handleExport(renderedVideoUrl, `${file?.name || "master"}_manual_master.mp4`)
        return
      }

      await renderCurrentMaster({ download: true })
    } catch (err) {
      console.error("Master export failed", err)
      alert("Master export failed: " + err.message)
    }
  }

  const loadEditPlan = async () => {
    if (!asset?.assetId) return null
    if (aiData.editPlan) return aiData.editPlan

    setAiLoading((p) => ({ ...p, "Edit Plan": true }))
    try {
      const res = await fetch(`/api/uploads/${asset.assetId}/assets/edit-plan`)
      if (!res.ok) throw new Error("Edit plan is not ready yet.")
      const json = await res.json()
      const plan = attachRenderSettings(json, activeRenderSettings)
      setAiData((p) => ({ ...p, editPlan: plan }))
      return plan
    } catch (err) {
      console.error("Failed to load edit plan", err)
      return null
    } finally {
      setAiLoading((p) => ({ ...p, "Edit Plan": false }))
    }
  }

  const handleOpenManualAdjust = async () => {
    setActiveTab("Edit Plan")
    await loadEditPlan()
    setShowManualAdjust(true)
  }

  const handleLiveEditPlanChange = (plan) => {
    latestEditPlanRef.current = plan
    editRevisionRef.current += 1
    setTimelineDirty(true)
    setAiData((p) => ({ ...p, editPlan: plan }))
  }

  useEffect(() => () => {
    if (preview?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(preview.previewUrl)
    if (pollRef.current) clearInterval(pollRef.current)
    if (renderPollRef.current) clearInterval(renderPollRef.current)
  }, [preview])

  async function prepareFile(f) {
    if (!f) return
    if (preview?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(preview.previewUrl)
    setFile(f); setAsset(null); setPreview(null); setError(null); setAiData({ viralMoments: null, styleAnalysis: null, editPlan: null })
    setStage("analyzing"); setStatusMessage("Analyzing file headers and creating preview…")
    const val = validateVideoSelection({ name: f.name, size: f.size })
    setValidationErrors(val.errors)
    if (!val.valid) { setStage("failed"); setStatusMessage("File validation failed."); setError(val.errors[0]); return }
    setPreparing(true)
    try {
      const p = await extractVideoPreview(f)
      setPreview(p); setStage("idle"); setStatusMessage("Preview ready. Select your template to begin AI editing.")
    } catch (e) {
      setPreview(null); setStage("failed"); setStatusMessage("Browser could not generate a preview."); setError(e.message)
    } finally { setPreparing(false) }
  }

  async function loadSampleVideo() {
    try {
      const response = await fetch("/demo/portfolio-sample.webm")
      if (!response.ok) throw new Error("Sample video could not be loaded.")
      await prepareFile(new File([await response.blob()], "portfolio-sample.webm", { type: "video/webm" }))
    } catch (error) {
      setValidationErrors([error.message])
    }
  }

  async function handleUploadAndEdit(settings) {
    if (!file || validationErrors.length || preparing) return
    setSelectedTemplateSettings(settings)
    setWorkflowStep(3)
    
    const ctrl = new AbortController(); abortRef.current = ctrl
    const totalChunks = Math.max(1, Math.ceil(file.size / DEFAULT_CHUNK_SIZE_BYTES))
    try {
      setStage("uploading"); setUploadProgress(0); setStatusMessage("Creating secure upload session…"); setError(null)
      const session = await createUploadSession({ originalName: file.name, mimeType: file.type, fileSize: file.size, totalChunks }, ctrl.signal)
      setAsset(session.asset)
      
      await uploadFileInChunks({
        assetId: session.asset.assetId, file, chunkSize: DEFAULT_CHUNK_SIZE_BYTES, signal: ctrl.signal,
        onProgress: ({ percent, chunkIndex, totalChunks: tc, asset: a }) => {
          setAsset(a); setUploadProgress(percent); setStatusMessage(`Uploading block ${chunkIndex + 1} of ${tc}.`)
        }
      })
      const completion = await completeUploadSession(session.asset.assetId, ctrl.signal)
      setAsset(completion.asset); setUploadProgress(100); setStage("processing")
      setStatusMessage("Upload complete. Generating derivative proxies and Whisper transcription…")
      
      const final = await waitForProcessing(session.asset.assetId, {
        signal: ctrl.signal,
        onStatus: (a) => { setAsset(a); setStatusMessage(stageMsgOf(a)) }
      })
      
      if (final.processingStatus === "failed") throw new Error(final.errors?.[0] ?? "Processing failed.")
      setStage("ready")
      
      // Auto-trigger video rendering based on the template once analysis finishes
      setStatusMessage("AI analysis finished. Rendering final polished output…")
      await startVideoRender(session.asset.assetId, settings)
    } catch (e) {
      if (e?.name !== "AbortError") { setStage("failed"); setStatusMessage("Upload or edit did not finish cleanly."); setError(e.message); setWorkflowStep(1) }
    } finally { abortRef.current = null }
  }

  function reset() {
    abortRef.current?.abort(); abortRef.current = null
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (renderPollRef.current) { clearInterval(renderPollRef.current); renderPollRef.current = null }
    setFile(null); setPreview(null); setAsset(null); setValidationErrors([])
    setStage("idle"); setUploadProgress(0); setStatusMessage("Choose a file to begin."); setError(null)
    setAiData({ viralMoments: null, styleAnalysis: null, editPlan: null })
    setRenderJob(null); setRenderedVideoUrl(null); setTimelineDirty(false); setWorkflowStep(1); setShowManualAdjust(false)
    latestEditPlanRef.current = null
    editRevisionRef.current = 0
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function stageMsgOf(a) {
    const s = a?.processingStage
    if (s === "probing") return "Probing media properties."
    if (s === "video-derivatives") return "Transcoding high-speed proxy."
    if (s === "audio-extraction") return "Extracting master audio track."
    if (s === "transcription") return "Whisper is transcribing video speech…"
    if (s === "ai-analysis") return "Groq AI is analyzing script details…"
    if (s === "complete") return "Rendering video templates…"
    if (a?.processingStatus === "failed") return a?.errors?.[0] ?? "Processing failed."
    return "Analyzing video files…"
  }

  const proxyUrl = asset?.processingStatus === "ready" ? asset.previewUrls?.proxy : null
  const thumb = asset?.processingStatus === "ready" ? asset.previewUrls?.thumbnail : preview?.thumbnailDataUrl
  const aiStatus = asset?.aiAnalysis?.status
  const outputFrameStyle = getVideoFrameStyle(activeRenderSettings?.exportFormat, asset?.media ?? preview)
  const sourceFrameStyle = getVideoFrameStyle("original", preview, 42)
  const isRenderingMaster = renderJob?.status === "queued" || renderJob?.status === "running"
  const monitorShowsRenderedMaster = renderedVideoUrl && !timelineDirty && !isRenderingMaster

  const metrics = useMemo(() => [
    { label: "Size", value: file ? formatBytes(file.size) : null },
    { label: "Length", value: (asset?.media?.durationSec ?? preview?.durationSec) ? formatDuration(asset?.media?.durationSec ?? preview?.durationSec) : null },
    { label: "Dimen", value: (asset?.media?.width && asset?.media?.height) ? `${asset.media.width}×${asset.media.height}` : null },
    { label: "Rate", value: asset?.media?.frameRate ? `${asset.media.frameRate} fps` : null }
  ], [file, preview, asset])

  // Render CapCut editor workflow views
  return (
    <div className="min-h-screen bg-transparent transition-colors duration-300">
      
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-gray-300/40 dark:border-gray-800/40 neu-flat rounded-none bg-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md">
            AE
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-gray-800 dark:text-white leading-none">ASKEdits Studio</h1>
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-widest">AI Media Production Suite</p>
          </div>
        </div>

        {/* Workflow Tracker (Nav) */}
        <div className="hidden md:flex items-center gap-8 text-xs font-bold">
          <span className={`transition-all ${workflowStep === 1 ? "text-blue-600 dark:text-blue-400 scale-105" : "text-gray-400"}`}>1. Upload</span>
          <span className="text-gray-300 dark:text-gray-700">➔</span>
          <span className={`transition-all ${workflowStep === 2 ? "text-blue-600 dark:text-blue-400 scale-105" : "text-gray-400"}`}>2. Style Preset</span>
          <span className="text-gray-300 dark:text-gray-700">➔</span>
          <span className={`transition-all ${workflowStep === 3 ? "text-blue-600 dark:text-blue-400 scale-105" : "text-gray-400"}`}>3. Processing</span>
          <span className="text-gray-300 dark:text-gray-700">➔</span>
          <span className={`transition-all ${workflowStep === 4 ? "text-blue-600 dark:text-blue-400 scale-105" : "text-gray-400"}`}>4. Preview & Export</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          {file && <button onClick={reset} className="neu-btn px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-500">Reset</button>}
        </div>
      </header>

      {/* Main workspace container */}
      <main className="p-6">
        
        {/* Step 1: Upload Video */}
        {workflowStep === 1 && (
          <div className="max-w-2xl mx-auto space-y-6 pt-10">
            <div className="text-center space-y-2 mb-4">
              <h2 className="text-2xl font-extrabold tracking-tight text-gray-800 dark:text-white">Import Your Media</h2>
              <p className="text-xs text-gray-600 dark:text-gray-300 max-w-md mx-auto leading-relaxed">
                Import raw footage. ASKEdits generates compressed editing proxies and processes AI transcripts.
              </p>
            </div>

            <div 
              className={`p-10 neu-flat rounded-2xl flex flex-col items-center justify-center border-2 border-dashed transition-all duration-300 cursor-pointer ${
                drag ? "border-blue-500 bg-blue-500/5" : "border-gray-300 dark:border-gray-800"
              }`}
              role="button"
              tabIndex={0}
              aria-label="Choose a video file"
              aria-describedby="upload-help"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click() } }}
              onDragEnter={(e) => { e.preventDefault(); setDrag(true) }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false) }}
              onDrop={(e) => { e.preventDefault(); setDrag(false); prepareFile(e.dataTransfer.files?.[0]) }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl shadow-lg mb-4">
                📥
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Drag & Drop video file here</p>
              <p id="upload-help" className="text-xs text-gray-600 dark:text-gray-300 mt-1">Choose MP4, MOV, WebM, or MKV · Up to 2 GB</p>
              
              <div className="mt-6 flex flex-wrap justify-center gap-1.5 max-w-sm">
                {SUPPORTED_VIDEO_FORMATS.map((f) => (
                  <span key={f.extension} className="rounded-full bg-gray-200 dark:bg-gray-800 px-2.5 py-0.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">{f.label}</span>
                ))}
              </div>
              <input ref={fileInputRef} type="file" accept=".mp4,.mov,.webm,.mkv" aria-label="Video file" className="hidden" onChange={(e) => prepareFile(e.target.files?.[0])} />
            </div>

            <div className="text-center">
              <button onClick={loadSampleVideo} disabled={preparing} className="neu-btn px-5 py-3 text-sm font-semibold">Preview sample video</button>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-3">Try a local preview before choosing your own footage.</p>
            </div>

            {/* Validation errors / warnings */}
            {validationErrors.length > 0 && (
              <div role="alert" className="p-4 rounded-xl border border-rose-200/50 bg-rose-50 text-rose-600 text-xs font-semibold shadow-sm">
                ⚠️ {validationErrors[0]}
              </div>
            )}

            {/* If file loaded but not uploaded yet, show preview & step transition */}
            {preview && (
              <div className="neu-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🎬</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setWorkflowStep(2)} 
                    className="neu-btn-gradient px-6 py-2.5 text-xs font-bold tracking-wider uppercase"
                  >
                    Select Style Template ➔
                  </button>
                </div>
                {preview.thumbnailDataUrl && (
                  <div className="mx-auto overflow-hidden rounded-xl bg-black shadow-sm" style={sourceFrameStyle}>
                    <img src={preview.thumbnailDataUrl} alt="Thumbnail preview" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Choose Template */}
        {workflowStep === 2 && (
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setWorkflowStep(1)} className="neu-btn px-4 py-2 text-xs font-bold uppercase mb-6">⬅ Back to Upload</button>
            <EditorPanel assetId={asset?.assetId} onApplyTemplate={handleUploadAndEdit} />
          </div>
        )}

        {/* Step 3: AI Processing */}
        {workflowStep === 3 && (
          <div className="max-w-4xl mx-auto pt-8 grid md:grid-cols-[1fr_360px] gap-8">
            <div className="space-y-6">
              <div className="neu-card p-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">ASKEdits AI is Editing Your Video</h2>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">{statusMessage}</p>
                
                <div className="mt-8 mb-6">
                  {/* Neumorphic Circular Gauge */}
                  <NeuDonut 
                    percent={stage === "uploading" ? uploadProgress : renderJob?.progress ?? 50} 
                    label={stage === "uploading" ? "UPLOADING MEDIA" : "AI AUTO EDITING"}
                    sub={stage === "uploading" ? "Transporting chunks" : statusMessage}
                  />
                </div>
              </div>

              {/* Basic debug logs */}
              {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  Error: {error}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="neu-card p-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Pipeline Status</h3>
                <PipelineTracker
                  uploadStage={stage}
                  uploadProgress={uploadProgress}
                  processingStage={asset?.processingStage}
                  processingStatus={asset?.processingStatus}
                  processingProgress={asset?.processingProgress}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview & Action (CapCut Layout Shell) */}
        {workflowStep === 4 && (
          <div>
            {!showManualAdjust ? (
              // Simple clean review step before opening manual timeline
              <div className="max-w-3xl mx-auto space-y-6 pt-6">
                <div className="text-center max-w-md mx-auto space-y-1 mb-4">
                  <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white">Your Video is Ready!</h2>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    The AI Auto-Editor has finalized your video with the selected style.
                  </p>
                </div>

                <div className="neu-card p-6 flex flex-col items-center">
                  {renderedVideoUrl ? (
                    <div className="mx-auto overflow-hidden rounded-xl bg-black border border-gray-300 dark:border-gray-800 shadow-md" style={outputFrameStyle}>
                      <video ref={videoRef} src={renderedVideoUrl} controls autoPlay className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="mx-auto rounded-xl bg-gray-900 flex items-center justify-center text-white text-xs" style={outputFrameStyle}>Generating Render Proxy...</div>
                  )}

                  <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <button 
                      onClick={() => handleExport(renderedVideoUrl, `${file?.name || "edited"}_askedit.mp4`)}
                      className="neu-btn-gradient px-8 py-3.5 text-xs font-bold uppercase text-center tracking-widest shrink-0"
                    >
                      📥 EXPORT VIDEO OUTPUT
                    </button>
                    
                    <button
                      onClick={handleOpenManualAdjust}
                      className="neu-btn px-8 py-3.5 text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-200"
                    >
                      🛠️ ADJUST MANUALLY (TIMELINE)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // CapCut-style 3-Pane Full Workspace!
              <div className="grid gap-6 lg:grid-cols-[380px_1fr] items-start">
                
                {/* Left Panel: Feature Tabs */}
                <div className="neu-card p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-gray-300/40 dark:border-gray-800/40 pb-3">
                    <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">AI Tools Library</h2>
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">Ready</span>
                  </div>

                  {/* Horizontal Tabs Selection */}
                  <div className="flex flex-wrap gap-1 rounded-xl p-1 bg-gray-200 dark:bg-[#1a1f29] neu-inset">
                    {TABS.map((tab) => (
                      <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 min-w-[90px] rounded-lg py-2 text-[10px] font-extrabold uppercase transition-all duration-200 ${
                          activeTab === tab 
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        {tab.replace(" Analysis", "").replace(" Editor", "")}
                      </button>
                    ))}
                  </div>

                  {/* Tab Panel Content Box */}
                  <div className="min-h-[300px] max-h-[460px] overflow-y-auto pr-1">
                    {aiLoading[activeTab] ? (
                      <div className="flex justify-center py-12"><div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></div>
                    ) : (
                      <>
                        {activeTab === "Scene Analysis" && <SceneAnalysisPanel sceneData={sceneTabData.sceneDetection} faceData={sceneTabData.faceDetection} silenceData={sceneTabData.silenceDetection} />}
                        {activeTab === "Viral Moments" && <ViralMomentsPanel viralMoments={aiData.viralMoments} />}
                        {activeTab === "Style Analysis" && <StyleAnalysisPanel styleAnalysis={aiData.styleAnalysis} />}
                        {activeTab === "Edit Plan" && <EditPlanPanel editPlan={aiData.editPlan} />}
                        {activeTab === "AI Thumbnails" && <ThumbnailPanel assetId={asset.assetId} />}
                        {activeTab === "Hook Rewriter" && <HookRewriterPanel assetId={asset.assetId} onPlanUpdated={(plan) => {
                          const nextPlan = attachRenderSettings(plan, activeRenderSettings)
                          latestEditPlanRef.current = nextPlan
                          editRevisionRef.current += 1
                          setTimelineDirty(true)
                          setAiData(p => ({ ...p, editPlan: nextPlan }))
                        }} />}
                        {activeTab === "Co-Editor" && <CoEditorChat assetId={asset.assetId} onPlanUpdated={(plan) => {
                          const nextPlan = attachRenderSettings(plan, activeRenderSettings)
                          latestEditPlanRef.current = nextPlan
                          setAiData(p => ({ ...p, editPlan: nextPlan }))
                          startVideoRender(asset.assetId, nextPlan.settings || activeRenderSettings).catch((err) => {
                            console.error("Co-editor render failed", err)
                          })
                        }} />}
                      </>
                    )}
                  </div>
                </div>

                {/* Right Panel: Player Preview & Secondary Data */}
                <div className="space-y-6">
                  <div className="neu-card p-5">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Master Output Monitor</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          monitorShowsRenderedMaster
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-violet-500/10 text-violet-400"
                        }`}>
                          {monitorShowsRenderedMaster ? "Rendered Master" : "Live Timeline"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleMasterExport}
                          disabled={isRenderingMaster}
                          className="neu-btn px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400"
                        >
                          {isRenderingMaster ? `Rendering ${Math.round(renderJob?.progress || 0)}%` : timelineDirty ? "Render & Export Master" : "Export Master"}
                        </button>
                        <button 
                          onClick={() => setShowManualAdjust(false)} 
                          className="neu-btn px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                        >
                          Exit Timeline
                        </button>
                      </div>
                    </div>
                    {monitorShowsRenderedMaster ? (
                      <div className="mx-auto overflow-hidden rounded-xl bg-black shadow-inner relative" style={outputFrameStyle}>
                        <video ref={videoRef} src={renderedVideoUrl} controls className="h-full w-full object-contain" />
                      </div>
                    ) : proxyUrl && (
                      <div className="mx-auto overflow-hidden rounded-xl bg-black shadow-inner relative" style={outputFrameStyle}>
                        <LivePreviewPlayer 
                          ref={videoRef}
                          assetId={asset.assetId} 
                          editPlan={aiData.editPlan} 
                          silenceData={sceneTabData.silenceDetection}
                          videoUrl={proxyUrl}
                        />
                        {isRenderingMaster && (
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                            Rendering master {Math.round(renderJob?.progress || 0)}%
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Audio & Transcript Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {metrics.map((m) => <StatTile key={m.label} label={m.label} value={m.value} />)}
                  </div>
                </div>

              </div>
            )}
            
            {/* Bottom Panel: Multi-track Timeline Editor (Active when adjusting manually) */}
            {showManualAdjust && asset && (
              <div className="mt-8 neu-card p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">CapCut Multi-track Editor Timeline</h3>
                <TimelineEditor
                  assetId={asset.assetId}
                  initialEditPlan={aiData.editPlan}
                  videoRef={videoRef}
                  renderSettings={activeRenderSettings}
                  onEditPlanChange={handleLiveEditPlanChange}
                />
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
