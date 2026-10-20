import { useEffect, useMemo, useRef, useState } from "react"
import {
  Clapperboard,
  Plus,
  Check,
  ChevronDown,
  Scissors,
  WandSparkles,
  Download,
  FolderOpen,
  X,
  Loader2,
  AlertCircle
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
  completeUploadSession
} from "./utils/upload-client.js"
import { api, jsonRequest } from "./studio-api.js"

import { StudioContext } from "./StudioContext.jsx"
import { PageLink, friendlyFile } from "./StudioControls.jsx"
import {
  STUDIO_PAGES,
  readStudioLocation,
  studioHref
} from "./studio-navigation.js"
import ProjectsPage from "./ProjectsPage.jsx"
import TemplatesPage from "./TemplatesPage.jsx"
import EditorPage from "./EditorPage.jsx"
import ExportsPage from "./ExportsPage.jsx"

const blankSettings = () => defaultEditSettings("creator-punch")
const pending = (status) => ["queued", "running", "cancelling"].includes(status)
export default function Studio() {
  const [page, setPage] = useState(() => readStudioLocation().page)
  const [inspectorTab, setInspectorTab] = useState("framing")
  const headingRef = useRef(null)
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
  const [stockJob, setStockJob] = useState(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockRefresh, setStockRefresh] = useState(0)
  const completedStock = useRef("")
  const autoEnabled = useRef(settings.autoStock)
  autoEnabled.current = settings.autoStock
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const musicRef = useRef(null)
  const srtRef = useRef(null)
  const uploadController = useRef(null)
  const activeAsset = useRef(null)
  const template = getEditTemplate(settings.templateId)
  const ready = asset?.processingStatus === "ready"
  const renderBusy = renderStarting || Boolean(job && pending(job.status))
  const busy = renderBusy || stockLoading || stockJob?.status === "running"
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
  const automaticCaptionInput = JSON.stringify({
    start: settings.startSec,
    end: settings.endSec,
    duration: settings.duration,
    captions: settings.manualCaptions ?? plan?.sourceCaptions ?? []
  })

  useEffect(() => {
    if (!projectId) return
    const initialIds = new Set(
      (asset.visualAssets ?? []).map((visual) => visual.id)
    )
    let stopped = false,
      timer
    const poll = async () => {
      try {
        const current = await api("/" + projectId + "/stock-job")
        if (stopped) return
        setStockJob(current)
        if (current?.status === "running") timer = setTimeout(poll, 1000)
        else if (
          current &&
          completedStock.current !== projectId + current.id + current.status
        ) {
          const { asset: fresh } = await api("/" + projectId + "/workspace")
          if (stopped) return
          completedStock.current = projectId + current.id + current.status
          setAsset((previous) =>
            previous?.assetId === projectId
              ? { ...previous, visualAssets: fresh.visualAssets }
              : previous
          )
          if (fresh.visualAssets?.some((visual) => !initialIds.has(visual.id)))
            setSettings((previous) => ({
              ...previous,
              visualRevision: previous.visualRevision + 1
            }))
        }
      } catch (error) {
        if (!stopped) {
          setNotice(error.message)
          timer = setTimeout(poll, 3000)
        }
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [projectId, stockJob?.id, stockRefresh])

  useEffect(() => {
    if (
      !ready ||
      !capabilities?.stock?.pexels ||
      !settings.autoStock ||
      renderBusy ||
      stockJob?.status === "running" ||
      !(settings.manualCaptions ?? plan?.sourceCaptions)?.length
    )
      return
    if (settings.visualMode !== "captions" || settings.transition !== "auto") {
      setSettings((previous) => ({
        ...previous,
        visualMode: "captions",
        transition: "auto"
      }))
      return
    }
    let stopped = false
    setStockLoading(true)
    const timer = setTimeout(async () => {
      setStockLoading(true)
      try {
        const current = await api(
          "/" + projectId + "/auto-stock",
          jsonRequest({ settings })
        )
        if (
          stopped &&
          !autoEnabled.current &&
          activeAsset.current === projectId &&
          current?.status === "running"
        )
          await api("/" + projectId + "/stock-job/cancel", { method: "POST" })
        if (!stopped && activeAsset.current === projectId) setStockJob(current)
      } catch (error) {
        if (!stopped) setNotice("Automatic Pexels footage: " + error.message)
      } finally {
        if (activeAsset.current === projectId) setStockLoading(false)
      }
    }, 1200)
    return () => {
      stopped = true
      clearTimeout(timer)
      setStockLoading(false)
    }
  }, [
    projectId,
    ready,
    capabilities?.stock?.pexels,
    settings.autoStock,
    settings.visualMode,
    settings.transition,
    automaticCaptionInput,
    stockJob?.status,
    renderBusy
  ])

  async function findFootage(provider) {
    const id = projectId
    setStockLoading(true)
    try {
      const current = await api(
        "/" + id + "/stock-job",
        jsonRequest({ settings, provider })
      )
      if (activeAsset.current !== id) return
      setStockJob(current)
      setSettings((previous) => ({
        ...previous,
        visualMode: "captions",
        transition: "auto",
        visualRevision: previous.visualRevision + 1
      }))
      setStockRefresh((value) => value + 1)
    } catch (error) {
      if (activeAsset.current === id) setError(error.message)
    } finally {
      if (activeAsset.current === id) setStockLoading(false)
    }
  }
  async function cancelStock() {
    setSettings((previous) => ({ ...previous, autoStock: false }))
    try {
      await api("/" + projectId + "/stock-job/cancel", { method: "POST" })
      setStockRefresh((value) => value + 1)
    } catch (error) {
      setError(error.message)
    }
  }

  useEffect(() => {
    api("/capabilities")
      .then(setCapabilities)
      .catch((e) => setError(e.message))
    api("/projects")
      .then((data) => setProjects(data.projects))
      .catch(() => {})
    const id =
      readStudioLocation().project ||
      localStorage.getItem("askedits.currentProject")
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
  async function openProject(id, destination) {
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
      setStockJob(null)
      setStockLoading(false)
      setSourceName(data.asset.originalName)
      setSuggestions(data.suggestions)
      setSettings({
        ...defaultEditSettings(
          data.asset.draftSettings?.templateId ?? "creator-punch"
        ),
        ...(data.asset.draftSettings ?? {
          endSec: data.asset.media?.durationSec ?? null
        })
      })
      const history = [...(data.asset.renders ?? [])].reverse()
      setRenderHistory(history.filter((item) => item.status === "ready"))
      const latest =
        history.find((item) => pending(item.status)) ??
        history.find((item) => item.status === "ready")
      setJob(latest ?? null)
      setView(latest?.status === "ready" ? "edited" : "source")
      localStorage.setItem("askedits.currentProject", id)
      if (destination) navigate(destination, id)
    } catch (e) {
      localStorage.removeItem("askedits.currentProject")
      setError(e.message)
    }
  }
  function newProject() {
    uploadController.current?.abort()
    activeAsset.current = null
    navigate("projects", null)
    localStorage.removeItem("askedits.currentProject")
    setAsset(null)
    setJob(null)
    setStockJob(null)
    setStockLoading(false)
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
    const selectedTemplate = defaultEditSettings(settings.templateId)
    newProject()
    setSettings(selectedTemplate)
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
      manualCaptions: previous.manualCaptions,
      autoStock: previous.autoStock,
      removeBackground: previous.removeBackground,
      sourceCropTop: previous.sourceCropTop,
      sourceCropBottom: previous.sourceCropBottom,
      visuals: previous.visuals ?? []
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

  function navigate(destination, id = activeAsset.current) {
    const href = studioHref(destination, id)
    if (window.location.pathname + window.location.search !== href)
      window.history.pushState({}, "", href)
    setPage(destination)
    setProjectMenu(false)
  }
  useEffect(() => {
    const onPop = () => {
      const location = readStudioLocation()
      setPage(location.page)
      if (location.project && location.project !== activeAsset.current)
        openProject(location.project)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  useEffect(() => {
    if (
      projectId === activeAsset.current ||
      (!projectId && !activeAsset.current)
    )
      window.history.replaceState({}, "", studioHref(page, projectId))
  }, [page, projectId])
  useEffect(() => {
    document.title =
      STUDIO_PAGES.find((item) => item.id === page).title + " · ASKEdits Studio"
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [page])
  useEffect(() => {
    if (page === "projects")
      api("/projects")
        .then((data) => setProjects(data.projects))
        .catch(() => {})
  }, [page, ready])

  const currentPage = STUDIO_PAGES.find((item) => item.id === page)
  return (
    <StudioContext.Provider
      value={{
        capabilities,
        asset,
        settings,
        plan,
        planError,
        planLoading,
        suggestions,
        job,
        renderHistory,
        view,
        tab,
        category,
        error,
        notice,
        upload,
        localUrl,
        sourceName,
        time,
        autoCaptions,
        language,
        drag,
        projects,
        projectMenu,
        saved,
        musicBusy,
        renderStarting,
        videoRef,
        fileRef,
        musicRef,
        srtRef,
        template,
        ready,
        busy,
        preparing,
        fingerprint,
        stale,
        editedView,
        playbackUrl,
        sourceDuration,
        playbackDuration,
        availableTemplates,
        captionRows,
        projectId,
        canRender,
        finalReady,
        inspectorTab,
        setInspectorTab,
        setCapabilities,
        setAsset,
        setSettings,
        setPlan,
        setPlanError,
        setPlanLoading,
        setSuggestions,
        setJob,
        setRenderHistory,
        setView,
        setTab,
        setCategory,
        setError,
        setNotice,
        setUpload,
        setLocalUrl,
        setSourceName,
        setTime,
        setAutoCaptions,
        setLanguage,
        setDrag,
        setProjects,
        setProjectMenu,
        setSaved,
        setMusicBusy,
        setRenderStarting,
        stockJob,
        stockLoading,
        findFootage,
        cancelStock,
        change,
        openProject,
        newProject,
        ingest,
        demo,
        render,
        cancelRender,
        uploadMusic,
        importCaptions,
        editCaption,
        addCaption,
        selectTemplate,
        seek,
        navigate
      }}
    >
      <div
        className={"studio-app multipage-app page-" + page}
        style={{ "--accent": template.accent }}
      >
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
          <PageLink
            page="projects"
            className="studio-brand"
            aria-label="ASKEdits home"
          >
            <span className="brand-symbol">
              <Clapperboard size={19} />
            </span>
            <strong>
              ASK<span>Edits</span>
              <small>STUDIO</small>
            </strong>
          </PageLink>
          <div className="project-heading">
            <span className="header-divider" />
            <span>
              {sourceName ? friendlyFile(sourceName) : "Your story, refined"}
            </span>
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
            {" "}
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
                  FFmpeg 8+{" "}
                  <b>{capabilities?.ffmpeg ? "Ready" : "Install or upgrade"}</b>
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
            {busy && (
              <PageLink
                page="exports"
                className="quiet-button render-status-link"
              >
                <Loader2 size={14} className="spin" />
                Rendering {job?.progress ?? 0}%
              </PageLink>
            )}
            <button className="quiet-button new-project" onClick={newProject}>
              <Plus size={15} />
              New project
            </button>
          </div>
        </header>
        <nav className="page-navigation" aria-label="Studio pages">
          {[
            { id: "projects", label: "Projects", icon: FolderOpen },
            { id: "templates", label: "Templates", icon: WandSparkles },
            { id: "editor", label: "Editor", icon: Scissors },
            { id: "exports", label: "Exports", icon: Download }
          ].map((item, index) => (
            <PageLink
              key={item.id}
              page={item.id}
              className={"page-nav-link" + (page === item.id ? " active" : "")}
              aria-label={item.label}
              aria-current={page === item.id ? "page" : undefined}
            >
              <span className="nav-step">0{index + 1}</span>
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.id === "exports" && renderHistory.length > 0 && (
                <small>{renderHistory.length}</small>
              )}
            </PageLink>
          ))}
        </nav>
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">
              {page === "editor" && sourceName
                ? friendlyFile(sourceName)
                : "YOUR STORY, REFINED"}
            </span>
            <h1 ref={headingRef} tabIndex={-1}>
              {currentPage.title}
            </h1>
            <p>{currentPage.description}</p>
          </div>
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

        {(stockJob || stockLoading) && (
          <div
            className="message notice-message stock-progress"
            role="status"
            aria-label="Internet footage progress"
          >
            {stockLoading || stockJob?.status === "running" ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            <span>
              {stockLoading
                ? "Matching captions to Pexels footage…"
                : stockJob.message}
            </span>
            {stockJob?.provider === "pexels" && (
              <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
                Videos provided by Pexels
              </a>
            )}
            {stockJob?.status === "running" && (
              <button onClick={cancelStock}>Cancel downloads</button>
            )}
          </div>
        )}
        {page === "projects" && <ProjectsPage />}
        {page === "templates" && <TemplatesPage />}
        {page === "editor" && <EditorPage />}
        {page === "exports" && <ExportsPage />}
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
    </StudioContext.Provider>
  )
}
