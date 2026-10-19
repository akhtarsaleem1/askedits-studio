import {
  Upload,
  ArrowUpRight,
  Film,
  RotateCcw,
  FolderOpen,
  Loader2,
  Play,
  ChevronRight
} from "lucide-react"

import { formatTime } from "./studio-api.js"
import { reprocessUploadSession } from "./utils/upload-client.js"
import { useStudio } from "./StudioContext.jsx"
import {
  Toggle,
  Select,
  friendlyFile,
  stageNames,
  PageLink
} from "./StudioControls.jsx"

export default function ProjectsPage() {
  const {
    capabilities,
    asset,
    upload,
    sourceName,
    autoCaptions,
    language,
    drag,
    projects,
    fileRef,
    ready,
    preparing,
    sourceDuration,
    projectId,
    setAsset,
    setError,
    setAutoCaptions,
    setLanguage,
    setDrag,
    openProject,
    ingest,
    demo
  } = useStudio()
  return (
    <main className="page-content projects-page">
      <div className="projects-intro">
        <div className="page-card intro-card">
          <span className="eyebrow">A CLEARER WAY TO CREATE</span>
          <h2>
            One great edit.
            <br />
            One step at a time.
          </h2>
          <p>Bring your footage. Find your style. Make it yours.</p>
          <div className="workflow-overview">
            <span>01 · Add footage</span>
            <span>02 · Choose a template</span>
            <span>03 · Refine your edit</span>
            <span>04 · Export & share</span>
          </div>
        </div>{" "}
        <section className="page-card upload-panel">
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
        </section>
      </div>
      {asset && (
        <div className="page-next">
          <span>
            <strong>{sourceName}</strong>
            <small>
              {ready
                ? "Your footage is ready. Find a style to get started."
                : "Preparing your footage. You can browse templates while you wait."}
            </small>
          </span>
          <PageLink page="templates" className="primary-button">
            Choose a template <ChevronRight size={16} />
          </PageLink>
        </div>
      )}
      <section className="recent-projects">
        <div className="section-heading">
          <h2>Recent projects</h2>
          <span>{projects.length} saved on this computer</span>
        </div>
        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => (
              <button
                className="project-card"
                key={project.assetId}
                onClick={() => openProject(project.assetId, "editor")}
              >
                <div className="project-thumbnail">
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <Film size={30} />
                  )}
                  <span>
                    {project.media
                      ? formatTime(project.media.durationSec)
                      : project.processingStatus}
                  </span>
                </div>
                <div>
                  <strong>{friendlyFile(project.originalName)}</strong>
                  <small>
                    {project.processingStatus === "ready"
                      ? "Open project"
                      : project.processingStatus}
                    <ArrowUpRight size={14} />
                  </small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="page-empty">
            <FolderOpen size={28} />
            <h3>A home for your stories.</h3>
            <p>Your uploaded projects will appear here.</p>
          </div>
        )}
      </section>
    </main>
  )
}
