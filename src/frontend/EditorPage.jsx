import VisualsPanel from "./VisualsPanel.jsx"
import {
  Clapperboard,
  Upload,
  Plus,
  ArrowUpRight,
  ChevronDown,
  Film,
  Scissors,
  Captions,
  Music2,
  SlidersHorizontal,
  WandSparkles,
  RotateCcw,
  X,
  Loader2,
  AlertCircle,
  Monitor,
  Smartphone,
  Square,
  Play,
  ChevronRight,
  Settings2
} from "lucide-react"

import { formatTime } from "./studio-api.js"

import { useStudio } from "./StudioContext.jsx"
import {
  Toggle,
  Select,
  RecipeSection,
  aspectRatio,
  PageLink
} from "./StudioControls.jsx"

export default function EditorPage() {
  const {
    asset,
    settings,
    plan,
    planError,
    planLoading,
    suggestions,
    job,
    renderHistory,
    tab,
    time,
    musicBusy,
    videoRef,
    fileRef,
    musicRef,
    srtRef,
    template,
    ready,
    busy,
    stale,
    editedView,
    playbackUrl,
    sourceDuration,
    playbackDuration,
    captionRows,
    canRender,
    inspectorTab,
    setInspectorTab,
    setSettings,
    setView,
    setTab,
    setTime,
    change,
    demo,
    render,
    cancelRender,
    editCaption,
    addCaption,
    seek
  } = useStudio()
  return (
    <main className="page-content editor-page">
      {ready ? (
        <div className="editor-layout">
          <section className="preview-panel">
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
                    : Math.min(job.output?.width, job.output?.height) +
                      "p export"
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
                      editedView
                        ? (job.urls.poster ?? undefined)
                        : ready
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
                  { id: "clips", name: "Find a clip", icon: Film }
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
                          {formatTime(
                            (plan?.summary.outputDurationSec ?? 0) / 2
                          )}
                        </span>
                        <span>
                          {formatTime(plan?.summary.outputDurationSec)}
                        </span>
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
                                  editedView
                                    ? shot.outputStartSec
                                    : shot.startSec
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
                      {plan?.visuals?.length > 0 && (
                        <div className="timeline-row broll-track">
                          <Film size={14} />
                          <div>
                            {plan.visuals.map((visual, index) => (
                              <span
                                key={index}
                                title={
                                  visual.label +
                                  " · " +
                                  formatTime(visual.startSec) +
                                  "–" +
                                  formatTime(visual.endSec)
                                }
                                style={{
                                  left:
                                    (visual.startSec /
                                      plan.summary.outputDurationSec) *
                                      100 +
                                    "%",
                                  width:
                                    ((visual.endSec - visual.startSec) /
                                      plan.summary.outputDurationSec) *
                                      100 +
                                    "%"
                                }}
                              >
                                {String(index + 1).padStart(2, "0")}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {plan?.sfx?.length > 0 && (
                        <div className="timeline-row sfx-track">
                          <Music2 size={14} />
                          <div>
                            {plan.sfx.map((cue, index) => (
                              <span
                                key={index}
                                style={{
                                  left:
                                    (cue.timeSec /
                                      plan.summary.outputDurationSec) *
                                      100 +
                                    "%"
                                }}
                                title={
                                  cue.type + " at " + formatTime(cue.timeSec)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      )}
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
                              editCaption(
                                index,
                                "endSec",
                                Number(e.target.value)
                              )
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
                          Showing the first 250 captions. All{" "}
                          {captionRows.length} captions are preserved in the
                          export.
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
                        Transcript-based suggestions are used when speech
                        captions are available.
                      </small>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="page-next compact-next">
              <PageLink page="templates" className="text-button">
                Change template
              </PageLink>
              <PageLink page="exports" className="primary-button">
                Review & export <ChevronRight size={16} />
              </PageLink>
            </div>
          </section>{" "}
          <aside className="settings-panel">
            <div className="panel-title">
              <span className="step-number">03</span>
              <h2>Edit settings</h2>
              <Settings2 size={15} />
            </div>
            <div
              className="inspector-tabs"
              role="tablist"
              aria-label="Edit settings"
            >
              {[
                { id: "framing", name: "Framing", icon: Monitor },
                { id: "pacing", name: "Pacing", icon: Scissors },
                { id: "captions", name: "Captions", icon: Captions },
                { id: "visuals", name: "Visuals", icon: Film },
                { id: "audio", name: "Audio", icon: Music2 }
              ].map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  id={"settings-" + item.id}
                  aria-selected={inspectorTab === item.id}
                  aria-controls="settings-content"
                  tabIndex={inspectorTab === item.id ? 0 : -1}
                  onKeyDown={(event) => {
                    const tabs = [
                      "framing",
                      "pacing",
                      "captions",
                      "visuals",
                      "audio"
                    ]
                    const index = tabs.indexOf(item.id)
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % 5
                        : event.key === "ArrowLeft"
                          ? (index + 4) % 5
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? 4
                              : -1
                    if (next >= 0) {
                      event.preventDefault()
                      setInspectorTab(tabs[next])
                      document.getElementById("settings-" + tabs[next])?.focus()
                    }
                  }}
                  onClick={() => setInspectorTab(item.id)}
                >
                  <item.icon size={16} />
                  {item.name}
                </button>
              ))}
            </div>
            <div
              id="settings-content"
              role="tabpanel"
              aria-labelledby={"settings-" + inspectorTab}
            >
              {" "}
              {inspectorTab === "framing" && (
                <RecipeSection
                  icon={SlidersHorizontal}
                  title="Canvas & framing"
                  open
                >
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
                        className={
                          settings.aspect === option.value ? "active" : ""
                        }
                        onClick={() => change("aspect", option.value)}
                      >
                        <option.icon size={17} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>

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
                          onChange={(e) =>
                            change("focalX", Number(e.target.value))
                          }
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
                          onChange={(e) =>
                            change("focalY", Number(e.target.value))
                          }
                        />
                      </label>
                    </>
                  )}
                </RecipeSection>
              )}
              {inspectorTab === "pacing" && (
                <RecipeSection icon={Scissors} title="Story & pacing" open>
                  <Select
                    label="Target length"
                    value={settings.duration}
                    onChange={(value) =>
                      change(
                        "duration",
                        value === "full" ? "full" : Number(value)
                      )
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
                        onChange={(e) =>
                          change("startSec", Number(e.target.value))
                        }
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
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
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
                    <option value="gentle">
                      Gentle · leave room to breathe
                    </option>
                    <option value="balanced">Balanced · keep it moving</option>
                    <option value="punchy">Punchy · tighter pauses</option>
                  </Select>
                  <Select
                    label="Scene transition"
                    value={settings.transition}
                    disabled={settings.visualMode === "captions"}
                    onChange={(value) => change("transition", value)}
                  >
                    <option value="template">Template default</option>
                    <option value="auto">Auto · per-clip transitions</option>
                    <option value="cut">Clean cut</option>
                    <option value="dissolve">Cross dissolve</option>
                    <option value="slide">Slide</option>
                    <option value="wipe">Wipe</option>
                    <option value="flash">Flash</option>
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
              )}
              {inspectorTab === "captions" && (
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
                    <option value="kinetic">Word by word · lime pop</option>
                  </Select>
                  <Select
                    label="Caption placement"
                    value={settings.captionPosition}
                    onChange={(value) => change("captionPosition", value)}
                  >
                    <option value="lower">Lower third</option>
                    <option value="middle">Middle · presenter layout</option>
                    <option value="upper">Top</option>
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
                    onClick={() => {
                      setTab("captions")
                      document
                        .querySelector(".editor-bottom")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                  >
                    Edit words & timing
                    <ArrowUpRight size={12} />
                  </button>
                </RecipeSection>
              )}
              {inspectorTab === "visuals" && <VisualsPanel />}
              {inspectorTab === "audio" && (
                <RecipeSection icon={Music2} title="Sound & music" open>
                  <Select
                    label="Transition sounds"
                    value={settings.sfx}
                    onChange={(value) => change("sfx", value)}
                  >
                    <option value="none">Off</option>
                    <option value="subtle">Subtle · soft whoosh & click</option>
                    <option value="punchy">
                      Punchy · whoosh, impact & click
                    </option>
                  </Select>
                  {settings.sfx !== "none" && (
                    <label className="range-field">
                      <span>
                        Sound effect level{" "}
                        <b>{Math.round(settings.sfxVolume * 100)}%</b>
                      </span>
                      <input
                        type="range"
                        aria-label="Sound effect volume"
                        min={0}
                        max={100}
                        value={settings.sfxVolume * 100}
                        onChange={(event) =>
                          change("sfxVolume", Number(event.target.value) / 100)
                        }
                      />
                    </label>
                  )}
                  <Toggle
                    label="Clean & level speech"
                    hint="Reduce noise and even out loudness"
                    checked={settings.voiceCleanup}
                    onChange={(value) => change("voiceCleanup", value)}
                  />
                  <label className="range-field">
                    <span>
                      Original audio{" "}
                      <b>{Math.round(settings.sourceVolume * 100)}%</b>
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
                    <option value="focus">
                      Soft Focus · original ambient bed
                    </option>
                    <option value="cinematic">
                      Slow Burn · original cinematic bed
                    </option>
                    <option value="pulse">
                      Momentum · original rhythmic bed
                    </option>
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
                          Music level{" "}
                          <b>{Math.round(settings.musicVolume * 100)}%</b>
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
              )}
            </div>
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
      ) : (
        <div className="page-empty">
          <Film size={32} />
          <h2>
            {asset
              ? "Your footage is still preparing."
              : "Start with your footage."}
          </h2>
          <p>
            {asset
              ? "Check preparation on the Projects page, then return here to edit."
              : "Add a video and choose a template to open your editing workspace."}
          </p>
          <PageLink page="projects" className="primary-button">
            Go to projects <ChevronRight size={16} />
          </PageLink>
        </div>
      )}
    </main>
  )
}
