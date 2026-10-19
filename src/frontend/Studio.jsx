import { useEffect, useMemo, useRef, useState } from "react"
import {
  Clapperboard,
  Upload,
  Plus,
  ArrowUpRight,
  Check,
  ChevronDown,
  Film,
  Scissors,
  Captions,
  Music2,
  Volume2,
  SlidersHorizontal,
  WandSparkles,
  Download,
  RotateCcw,
  FolderOpen,
  X,
  Loader2,
  AlertCircle,
  Monitor,
  Smartphone,
  Square,
  Play,
  Clock3,
  ChevronRight,
  Settings2
} from "lucide-react"
import {
  EDIT_TEMPLATES,
  defaultEditSettings,
  getEditTemplate
} from "../shared/edit-templates.js"
import { editFingerprint, parseSrt } from "../shared/edit-planner.js"
import {
  DEFAULT_CHUNK_SIZE_BYTES,
  validateVideoSelection
} from "../shared/upload-config.js"
import {
  createUploadSession,
  uploadFileInChunks,
  completeUploadSession,
  reprocessUploadSession
} from "./utils/upload-client.js"
import { api, jsonRequest, formatTime } from "./studio-api.js"

const blankSettings = () => defaultEditSettings("creator-punch")
const pending = (status) => ["queued", "running", "cancelling"].includes(status)
const stageNames = {
  probing: "Reading your footage",
  preview: "Building a smooth preview",
  "audio-analysis": "Finding pauses and leveling the source",
  transcription: "Transcribing speech locally",
  queued: "Preparing your footage"
}
function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={"toggle-row" + (disabled ? " disabled" : "")}>
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}
function Select({ label, value, onChange, children, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}
function TemplateArt({ template, compact = false }) {
  return (
    <div
      className={"template-art " + (compact ? "compact" : "")}
      style={{ background: template.gradient, "--art-accent": template.accent }}
      aria-hidden="true"
    >
      <div className={"art-frame art-" + template.kind}>
        <span />
        <span />
        <span />
      </div>
      <div className={"art-type type-" + template.captionStyle}>
        {template.kind === "speech"
          ? "A STORY\nWORTH SHARING."
          : "MAKE IT\nMEMORABLE."}
      </div>
      <div className="art-grain" />
      <span className="art-label">{template.category}</span>
    </div>
  )
}
function RecipeSection({ icon: Icon, title, children, open = false }) {
  return (
    <details className="recipe-section" open={open || undefined}>
      <summary>
        <Icon size={15} />
        <span>{title}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="recipe-content">{children}</div>
    </details>
  )
}
const aspectRatio = (settings, media) =>
  settings.aspect === "original"
    ? media
      ? media.width + " / " + media.height
      : "16 / 9"
    : settings.aspect.replace(":", " / ")
const friendlyFile = (name) =>
  name?.replace(/\.[^.]+$/, "") || "Untitled project"

export default function Studio() {
  const [capabilities, setCapabilities] = useState(null)
  const [asset, setAsset] = useState(null)
  const [settings, setSettings] = useState(blankSettings)
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState("")
  const [planLoading, setPlanLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [job, setJob] = useState(null)
  const [renderHistory, setRenderHistory] = useState([])
  const [view, setView] = useState("source")
  const [tab, setTab] = useState("timeline")
  const [category, setCategory] = useState("All styles")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [upload, setUpload] = useState(null)
  const [localUrl, setLocalUrl] = useState("")
  const [sourceName, setSourceName] = useState("")
  const [time, setTime] = useState(0)
  const [autoCaptions, setAutoCaptions] = useState(true)
  const [language, setLanguage] = useState("auto")
  const [drag, setDrag] = useState(false)
  const [projects, setProjects] = useState([])
  const [projectMenu, setProjectMenu] = useState(false)
  const [saved, setSaved] = useState(false)
  const [musicBusy, setMusicBusy] = useState(false)
  const [renderStarting, setRenderStarting] = useState(false)
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const musicRef = useRef(null)
  const srtRef = useRef(null)
  const uploadController = useRef(null)
  const activeAsset = useRef(null)
  const template = getEditTemplate(settings.templateId)
  const ready = asset?.processingStatus === "ready"
  const busy = renderStarting || (job && pending(job.status))
  const preparing =
    asset && ["queued", "processing"].includes(asset.processingStatus)
  const fingerprint = useMemo(() => {
    try {
      return ready ? editFingerprint(settings, asset.media) : null
    } catch {
      return null
    }
  }, [settings, ready, asset?.media])
  const stale = job?.status === "ready" && job.fingerprint !== fingerprint
  const editedView = view === "edited" && job?.status === "ready"
  const playbackUrl = editedView
    ? job.urls.video
    : ready
      ? asset.previewUrls.proxy
      : localUrl
  const sourceDuration = asset?.media?.durationSec || 0
  const playbackDuration = editedView ? job.output?.durationSec : sourceDuration
  const availableTemplates = EDIT_TEMPLATES.filter(
    (item) => category === "All styles" || item.category === category
  )
  const captionRows = settings.manualCaptions ?? plan?.sourceCaptions ?? []
  const projectId = asset?.assetId

  useEffect(() => {
    api("/capabilities")
      .then(setCapabilities)
      .catch((e) => setError(e.message))
    api("/projects")
      .then((data) => setProjects(data.projects))
      .catch(() => {})
    const id = localStorage.getItem("askedits.currentProject")
    if (id) openProject(id)
    return () => uploadController.current?.abort()
  }, [])
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl)
    },
    [localUrl]
  )
  useEffect(() => {
    if (
      !projectId ||
      !["queued", "processing"].includes(asset.processingStatus)
    )
      return
    let stopped = false,
      timer
    const poll = async () => {
      try {
        const data = await api("/" + projectId + "/workspace")
        if (stopped) return
        setAsset(data.asset)
        if (data.asset.processingStatus === "ready") {
          setSuggestions(data.suggestions)
          setSettings((previous) => ({
            ...previous,
            startSec: 0,
            endSec: data.asset.media.durationSec
          }))
          setUpload(null)
          setNotice("Footage is ready. Choose a template and render a preview.")
        } else if (data.asset.processingStatus === "failed") {
          setUpload(null)
          setError(data.asset.errors?.[0] || "Media preparation failed.")
        } else timer = setTimeout(poll, 900)
      } catch (e) {
        if (!stopped) {
          setError(e.message)
          timer = setTimeout(poll, 2000)
        }
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [projectId, asset?.processingStatus])
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    setSaved(false)
    setPlanLoading(true)
    const timer = setTimeout(async () => {
      try {
        const result = await api(
          "/" + projectId + "/plan",
          jsonRequest(settings, "POST", controller.signal)
        )
        if (controller.signal.aborted) return
        setPlan(result)
        setPlanError("")
        setPlanLoading(false)
        await api(
          "/" + projectId + "/draft",
          jsonRequest(settings, "PUT", controller.signal)
        )
        if (!controller.signal.aborted) setSaved(true)
      } catch (e) {
        if (e.name !== "AbortError") {
          setPlanError(e.message)
          setPlanLoading(false)
        }
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [settings, ready, projectId])
  useEffect(() => {
    if (!job || !pending(job.status) || !projectId) return
    let stopped = false,
      timer
    const id = job.renderId
    const poll = async () => {
      try {
        const current = await api("/" + projectId + "/renders/" + id)
        if (stopped) return
        setJob(current)
        if (current.status === "ready") {
          setView("edited")
          setRenderHistory((items) => [
            current,
            ...items.filter((item) => item.renderId !== current.renderId)
          ])
          setNotice(
            current.preview
              ? "Preview ready. Review it, then export in full quality."
              : "Your final video is ready to download."
          )
        } else if (current.status === "failed")
          setError(
            current.error ||
              "The export failed. You can adjust the recipe and try again."
          )
        else if (current.status === "cancelled")
          setNotice(
            "Render cancelled. Your footage and edit settings are saved."
          )
        else timer = setTimeout(poll, 900)
      } catch (e) {
        if (!stopped) {
          setError(e.message)
          timer = setTimeout(poll, 1800)
        }
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [job?.renderId, job?.status, projectId])

  function change(key, value) {
    setSettings((previous) => ({ ...previous, [key]: value }))
    setNotice("")
  }
  async function openProject(id) {
    uploadController.current?.abort()
    activeAsset.current = id
    setProjectMenu(false)
    setError("")
    setUpload(null)
    setPlan(null)
    setPlanError("")
    try {
      const data = await api("/" + id + "/workspace")
      if (activeAsset.current !== id) return
      setAsset(data.asset)
      setSourceName(data.asset.originalName)
      setSuggestions(data.suggestions)
      setSettings(
        data.asset.draftSettings ?? {
          ...blankSettings(),
          endSec: data.asset.media?.durationSec ?? null
        }
      )
      const history = [...(data.asset.renders ?? [])].reverse()
      setRenderHistory(history.filter((item) => item.status === "ready"))
      const latest =
        history.find((item) => pending(item.status)) ??
        history.find((item) => item.status === "ready")
      setJob(latest ?? null)
      setView(latest?.status === "ready" ? "edited" : "source")
      localStorage.setItem("askedits.currentProject", id)
    } catch (e) {
      localStorage.removeItem("askedits.currentProject")
      setError(e.message)
    }
  }
  function newProject() {
    uploadController.current?.abort()
    activeAsset.current = null
    localStorage.removeItem("askedits.currentProject")
    setAsset(null)
    setJob(null)
    setPlan(null)
    setRenderHistory([])
    setSuggestions([])
    setSettings(blankSettings())
    setLocalUrl("")
    setSourceName("")
    setUpload(null)
    setError("")
    setNotice("")
    setPlanError("")
    setView("source")
    setTime(0)
    if (fileRef.current) fileRef.current.value = ""
  }
  async function ingest(file) {
    if (!file) return
    const validation = validateVideoSelection({
      name: file.name,
      size: file.size
    })
    if (!validation.valid) {
      setError(validation.errors.join(" "))
      return
    }
    newProject()
    const controller = new AbortController()
    uploadController.current = controller
    setSourceName(file.name)
    setLocalUrl(URL.createObjectURL(file))
    setUpload({ percent: 0, label: "Uploading footage" })
    try {
      const session = await createUploadSession(
        {
          originalName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          totalChunks: Math.ceil(file.size / DEFAULT_CHUNK_SIZE_BYTES),
          transcriptionMode:
            autoCaptions && capabilities?.transcription.available
              ? "auto"
              : "off",
          language
        },
        controller.signal
      )
      activeAsset.current = session.asset.assetId
      setAsset(session.asset)
      localStorage.setItem("askedits.currentProject", session.asset.assetId)
      await uploadFileInChunks({
        assetId: session.asset.assetId,
        file,
        chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
        signal: controller.signal,
        onProgress: ({ percent }) =>
          setUpload({ percent, label: "Uploading footage" })
      })
      const complete = await completeUploadSession(
        session.asset.assetId,
        controller.signal
      )
      setAsset(complete.asset)
      setUpload({ percent: 100, label: "Preparing footage" })
      api("/projects")
        .then((data) => setProjects(data.projects))
        .catch(() => {})
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message)
        setUpload(null)
      }
    }
  }
  async function demo() {
    try {
      const response = await fetch("/demo/creator-demo.mp4")
      const isMp4 =
        response.ok &&
        response.headers.get("content-type")?.startsWith("video/")
      const fallback = isMp4
        ? response
        : await fetch("/demo/portfolio-sample.webm")
      if (
        !fallback.ok ||
        !fallback.headers.get("content-type")?.startsWith("video/")
      )
        throw new Error(
          "The demo video could not be loaded. Rebuild the studio assets and try again."
        )
      await ingest(
        new File(
          [await fallback.blob()],
          isMp4 ? "Studio-demo.mp4" : "Studio-demo.webm",
          { type: isMp4 ? "video/mp4" : "video/webm" }
        )
      )
    } catch (e) {
      setError(e.message)
    }
  }
  async function render(preview) {
    if (!ready || busy || planError || planLoading) return
    setError("")
    setNotice("")
    setRenderStarting(true)
    try {
      const response = await fetch(
        "/api/uploads/" + projectId + "/render",
        jsonRequest({ ...settings, preview })
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || "Could not start the render.")
      setJob(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setRenderStarting(false)
    }
  }
  async function cancelRender() {
    try {
      setJob(
        await api("/" + projectId + "/renders/" + job.renderId + "/cancel", {
          method: "POST"
        })
      )
    } catch (e) {
      setError(e.message)
    }
  }
  async function uploadMusic(file) {
    if (!file || !ready) return
    setMusicBusy(true)
    setError("")
    try {
      const form = new FormData()
      form.append("music", file)
      const result = await api("/" + projectId + "/music", {
        method: "POST",
        body: form
      })
      setAsset((previous) => ({ ...previous, music: result.music }))
      change("music", "custom")
    } catch (e) {
      setError(e.message)
    } finally {
      setMusicBusy(false)
    }
  }
  async function importCaptions(file) {
    if (!file) return
    try {
      const rows = parseSrt(await file.text())
      setSettings((previous) => ({
        ...previous,
        captions: true,
        manualCaptions: rows
      }))
      setTab("captions")
      setNotice(
        rows.length +
          " captions imported. Their timing follows your source footage."
      )
    } catch (e) {
      setError(e.message)
    }
  }
  function editCaption(index, key, value) {
    const rows = captionRows.map((row) => ({ ...row }))
    rows[index][key] = value
    change("manualCaptions", rows)
  }
  function addCaption() {
    const startSec = Math.max(
      settings.startSec || 0,
      Math.min(
        sourceDuration - 0.1,
        view === "source" ? time : settings.startSec || 0
      )
    )
    setSettings((previous) => ({
      ...previous,
      captions: true,
      manualCaptions: [
        ...captionRows,
        {
          startSec: Math.round(startSec * 100) / 100,
          endSec: Math.min(
            sourceDuration,
            Math.round((startSec + 2.5) * 100) / 100
          ),
          text: "Your caption"
        }
      ]
    }))
  }
  function selectTemplate(id) {
    const defaults = defaultEditSettings(id)
    setSettings((previous) => ({
      ...defaults,
      startSec: previous.startSec,
      endSec: previous.endSec,
      manualCaptions: previous.manualCaptions
    }))
    setNotice("")
  }
  function seek(seconds) {
    if (videoRef.current) videoRef.current.currentTime = seconds
  }
  const canRender =
    ready &&
    !busy &&
    !planError &&
    !planLoading &&
    capabilities?.ffmpeg &&
    capabilities?.ffprobe
  const finalReady = job?.status === "ready" && !job.preview && !stale

  return (
    <div className="studio-app" style={{ "--accent": template.accent }}>
      <input
        ref={fileRef}
        type="file"
        accept=".mp4,.mov,.webm,.mkv"
        hidden
        aria-label="Upload video"
        onChange={(e) => ingest(e.target.files?.[0])}
      />
      <input
        ref={musicRef}
        type="file"
        accept=".mp3,.wav,.m4a,.ogg,.flac,.aac"
        hidden
        aria-label="Upload music"
        onChange={(e) => uploadMusic(e.target.files?.[0])}
      />
      <input
        ref={srtRef}
        type="file"
        accept=".srt"
        hidden
        aria-label="Import SRT captions"
        onChange={(e) => importCaptions(e.target.files?.[0])}
      />
      <header className="studio-header">
        <a className="studio-brand" href="/" aria-label="ASKEdits home">
          <span className="brand-symbol">
            <Clapperboard size={19} />
          </span>
          <strong>
            ASK<span>Edits</span>
            <small>STUDIO</small>
          </strong>
        </a>
        <div className="project-heading">
          <span className="header-divider" />
          <span>{friendlyFile(sourceName)}</span>
          {ready && (
            <small className="saved-state">
              {saved ? (
                <>
                  <Check size={12} />
                  Saved locally
                </>
              ) : (
                "Saving…"
              )}
            </small>
          )}
        </div>
        <div className="header-actions">
          <details className="system-status">
            <summary>
              <span
                className={
                  "status-dot " +
                  (capabilities?.ffmpeg && capabilities?.ffprobe
                    ? "online"
                    : "")
                }
              />
              <span>
                {capabilities?.ffmpeg && capabilities?.ffprobe
                  ? "Local engine ready"
                  : "Check engine"}
                <ChevronDown size={12} />
              </span>
            </summary>
            <div className="status-popover">
              <strong>System status</strong>
              <p>
                FFmpeg <b>{capabilities?.ffmpeg ? "Ready" : "Not found"}</b>
              </p>
              <p>
                Media probe{" "}
                <b>{capabilities?.ffprobe ? "Ready" : "Not found"}</b>
              </p>
              <p>
                Local captions{" "}
                <b>
                  {capabilities?.transcription.available
                    ? "Ready · " + capabilities.transcription.model
                    : "Not installed"}
                </b>
              </p>
              <small>
                Videos stay on this computer. For automatic captions, install
                the Python requirements and restart the server. The first
                transcription may download a speech model.
              </small>
            </div>
          </details>
          <div className="project-menu-wrap">
            <button
              className="icon-button"
              title="Open recent project"
              aria-label="Open recent project"
              onClick={() => {
                setProjectMenu(!projectMenu)
                api("/projects")
                  .then((data) => setProjects(data.projects))
                  .catch(() => {})
              }}
            >
              <FolderOpen size={17} />
            </button>
            {projectMenu && (
              <div className="project-menu">
                <strong>Recent footage</strong>
                {projects.length ? (
                  projects.map((project) => (
                    <button
                      key={project.assetId}
                      onClick={() => openProject(project.assetId)}
                    >
                      <Film size={15} />
                      <span>
                        {project.originalName}
                        <small>
                          {project.media
                            ? formatTime(project.media.durationSec)
                            : project.processingStatus}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>Your uploaded videos will appear here.</p>
                )}
              </div>
            )}
          </div>
          <button className="quiet-button new-project" onClick={newProject}>
            <Plus size={15} />
            New project
          </button>
          {finalReady ? (
            <a className="primary-button" href={job.urls.video + "?download=1"}>
              <Download size={15} />
              Download MP4
            </a>
          ) : (
            <button
              className="primary-button"
              disabled={!canRender}
              onClick={() => render(false)}
            >
              {busy ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <ArrowUpRight size={16} />
              )}
              Export video
            </button>
          )}
        </div>
      </header>

      <div className="workspace-heading">
        <div>
          <span className="eyebrow">THE EDITING ROOM</span>
          <h1>
            {sourceName
              ? friendlyFile(sourceName)
              : "Good footage. Great stories."}
          </h1>
        </div>
        <p>Choose a style. Shape the story. Make the cut.</p>
      </div>
      {error && (
        <div className="message error-message" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="message notice-message" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="studio-layout">
        <aside className="template-panel">
          <div className="panel-title">
            <span className="step-number">01</span>
            <h2>Your footage</h2>
          </div>
          <button
            className={"upload-card" + (drag ? " drag-active" : "")}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              ingest(e.dataTransfer.files?.[0])
            }}
          >
            {sourceName ? (
              <>
                <Film size={22} />
                <strong>{sourceName}</strong>
                <small>
                  {ready
                    ? formatTime(sourceDuration) +
                      " · " +
                      asset.media.width +
                      " × " +
                      asset.media.height
                    : "Uploading & preparing"}
                  <span>Replace footage</span>
                </small>
              </>
            ) : (
              <>
                <Upload size={22} />
                <strong>Drop your video here</strong>
                <small>
                  or browse files <span>MP4, MOV, WebM, MKV · up to 2 GB</span>
                </small>
              </>
            )}
          </button>
          {!sourceName && (
            <button className="demo-button" onClick={demo}>
              <Play size={12} fill="currentColor" />
              Try demo footage
              <ArrowUpRight size={13} />
            </button>
          )}
          {!asset && (
            <div className="ingest-options">
              <Toggle
                label="Automatic captions"
                hint={
                  capabilities?.transcription.available
                    ? "Local speech recognition"
                    : "Use SRT or write captions if unavailable"
                }
                checked={
                  autoCaptions && Boolean(capabilities?.transcription.available)
                }
                disabled={!capabilities?.transcription.available}
                onChange={setAutoCaptions}
              />
              <Select
                label="Spoken language"
                value={language}
                onChange={setLanguage}
              >
                <option value="auto">Detect automatically</option>
                <option value="en">English</option>
                <option value="ur">Urdu</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
                <option value="es">Spanish</option>
              </Select>
            </div>
          )}
          {(upload || preparing) && (
            <div className="preparation-progress" role="status">
              <div>
                <Loader2 size={14} className="spin" />
                <strong>
                  {preparing
                    ? stageNames[asset.processingStage] || "Preparing footage"
                    : upload.label}
                </strong>
              </div>
              <progress
                max="100"
                value={preparing ? asset.processingProgress : upload.percent}
              />
              <small>
                {preparing ? asset.processingProgress : upload.percent}%
                {asset?.processingStage === "transcription"
                  ? " · First model download can take a few minutes"
                  : ""}
              </small>
            </div>
          )}
          {asset?.processingStatus === "failed" && (
            <button
              className="quiet-button full-width"
              onClick={async () => {
                try {
                  setError("")
                  const data = await reprocessUploadSession(projectId)
                  setAsset(data.asset)
                } catch (e) {
                  setError(e.message)
                }
              }}
            >
              <RotateCcw size={14} />
              Retry preparation
            </button>
          )}
          <div className="panel-title template-title">
            <span className="step-number">02</span>
            <h2>Pick your style</h2>
            <span className="count-pill">6</span>
          </div>
          <div className="category-tabs" aria-label="Template categories">
            {["All styles", "Talking head", "Cinematic", "Podcast"].map(
              (item) => (
                <button
                  key={item}
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              )
            )}
          </div>
          <div className="template-list">
            {availableTemplates.map((item) => (
              <button
                key={item.id}
                aria-pressed={settings.templateId === item.id}
                className={
                  "template-card" +
                  (settings.templateId === item.id ? " selected" : "")
                }
                onClick={() => selectTemplate(item.id)}
              >
                <TemplateArt template={item} compact />
                <div className="template-card-copy">
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </div>
                <span className="selection-dot">
                  {settings.templateId === item.id && <Check size={12} />}
                </span>
              </button>
            ))}
          </div>
          <div className="local-note">
            <span className="status-dot online" />
            Made on your machine. Your footage stays yours.
          </div>
        </aside>

        <main className="preview-panel">
          <div className="preview-toolbar">
            <div className="panel-title">
              <Monitor size={15} />
              <h2>Preview</h2>
            </div>
            <div className="segmented-control">
              <button
                className={!editedView ? "active" : ""}
                onClick={() => setView("source")}
              >
                Original
              </button>
              <button
                className={editedView ? "active" : ""}
                disabled={job?.status !== "ready"}
                onClick={() => setView("edited")}
              >
                Edited
              </button>
            </div>
            <span className="preview-quality">
              {editedView
                ? job.preview
                  ? "540p draft"
                  : job.output?.height + "p export"
                : "Source footage"}
            </span>
          </div>
          <div className="preview-stage">
            {playbackUrl ? (
              <div
                className={
                  "video-frame" +
                  (!editedView && settings.framing === "crop"
                    ? " crop-preview"
                    : "")
                }
                style={{
                  aspectRatio: editedView
                    ? job.dimensions.width + " / " + job.dimensions.height
                    : aspectRatio(settings, asset?.media)
                }}
              >
                <video
                  key={playbackUrl}
                  ref={videoRef}
                  src={playbackUrl}
                  poster={
                    !editedView && ready
                      ? asset.previewUrls.thumbnail
                      : undefined
                  }
                  controls
                  playsInline
                  preload="metadata"
                  style={
                    !editedView
                      ? {
                          objectFit:
                            settings.framing === "crop" ? "cover" : "contain",
                          objectPosition:
                            settings.focalX + "% " + settings.focalY + "%"
                        }
                      : undefined
                  }
                  onTimeUpdate={(e) => setTime(e.target.currentTime)}
                />
              </div>
            ) : (
              <div className="empty-stage">
                <div className="empty-film">
                  <div className="empty-clap">
                    <Clapperboard size={34} strokeWidth={1.2} />
                  </div>
                  <span className="empty-spark one" />
                  <span className="empty-spark two" />
                  <span className="empty-spark three" />
                </div>
                <h2>Your next great edit starts here.</h2>
                <p>
                  Add your footage, choose an editing recipe,
                  <br />
                  and turn the raw take into a finished story.
                </p>
                <button
                  className="primary-button"
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus size={15} />
                  Add footage
                </button>
                <button className="text-button" onClick={demo}>
                  Explore with demo footage
                  <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {busy && (
              <div className="render-overlay" role="status">
                <div className="render-icon">
                  <Clapperboard size={24} />
                </div>
                <h3>
                  {job?.preview
                    ? "Making your preview"
                    : "Making the final cut"}
                </h3>
                <p>
                  {job?.status === "queued"
                    ? "Queued for the local renderer"
                    : job?.status === "cancelling"
                      ? "Stopping the renderer…"
                      : "Applying the recipe to your footage"}
                </p>
                <progress value={job?.progress ?? 0} max="100" />
                <div>
                  <strong>{job?.progress ?? 0}%</strong>
                  {job && (
                    <button className="text-button" onClick={cancelRender}>
                      Cancel render
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="monitor-footer">
            <span>
              <span className="status-dot" />
              {editedView
                ? stale
                  ? "Previous render · recipe has changed"
                  : "Rendered output"
                : ready
                  ? "Original footage · render to apply the recipe"
                  : "Waiting for footage"}
            </span>
            <span>
              {formatTime(time)}
              <i>/</i>
              {formatTime(playbackDuration)}
            </span>
          </div>
          <div className="recipe-banner">
            <div className="recipe-mark">
              <WandSparkles size={18} />
            </div>
            <div>
              <small>YOUR EDITING RECIPE</small>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
            </div>
            <button
              className="secondary-button"
              disabled={!canRender}
              onClick={() => render(true)}
            >
              {busy ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Play size={13} />
              )}
              Render preview
            </button>
          </div>
          <div className="edit-summary">
            {[
              {
                label: "Source",
                value: sourceDuration
                  ? formatTime(
                      (settings.endSec ?? sourceDuration) - settings.startSec
                    )
                  : "—"
              },
              {
                label: "Edited",
                value: plan ? formatTime(plan.summary.outputDurationSec) : "—"
              },
              { label: "Shots", value: plan?.summary.shotCount ?? "—" },
              { label: "Captions", value: plan?.summary.captionCount ?? "—" }
            ].map((item) => (
              <div key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          {planError && (
            <div className="inline-warning" role="alert">
              <AlertCircle size={14} />
              {planError}
            </div>
          )}
          {ready && plan?.warnings?.length > 0 && (
            <details className="plan-notes">
              <summary>
                <AlertCircle size={12} />
                {plan.warnings.length} edit{" "}
                {plan.warnings.length === 1 ? "note" : "notes"}
                <ChevronDown size={12} />
              </summary>
              {plan.warnings.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </details>
          )}
          <div className="editor-bottom">
            <div className="bottom-tabs">
              {[
                { id: "timeline", name: "Timeline", icon: Scissors },
                { id: "captions", name: "Captions", icon: Captions },
                { id: "clips", name: "Find a clip", icon: Film },
                { id: "exports", name: "Exports", icon: Download }
              ].map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => setTab(item.id)}
                >
                  <item.icon size={14} />
                  {item.name}
                  {item.id === "exports" && renderHistory.length > 0 && (
                    <span>{renderHistory.length}</span>
                  )}
                </button>
              ))}
              {planLoading && (
                <Loader2 size={13} className="spin plan-spinner" />
              )}
            </div>
            {tab === "timeline" && (
              <div className="timeline-content">
                {ready ? (
                  <>
                    <div className="timeline-heading">
                      <span>THE CUT</span>
                      <small>
                        {plan?.summary.removedSeconds
                          ? formatTime(plan.summary.removedSeconds) +
                            " of source footage left out"
                          : "Your original story, refined"}{" "}
                        · Click a shot to review
                      </small>
                    </div>
                    <div className="timeline-ruler">
                      <span>0:00</span>
                      <span>
                        {formatTime((plan?.summary.outputDurationSec ?? 0) / 2)}
                      </span>
                      <span>{formatTime(plan?.summary.outputDurationSec)}</span>
                    </div>
                    <div className="timeline-row">
                      <Film size={14} />
                      <div className="shot-track">
                        {plan?.segments.map((shot, index) => (
                          <button
                            key={shot.id}
                            style={{
                              flex: shot.endSec - shot.startSec,
                              background: template.gradient
                            }}
                            title={
                              "Shot " +
                              (index + 1) +
                              ": source " +
                              formatTime(shot.startSec) +
                              "–" +
                              formatTime(shot.endSec)
                            }
                            onClick={() =>
                              seek(
                                editedView ? shot.outputStartSec : shot.startSec
                              )
                            }
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <small>
                              {formatTime(shot.endSec - shot.startSec)}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="timeline-row caption-track">
                      <Captions size={14} />
                      <div>
                        {plan?.captions.length ? (
                          plan.captions.map((caption) => (
                            <span
                              key={caption.id}
                              style={{
                                left:
                                  (caption.startSec /
                                    plan.summary.outputDurationSec) *
                                    100 +
                                  "%",
                                width:
                                  Math.max(
                                    0.5,
                                    ((caption.endSec - caption.startSec) /
                                      plan.summary.outputDurationSec) *
                                      100
                                  ) + "%"
                              }}
                              title={caption.text}
                            />
                          ))
                        ) : (
                          <small>
                            {settings.captions
                              ? "Add or import captions to fill this track"
                              : "Captions are switched off"}
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="timeline-row music-track">
                      <Music2 size={14} />
                      <div>
                        <span>
                          {asset.media.hasAudio
                            ? "Source audio"
                            : "Silent source"}
                          {settings.music !== "none" ? " + music" : ""}
                        </span>
                        <div className="waveform" aria-hidden="true">
                          {(asset.audio?.waveform ?? []).map((peak, i) => (
                            <i
                              key={i}
                              style={{ height: 2 + peak * 20 + "px" }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bottom-empty">
                    <Scissors size={23} />
                    <p>Your edit decisions will appear here.</p>
                    <small>Add footage to start building a timeline.</small>
                  </div>
                )}
              </div>
            )}
            {tab === "captions" && (
              <div className="captions-content">
                <div className="caption-actions">
                  <div>
                    <strong>Make every word readable.</strong>
                    <small>
                      Source timestamps are retimed automatically after cuts.
                    </small>
                  </div>
                  <button
                    className="quiet-button"
                    disabled={!ready}
                    onClick={() => srtRef.current?.click()}
                  >
                    <Upload size={13} />
                    Import SRT
                  </button>
                  <button
                    className="quiet-button"
                    disabled={!ready}
                    onClick={addCaption}
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
                {captionRows.length ? (
                  <div className="caption-rows">
                    {captionRows.slice(0, 250).map((row, index) => (
                      <div className="caption-row" key={index}>
                        <input
                          type="number"
                          min="0"
                          step=".1"
                          aria-label={"Caption " + (index + 1) + " start"}
                          value={row.startSec}
                          onChange={(e) =>
                            editCaption(
                              index,
                              "startSec",
                              Number(e.target.value)
                            )
                          }
                        />
                        <span>→</span>
                        <input
                          type="number"
                          min="0"
                          step=".1"
                          aria-label={"Caption " + (index + 1) + " end"}
                          value={row.endSec}
                          onChange={(e) =>
                            editCaption(index, "endSec", Number(e.target.value))
                          }
                        />
                        <input
                          aria-label={"Caption " + (index + 1) + " text"}
                          value={row.text}
                          onChange={(e) =>
                            editCaption(index, "text", e.target.value)
                          }
                        />
                        <button
                          className="icon-button"
                          aria-label={"Remove caption " + (index + 1)}
                          onClick={() =>
                            change(
                              "manualCaptions",
                              captionRows.filter((_, i) => i !== index)
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {captionRows.length > 250 && (
                      <small>
                        Showing the first 250 captions. All {captionRows.length}{" "}
                        captions are preserved in the export.
                      </small>
                    )}
                  </div>
                ) : (
                  <div className="bottom-empty">
                    <Captions size={23} />
                    <p>No captions yet.</p>
                    <small>
                      {asset?.transcript?.reason ||
                        "Upload speech footage with local transcription, import SRT, or add your own lines."}
                    </small>
                  </div>
                )}
                {settings.manualCaptions !== null && (
                  <button
                    className="text-button"
                    onClick={() => change("manualCaptions", null)}
                  >
                    <RotateCcw size={12} />
                    Use automatic transcript again
                  </button>
                )}
              </div>
            )}
            {tab === "clips" && (
              <div className="clips-content">
                <div className="caption-actions">
                  <div>
                    <strong>Find your next short.</strong>
                    <small>
                      Choose an excerpt, then shape it with any template.
                    </small>
                  </div>
                </div>
                {suggestions.length ? (
                  suggestions.map((clip, index) => (
                    <button
                      key={index}
                      className="suggestion-card"
                      onClick={() => {
                        setSettings((previous) => ({
                          ...previous,
                          startSec: clip.startSec,
                          endSec: clip.endSec,
                          duration: "full"
                        }))
                        setView("source")
                        seek(clip.startSec)
                        setTab("timeline")
                      }}
                    >
                      <span className="clip-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{clip.title}</strong>
                        <small>
                          {clip.basis} · {formatTime(clip.startSec)}–
                          {formatTime(clip.endSec)}
                        </small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                ) : (
                  <div className="bottom-empty">
                    <Film size={23} />
                    <p>Upload footage to find excerpts.</p>
                    <small>
                      Transcript-based suggestions are used when speech captions
                      are available.
                    </small>
                  </div>
                )}
              </div>
            )}
            {tab === "exports" && (
              <div className="exports-content">
                {renderHistory.length ? (
                  renderHistory.map((item) => (
                    <div className="export-card" key={item.renderId}>
                      <span className="export-icon">
                        <Film size={17} />
                      </span>
                      <span>
                        <strong>{getEditTemplate(item.templateId).name}</strong>
                        <small>
                          {item.preview ? "Draft preview" : "Final video"} ·{" "}
                          {formatTime(item.output?.durationSec)} ·{" "}
                          {item.dimensions?.width} × {item.dimensions?.height}
                        </small>
                      </span>
                      <button
                        className="quiet-button"
                        onClick={() => {
                          setJob(item)
                          setView("edited")
                        }}
                      >
                        View
                      </button>
                      <a
                        className="icon-button"
                        aria-label="Download this video"
                        href={item.urls.video + "?download=1"}
                      >
                        <Download size={15} />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="bottom-empty">
                    <Download size={23} />
                    <p>Your finished edits live here.</p>
                    <small>Render a preview or export a final video.</small>
                  </div>
                )}
              </div>
            )}
          </div>
          {job?.status === "ready" && (
            <div className="download-strip">
              <span>
                <Check size={14} />
                {job.preview ? "Preview" : "Final export"} ready
                {stale ? " · settings changed" : ""}
              </span>
              <a href={job.urls.video + "?download=1"}>
                <Download size={13} />
                MP4
              </a>
              <a href={job.urls.captions + "?download=1"}>Captions .srt</a>
              <a href={job.urls.plan + "?download=1"}>Edit decisions .json</a>
            </div>
          )}
        </main>

        <aside className="settings-panel">
          <div className="panel-title">
            <span className="step-number">03</span>
            <h2>Make it yours</h2>
            <Settings2 size={15} />
          </div>
          <RecipeSection icon={SlidersHorizontal} title="Canvas & framing" open>
            <span className="control-label">ASPECT RATIO</span>
            <div className="aspect-options">
              {[
                { value: "9:16", label: "9:16", icon: Smartphone },
                { value: "16:9", label: "16:9", icon: Monitor },
                { value: "1:1", label: "1:1", icon: Square },
                { value: "4:5", label: "4:5", icon: Film }
              ].map((option) => (
                <button
                  key={option.value}
                  aria-pressed={settings.aspect === option.value}
                  className={settings.aspect === option.value ? "active" : ""}
                  onClick={() => change("aspect", option.value)}
                >
                  <option.icon size={17} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <Select
              label="Output"
              value={settings.resolution}
              onChange={(value) => change("resolution", Number(value))}
            >
              <option value={1080}>Full HD · 1080p</option>
              <option value={720}>HD · 720p</option>
            </Select>
            <div className="segmented-control wide">
              <button
                className={settings.framing === "fit" ? "active" : ""}
                onClick={() => change("framing", "fit")}
              >
                Fit + soft background
              </button>
              <button
                className={settings.framing === "crop" ? "active" : ""}
                onClick={() => change("framing", "crop")}
              >
                Fill frame
              </button>
            </div>
            {settings.framing === "crop" && (
              <>
                <label className="range-field">
                  <span>
                    Subject position <b>{settings.focalX}%</b>
                  </span>
                  <input
                    type="range"
                    aria-label="Horizontal subject position"
                    min="0"
                    max="100"
                    value={settings.focalX}
                    onChange={(e) => change("focalX", Number(e.target.value))}
                  />
                </label>
                <label className="range-field">
                  <span>
                    Vertical position <b>{settings.focalY}%</b>
                  </span>
                  <input
                    type="range"
                    aria-label="Vertical subject position"
                    min="0"
                    max="100"
                    value={settings.focalY}
                    onChange={(e) => change("focalY", Number(e.target.value))}
                  />
                </label>
              </>
            )}
          </RecipeSection>
          <RecipeSection icon={Scissors} title="Story & pacing" open>
            <Select
              label="Target length"
              value={settings.duration}
              onChange={(value) =>
                change("duration", value === "full" ? "full" : Number(value))
              }
            >
              <option value="full">Full selected range</option>
              <option value={15}>Up to 15 seconds</option>
              <option value={30}>Up to 30 seconds</option>
              <option value={60}>Up to 60 seconds</option>
              <option value={90}>Up to 90 seconds</option>
            </Select>
            <div className="range-pair">
              <label className="field">
                <span>Start · seconds</span>
                <input
                  type="number"
                  min="0"
                  step=".1"
                  disabled={!ready}
                  value={settings.startSec}
                  onChange={(e) => change("startSec", Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>End · seconds</span>
                <input
                  type="number"
                  min=".1"
                  step=".1"
                  disabled={!ready}
                  value={settings.endSec ?? ""}
                  placeholder="Full video"
                  onChange={(e) =>
                    change(
                      "endSec",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </label>
            </div>
            <Select
              label="Pacing"
              value={settings.pace}
              onChange={(value) => change("pace", value)}
            >
              <option value="gentle">Gentle · leave room to breathe</option>
              <option value="balanced">Balanced · keep it moving</option>
              <option value="punchy">Punchy · tighter pauses</option>
            </Select>
            <Toggle
              label="Remove long pauses"
              hint={
                template.kind === "montage"
                  ? "Montage uses timed shot selection"
                  : "Keep a little breathing room around speech"
              }
              disabled={template.kind === "montage"}
              checked={settings.removeSilence}
              onChange={(value) => change("removeSilence", value)}
            />
            <Toggle
              label="Camera movement"
              hint={
                template.kind === "speech"
                  ? "Purposeful punch-ins between shots"
                  : "A subtle push within each shot"
              }
              checked={settings.motion}
              onChange={(value) => change("motion", value)}
            />
            <Toggle
              label="Template color grade"
              checked={settings.colorGrade}
              onChange={(value) => change("colorGrade", value)}
            />
          </RecipeSection>
          <RecipeSection icon={Captions} title="Caption styling" open>
            <Toggle
              label="Burn in captions"
              hint="Always retimed to your finished edit"
              checked={settings.captions}
              onChange={(value) => change("captions", value)}
            />
            <Select
              label="Style"
              value={settings.captionStyle}
              onChange={(value) => change("captionStyle", value)}
            >
              <option value="bold">Bold punch</option>
              <option value="clean">Clean subtitles</option>
              <option value="minimal">Minimal</option>
            </Select>
            <label className="color-field">
              <span>Accent color</span>
              <input
                type="color"
                aria-label="Caption accent color"
                value={settings.captionColor}
                onChange={(e) => change("captionColor", e.target.value)}
              />
              <small>{settings.captionColor}</small>
            </label>
            <button
              className="text-button"
              disabled={!ready}
              onClick={() => setTab("captions")}
            >
              Edit words & timing
              <ArrowUpRight size={12} />
            </button>
          </RecipeSection>
          <RecipeSection icon={Music2} title="Sound & music" open>
            <Toggle
              label="Clean & level speech"
              hint="Reduce noise and even out loudness"
              checked={settings.voiceCleanup}
              onChange={(value) => change("voiceCleanup", value)}
            />
            <label className="range-field">
              <span>
                Original audio <b>{Math.round(settings.sourceVolume * 100)}%</b>
              </span>
              <input
                type="range"
                min="0"
                max="150"
                aria-label="Original audio volume"
                value={settings.sourceVolume * 100}
                onChange={(e) =>
                  change("sourceVolume", Number(e.target.value) / 100)
                }
              />
            </label>
            <Select
              label="Music bed"
              value={settings.music}
              onChange={(value) => change("music", value)}
            >
              <option value="none">No music · source audio only</option>
              <option value="focus">Soft Focus · original ambient bed</option>
              <option value="cinematic">
                Slow Burn · original cinematic bed
              </option>
              <option value="pulse">Momentum · original rhythmic bed</option>
              {asset?.music && (
                <option value="custom">
                  Your track · {asset.music.originalName}
                </option>
              )}
            </Select>
            <button
              className="quiet-button full-width"
              disabled={!ready || musicBusy}
              onClick={() => musicRef.current?.click()}
            >
              {musicBusy ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Upload size={13} />
              )}
              Upload your own music
            </button>
            {settings.music !== "none" && (
              <>
                <label className="range-field">
                  <span>
                    Music level <b>{Math.round(settings.musicVolume * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    aria-label="Music volume"
                    value={settings.musicVolume * 100}
                    onChange={(e) =>
                      change("musicVolume", Number(e.target.value) / 100)
                    }
                  />
                </label>
                <small className="control-hint">
                  Music automatically lowers under your voice.
                </small>
              </>
            )}
          </RecipeSection>
          <div className="export-note">
            <Film size={17} />
            <div>
              <strong>Ready for the feed.</strong>
              <p>
                H.264 MP4 · AAC audio
                <br />
                Preview first. Export when it feels right.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <footer className="studio-footer">
        <span>
          ASKEDITS STUDIO <i> / </i> YOUR STORY, REFINED.
        </span>
        <span>
          <span className="status-dot online" />
          LOCAL WORKSPACE
        </span>
      </footer>
    </div>
  )
}
