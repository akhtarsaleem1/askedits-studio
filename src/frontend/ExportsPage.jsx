import {
  Clapperboard,
  ArrowUpRight,
  Film,
  Download,
  Loader2,
  ChevronRight
} from "lucide-react"
import { getEditTemplate } from "../shared/edit-templates.js"
import { formatTime } from "./studio-api.js"

import { useStudio } from "./StudioContext.jsx"
import { Select, TemplateArt, PageLink } from "./StudioControls.jsx"

export default function ExportsPage() {
  const {
    settings,
    plan,
    planError,
    job,
    renderHistory,
    sourceName,
    template,
    ready,
    busy,
    stale,
    canRender,
    finalReady,
    setJob,
    setView,
    change,
    render,
    cancelRender
  } = useStudio()
  return (
    <main className="page-content exports-page">
      {ready ? (
        <>
          <div className="export-layout">
            <section className="page-card export-review">
              <div className="section-heading">
                <h2>Your final edit</h2>
                <PageLink page="editor" className="text-button">
                  Back to editor <ArrowUpRight size={14} />
                </PageLink>
              </div>
              <div className="export-recipe">
                <TemplateArt template={template} compact />
                <span>
                  <strong>{template.name}</strong>
                  <small>
                    {formatTime(plan?.summary.outputDurationSec)} ·{" "}
                    {plan?.summary.shotCount ?? "—"} shots · {settings.aspect}
                  </small>
                  <small>{sourceName}</small>
                </span>
              </div>
              <Select
                label="Output"
                value={settings.resolution}
                onChange={(value) => change("resolution", Number(value))}
              >
                <option value={1080}>Full HD · 1080p</option>
                <option value={720}>HD · 720p</option>
              </Select>
              <div className="export-detail">
                <span>Format</span>
                <strong>MP4 · H.264 / AAC</strong>
              </div>
              <div className="export-detail">
                <span>Captions</span>
                <strong>
                  {settings.captions
                    ? (plan?.summary.captionCount ?? 0) + " lines"
                    : "Off"}
                </strong>
              </div>
              {planError && (
                <p className="inline-warning" role="alert">
                  {planError}
                </p>
              )}
              {busy ? (
                <div className="export-progress" role="status">
                  <Loader2 className="spin" size={22} />
                  <strong>
                    {job?.preview
                      ? "Rendering your preview"
                      : "Rendering your final video"}
                  </strong>
                  <progress max="100" value={job?.progress ?? 0} />
                  <span>{job?.progress ?? 0}% · You can keep browsing.</span>
                  <button className="quiet-button" onClick={cancelRender}>
                    Cancel render
                  </button>
                </div>
              ) : finalReady ? (
                <a
                  className="primary-button full-width"
                  href={job.urls.video + "?download=1"}
                >
                  <Download size={16} />
                  Download MP4
                </a>
              ) : (
                <button
                  className="primary-button full-width"
                  disabled={!canRender}
                  onClick={() => render(false)}
                >
                  <ArrowUpRight size={16} />
                  Export video
                </button>
              )}
              <p className="control-hint">
                Your original video stays untouched. Finished files are saved on
                this computer.
              </p>
            </section>
            <section className="page-card export-preview">
              <div className="section-heading">
                <h2>
                  {job?.status === "ready"
                    ? stale
                      ? "Previous render"
                      : job.preview
                        ? "Latest preview"
                        : "Finished video"
                    : "Your finished video"}
                </h2>
              </div>
              {job?.status === "ready" ? (
                <>
                  <video
                    key={job.urls.video}
                    src={job.urls.video}
                    poster={job.urls.poster ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  {stale && (
                    <p className="inline-warning">
                      Settings changed since this render. Export again to apply
                      your latest edit.
                    </p>
                  )}
                  <div className="export-downloads">
                    {job.urls.credits && (
                      <a
                        className="quiet-button"
                        href={job.urls.credits + "?download=1"}
                      >
                        Media credits <Download size={14} />
                      </a>
                    )}
                    <a
                      className="quiet-button"
                      href={job.urls.captions + "?download=1"}
                    >
                      Captions .srt <Download size={14} />
                    </a>
                    <a
                      className="quiet-button"
                      href={job.urls.plan + "?download=1"}
                    >
                      Edit decisions .json <Download size={14} />
                    </a>
                  </div>
                </>
              ) : (
                <div className="page-empty">
                  <Clapperboard size={34} />
                  <p>
                    {busy
                      ? "Your video will appear here when rendering is complete."
                      : "Export your edit to see the finished video here."}
                  </p>
                </div>
              )}
            </section>
          </div>
          <section className="page-card export-history">
            <div className="section-heading">
              <h2>Export history</h2>
              <span>{renderHistory.length} renders</span>
            </div>
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
                      disabled={busy}
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
          </section>
        </>
      ) : (
        <div className="page-empty">
          <Download size={32} />
          <h2>Your finished videos will live here.</h2>
          <p>Start a project and make your first edit.</p>
          <PageLink page="projects" className="primary-button">
            Go to projects <ChevronRight size={16} />
          </PageLink>
        </div>
      )}
    </main>
  )
}
