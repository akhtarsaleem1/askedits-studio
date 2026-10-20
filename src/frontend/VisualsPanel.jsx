import { useEffect, useRef, useState } from "react"
import {
  Film,
  Upload,
  Search,
  Plus,
  X,
  Loader2,
  WandSparkles,
  ExternalLink
} from "lucide-react"
import { useStudio } from "./StudioContext.jsx"
import { Select, Toggle } from "./StudioControls.jsx"
import { api, jsonRequest, formatTime } from "./studio-api.js"
import {
  referenceCards,
  referencePlacements
} from "../shared/reference-sequence.js"
const cueTime = (value) => {
  const ms = Math.round(value * 1000)
  return formatTime(ms / 1000) + "." + String(ms % 1000).padStart(3, "0")
}

export default function VisualsPanel() {
  const {
    asset,
    settings,
    plan,
    ready,
    busy,
    capabilities,
    change,
    setSettings,
    setAsset,
    setError,
    setNotice
  } = useStudio()
  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState("mixkit")
  const [kind, setKind] = useState("video")
  const [results, setResults] = useState([])
  const [working, setWorking] = useState(false)
  const [stockNote, setStockNote] = useState("")
  const [stockJob, setStockJob] = useState(null)
  const [finding, setFinding] = useState(false)
  const [stockRefresh, setStockRefresh] = useState(0)
  const uploadRef = useRef(null)
  const stockRef = useRef(null)
  const mounted = useRef(true)
  const activeProject = useRef(asset?.assetId)
  activeProject.current = asset?.assetId
  useEffect(() => {
    const id = asset?.assetId
    if (!id) return
    let stopped = false,
      timer
    setStockJob(null)
    const poll = async () => {
      try {
        const job = await api("/" + id + "/stock-job")
        if (stopped) return
        setStockJob(job)
        if (job?.status === "running") timer = setTimeout(poll, 1000)
        else if (job) {
          const { asset: fresh } = await api("/" + id + "/workspace")
          if (stopped) return
          setAsset((previous) =>
            previous?.assetId === id
              ? { ...previous, visualAssets: fresh.visualAssets }
              : previous
          )
          setSettings((previous) => ({
            ...previous,
            visualRevision: previous.visualRevision + 1
          }))
        }
      } catch (error) {
        if (!stopped) setStockNote(error.message)
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [asset?.assetId, stockRefresh])
  useEffect(() => {
    mounted.current = true
    const id = asset?.assetId
    if (id)
      api("/" + id + "/workspace")
        .then(({ asset: fresh }) => {
          if (mounted.current)
            setAsset((previous) =>
              previous?.assetId === id
                ? {
                    ...previous,
                    visualAssets: [
                      ...new Map(
                        [
                          ...(fresh.visualAssets ?? []),
                          ...(previous.visualAssets ?? [])
                        ].map((visual) => [visual.id, visual])
                      ).values()
                    ]
                  }
                : previous
            )
        })
        .catch(() => {})
    return () => {
      mounted.current = false
    }
  }, [asset?.assetId])
  const library = asset?.visualAssets ?? []
  const duration =
    plan?.summary.outputDurationSec ?? asset?.media?.durationSec ?? 0
  async function findFootage() {
    setFinding(true)
    const id = asset.assetId
    try {
      const job = await api(
        "/" + id + "/stock-job",
        jsonRequest({ settings, provider })
      )
      if (!mounted.current || activeProject.current !== id) return
      setStockJob(job)
      setSettings((previous) => ({
        ...previous,
        visualMode: "captions",
        transition: "auto",
        visualRevision: previous.visualRevision + 1
      }))
      setStockRefresh((value) => value + 1)
    } catch (error) {
      setError(error.message)
    } finally {
      setFinding(false)
    }
  }
  function place(visual) {
    if (settings.visualMode === "captions") {
      setSettings((previous) => ({
        ...previous,
        visualRevision: previous.visualRevision + 1
      }))
      return
    }
    const startSec = settings.visuals.length
      ? settings.visuals.at(-1).endSec + 0.5
      : Math.min(1.8, duration / 4)
    const endSec = Math.min(duration, startSec + 3)
    if (endSec - startSec < 0.15 || settings.visuals.length >= 12) {
      setError(
        "No room for another B-roll placement. Adjust the existing timings first."
      )
      return
    }
    change("visuals", [
      ...settings.visuals,
      {
        assetId: visual.id,
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
        clipStartSec: 0,
        label: visual.originalName.replace(/\.[^.]+$/, "").slice(0, 45)
      }
    ])
  }
  async function upload(file) {
    if (!file) return
    if (file.size > 80 * 1024 * 1024) {
      setError("Choose a B-roll file under 80 MB.")
      return
    }
    setWorking(true)
    try {
      const data = new FormData()
      data.append("visual", file)
      const { visual } = await api("/" + asset.assetId + "/visuals", {
        method: "POST",
        body: data
      })
      if (!mounted.current || activeProject.current !== asset.assetId) return
      setAsset((previous) => ({
        ...previous,
        visualAssets: [...(previous.visualAssets ?? []), visual]
      }))
      place(visual)
      setNotice(
        "B-roll added. Its original audio is muted; your narration continues."
      )
    } catch (error) {
      setError(error.message)
    } finally {
      setWorking(false)
      if (uploadRef.current) uploadRef.current.value = ""
    }
  }
  async function motionDemo() {
    setWorking(true)
    try {
      const { visual } = await api("/" + asset.assetId + "/visuals/demo", {
        method: "POST"
      })
      if (!mounted.current || activeProject.current !== asset.assetId) return
      setAsset((previous) => ({
        ...previous,
        visualAssets: [...(previous.visualAssets ?? []), visual]
      }))
      place(visual)
      setNotice(
        "Original motion sample added. Replace it with your own supporting footage when ready."
      )
    } catch (error) {
      setError(error.message)
    } finally {
      setWorking(false)
    }
  }
  async function search(event) {
    event.preventDefault()
    setWorking(true)
    setStockNote("")
    try {
      const response = await api(
        "/stock/search?" + new URLSearchParams({ q: query, provider, kind })
      )
      setResults(response.items)
      setStockNote(
        response.items.length
          ? response.note
          : "No supported results. Try a broader keyword, images instead of video, or your own B-roll."
      )
    } catch (error) {
      setStockNote(
        "Stock search could not connect. Check your connection/provider settings, or upload B-roll from your computer."
      )
      setResults([])
    } finally {
      setWorking(false)
    }
  }
  async function importStock(item) {
    setWorking(true)
    try {
      const { visual } = await api(
        "/" + asset.assetId + "/stock",
        jsonRequest({ resultId: item.id })
      )
      if (!mounted.current || activeProject.current !== asset.assetId) return
      setAsset((previous) => ({
        ...previous,
        visualAssets: [...(previous.visualAssets ?? []), visual]
      }))
      place(visual)
      setNotice(
        "Stock media imported. Source and license credits are included with the export."
      )
    } catch (error) {
      setError(error.message)
    } finally {
      setWorking(false)
    }
  }
  function autoPlace() {
    if (duration < 0.25) {
      setError("Choose a longer edit before placing B-roll.")
      return
    }
    const count = Math.min(
      6,
      library.length,
      Math.max(1, Math.floor(duration / 5))
    )
    const step = duration / (count + 1),
      length = Math.min(3, step * 0.8)
    setSettings((previous) => ({
      ...previous,
      visualMode: "manual",
      visuals: library.slice(0, count).map((visual, index) => ({
        assetId: visual.id,
        startSec: Math.round((step * (index + 1) - length / 2) * 100) / 100,
        endSec: Math.round((step * (index + 1) + length / 2) * 100) / 100,
        clipStartSec: 0,
        label: visual.originalName.replace(/\.[^.]+$/, "").slice(0, 45)
      }))
    }))
  }
  function buildReference() {
    const cards = referenceCards(
      plan?.captions ?? [],
      duration,
      settings.headline
    )
    setSettings((previous) => ({
      ...previous,
      layout: "reference",
      graphics: true,
      captionStyle: "kinetic",
      captionPosition: "middle",
      sfx: "punchy",
      visualMode: "manual",
      removeBackground: capabilities?.personMatte?.available === true,
      visuals: referencePlacements(cards, library, duration)
    }))
    setNotice(
      "Reference sequence built. Review the chapter titles, framing and captions, then render a preview."
    )
  }
  function syncCaptions() {
    if (!plan?.sourceCaptions?.length) {
      setError("Add timed captions or transcribe the recording first.")
      return
    }
    setSettings((previous) => ({
      ...previous,
      layout: "reference",
      graphics: true,
      captionStyle: "kinetic",
      captionPosition: "middle",
      visualMode: "captions",
      transition: "auto",
      cardTitles: [],
      visualRevision: previous.visualRevision + 1
    }))
    setNotice(
      "Caption sync enabled. Clip choices and transitions now follow your narration. Review the decisions below."
    )
  }
  async function describe(visual, value) {
    if (value.trim() === (visual.description ?? "")) return
    const id = asset.assetId
    setWorking(true)
    try {
      const result = await api(
        "/" + id + "/visuals/" + visual.id,
        jsonRequest({ description: value }, "PUT")
      )
      if (!mounted.current || activeProject.current !== id) return
      setAsset((previous) => ({
        ...previous,
        visualAssets: previous.visualAssets.map((v) =>
          v.id === visual.id ? result.visual : v
        )
      }))
      setSettings((previous) => ({
        ...previous,
        visualRevision: previous.visualRevision + 1
      }))
      setNotice("Clip description saved. Caption matching updated.")
    } catch (error) {
      setError(error.message)
    } finally {
      setWorking(false)
    }
  }
  function update(index, field, value) {
    change(
      "visuals",
      settings.visuals.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }
  return (
    <div className="visuals-panel">
      <Select
        label="Visual layout"
        value={settings.layout}
        onChange={(value) => change("layout", value)}
      >
        <option value="standard">Full-frame cutaways</option>
        <option value="presenter">Presenter + B-roll</option>
        <option value="reference">Reference explainer</option>
      </Select>
      <p className="control-hint">
        Reference explainer uses a large presenter, supporting visuals and
        animated topic cards throughout the edit.
      </p>
      <button
        className="primary-button full-width"
        disabled={!ready || busy || working}
        onClick={syncCaptions}
      >
        <WandSparkles size={14} />
        Sync edit to captions
      </button>
      {settings.visualMode === "captions" && (
        <section
          className="caption-decisions"
          aria-label="Caption editing decisions"
        >
          <p className="control-hint">
            {plan?.matchingEngine === "local-sentence-model"
              ? "Local sentence matching"
              : "Keyword matching"}{" "}
            · follows caption timing and library descriptions. Unmatched phrases
            keep the presenter. Captions, trims and clip descriptions update the
            decisions.
          </p>
          <button
            className="text-button"
            disabled={busy || working}
            onClick={() =>
              setSettings((previous) => ({
                ...previous,
                visualMode: "manual",
                visuals: (plan?.visuals ?? []).map(
                  ({
                    assetId,
                    startSec,
                    endSec,
                    clipStartSec,
                    label,
                    transition
                  }) => ({
                    assetId,
                    startSec,
                    endSec,
                    clipStartSec,
                    label,
                    transition
                  })
                )
              }))
            }
          >
            Keep these choices and edit manually
          </button>
          <details>
            <summary>
              Clip and transition decisions ·{" "}
              {plan?.visualDecisions?.length ?? 0}
            </summary>
            {(plan?.visualDecisions ?? []).map((decision) => (
              <article className="caption-decision" key={decision.cueId}>
                <small>
                  {formatTime(decision.startSec)}–{formatTime(decision.endSec)}
                </small>
                <blockquote>{decision.quote}</blockquote>
                <strong>
                  {decision.assetName ?? "Presenter + topic graphic"}
                </strong>
                <small>
                  {decision.transition} at {cueTime(decision.transitionAtSec)}
                </small>
                <p>{decision.reason}</p>
                <p>{decision.transitionReason}</p>
                {!decision.assetId && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery(decision.searchQuery)
                      if (stockRef.current) {
                        stockRef.current.open = true
                        stockRef.current.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest"
                        })
                      }
                    }}
                  >
                    Find stock for this phrase
                  </button>
                )}
              </article>
            ))}
          </details>
        </section>
      )}
      <button
        className="quiet-button full-width"
        disabled={!ready || busy || working}
        onClick={buildReference}
      >
        <WandSparkles size={14} />
        Build reference sequence
      </button>
      {settings.layout === "reference" && (
        <>
          <Toggle
            label="Remove presenter background"
            hint={
              capabilities?.personMatte?.available
                ? "Local person segmentation. The first render prepares a reusable mask."
                : "Local segmentation runtime is not installed on this server."
            }
            checked={settings.removeBackground}
            onChange={(value) => change("removeBackground", value)}
            disabled={!capabilities?.personMatte?.available}
          />
          <Toggle
            label="Crop existing source captions"
            hint="Crops the lower 24% and upper 14% before compositing. Review framing; embedded captions cannot be cleanly undone."
            checked={settings.sourceCropBottom > 0}
            onChange={(value) =>
              setSettings((previous) => ({
                ...previous,
                sourceCropTop: value ? 0.14 : 0,
                sourceCropBottom: value ? 0.24 : 0
              }))
            }
          />
          <label className="field">
            <span>Crop top · {Math.round(settings.sourceCropTop * 100)}%</span>
            <input
              aria-label="Source crop top"
              type="range"
              min="0"
              max="30"
              step="1"
              value={Math.round(settings.sourceCropTop * 100)}
              onChange={(e) =>
                change("sourceCropTop", Number(e.target.value) / 100)
              }
            />
          </label>
          <label className="field">
            <span>
              Crop bottom · {Math.round(settings.sourceCropBottom * 100)}%
            </span>
            <input
              aria-label="Source crop bottom"
              type="range"
              min="0"
              max="35"
              step="1"
              value={Math.round(settings.sourceCropBottom * 100)}
              onChange={(e) =>
                change("sourceCropBottom", Number(e.target.value) / 100)
              }
            />
          </label>
          <details className="stock-search chapter-titles">
            <summary>Chapter titles · {plan?.storyCards?.length ?? 0}</summary>
            {(plan?.storyCards ?? []).map((card, index) => (
              <label className="field" key={index}>
                <span>
                  {formatTime(card.startSec)} · {formatTime(card.endSec)}
                </span>
                <input
                  aria-label={"Chapter " + (index + 1) + " title"}
                  maxLength={60}
                  value={settings.cardTitles?.[index] ?? card.title}
                  onChange={(e) => {
                    const titles = [...(settings.cardTitles ?? [])]
                    while (titles.length <= index) titles.push("")
                    titles[index] = e.target.value
                    change("cardTitles", titles)
                  }}
                />
              </label>
            ))}
          </details>
        </>
      )}
      <Toggle
        label="Motion graphics"
        hint="Animated contour background, opening title, and numbered chapters"
        checked={settings.graphics}
        onChange={(value) => change("graphics", value)}
      />
      {settings.graphics && (
        <label className="field">
          <span>Opening headline</span>
          <input
            aria-label="Opening headline"
            maxLength={80}
            value={settings.headline}
            onChange={(event) => change("headline", event.target.value)}
          />
        </label>
      )}
      <div className="visual-section-heading">
        <strong>B-roll library</strong>
        <span>{library.length}/24</span>
      </div>
      <section className="internet-footage">
        <strong>Real footage from the internet</strong>
        <p className="control-hint">
          Download up to 4 relevant video clips, then sync them to your
          captions. Your uploaded video stays on this computer.
        </p>
        <Select
          label="Internet footage provider"
          value={provider}
          onChange={setProvider}
          disabled={finding || stockJob?.status === "running"}
        >
          <option value="mixkit">Selected Mixkit clips · no key</option>
          <option value="pexels" disabled={!capabilities?.stock?.pexels}>
            Pexels ·{" "}
            {capabilities?.stock?.pexels ? "connected" : "server key needed"}
          </option>
          <option value="commons">Wikimedia · no key</option>
        </Select>
        <button
          className="primary-button full-width"
          disabled={
            !ready ||
            busy ||
            working ||
            finding ||
            stockJob?.status === "running" ||
            library.length >= 24
          }
          onClick={findFootage}
        >
          {finding || stockJob?.status === "running" ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Search size={15} />
          )}
          Find &amp; add internet B-roll
        </button>
        {stockJob && (
          <div className="stock-note" role="status">
            <p>{stockJob.message}</p>
            {stockJob.status === "running" && (
              <>
                <small>
                  {stockJob.imported.length} clips added · {stockJob.completed}/
                  {stockJob.total || "…"} topics checked
                </small>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await api("/" + asset.assetId + "/stock-job/cancel", {
                        method: "POST"
                      })
                    } catch (error) {
                      setError(error.message)
                    }
                  }}
                >
                  Cancel downloads
                </button>
              </>
            )}
            {stockJob.warnings?.length > 0 && (
              <details>
                <summary>{stockJob.warnings.length} provider notices</summary>
                {stockJob.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </details>
            )}
          </div>
        )}
        <small className="control-hint">
          No-key collection: coding, business, education, travel, fitness and
          food. Caption topics select clips; preview to review the choices.
        </small>
      </section>
      <input
        ref={uploadRef}
        type="file"
        hidden
        accept=".mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.webp"
        aria-label="Upload B-roll"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <button
        className="quiet-button full-width"
        disabled={!ready || working || busy}
        onClick={() => uploadRef.current?.click()}
      >
        {working ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Upload size={14} />
        )}
        Upload footage or image
      </button>
      <button
        className="text-button"
        disabled={!ready || working || busy}
        onClick={motionDemo}
      >
        <WandSparkles size={14} />
        Try original motion sample
      </button>
      <small className="control-hint">
        Up to 80 MB per file. Videos and images use the same timed B-roll track.
      </small>
      {library.length > 0 && (
        <>
          <div className="visual-library">
            {library.map((visual) => (
              <div className="visual-library-entry" key={visual.id}>
                <div className="visual-library-item">
                  <img src={visual.thumbnail} alt="" />
                  <span>
                    <strong>{visual.originalName}</strong>
                    <small>
                      {visual.kind === "image"
                        ? "Image"
                        : formatTime(visual.durationSec)}{" "}
                      · {visual.source?.provider ?? "upload"}
                    </small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={"Place " + visual.originalName}
                    title="Add to timeline"
                    disabled={busy}
                    onClick={() => place(visual)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <label className="visual-description">
                  <span>What is in this clip?</span>
                  <textarea
                    aria-label={"Describe " + visual.originalName}
                    key={visual.description ?? ""}
                    defaultValue={visual.description ?? ""}
                    maxLength={500}
                    rows={2}
                    disabled={busy || working}
                    onBlur={(event) => describe(visual, event.target.value)}
                    placeholder="Describe subjects, actions and topics. Saves when you leave this field."
                  />
                </label>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={autoPlace} disabled={busy}>
            <WandSparkles size={14} />
            Auto-place library clips
          </button>
        </>
      )}
      <div className="visual-section-heading">
        <strong>B-roll timing</strong>
        <span>
          {settings.visualMode === "captions"
            ? (plan?.visuals?.length ?? 0)
            : settings.visuals.length}
          /12
        </span>
      </div>
      <p className="control-hint">
        {settings.visualMode === "captions"
          ? "Timing follows the spoken phrases. Keep the choices manually to adjust individual placements."
          : "Times refer to the edited video, after pause cuts. Numbered titles use each clip's label."}
      </p>
      {settings.visualMode !== "captions" &&
        settings.visuals.map((visual, index) => (
          <div className="visual-placement" key={index}>
            <div>
              <strong>
                {String(index + 1).padStart(2, "0")} ·{" "}
                {library.find((item) => item.id === visual.assetId)
                  ?.originalName ?? "B-roll"}
              </strong>
              <button
                className="icon-button"
                aria-label={"Remove B-roll " + (index + 1)}
                disabled={busy}
                onClick={() =>
                  change(
                    "visuals",
                    settings.visuals.filter((_, i) => i !== index)
                  )
                }
              >
                <X size={14} />
              </button>
            </div>
            <input
              aria-label={"B-roll " + (index + 1) + " label"}
              value={visual.label}
              maxLength={80}
              disabled={busy}
              onChange={(event) => update(index, "label", event.target.value)}
            />
            <div className="visual-timing-fields">
              {[
                { key: "startSec", name: "Start" },
                { key: "endSec", name: "End" },
                { key: "clipStartSec", name: "Source in" }
              ].map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.name} · sec</span>
                  <input
                    aria-label={
                      "B-roll " + (index + 1) + " " + field.name.toLowerCase()
                    }
                    type="number"
                    min={0}
                    step={0.1}
                    value={visual[field.key]}
                    disabled={busy}
                    onChange={(event) =>
                      update(index, field.key, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
            {settings.transition === "auto" && (
              <Select
                label={"B-roll " + (index + 1) + " transition"}
                value={visual.transition ?? "dissolve"}
                disabled={busy}
                onChange={(value) => update(index, "transition", value)}
              >
                <option value="cut">Clean cut</option>
                <option value="dissolve">Dissolve</option>
                <option value="slide">Slide</option>
              </Select>
            )}
          </div>
        ))}
      <details className="stock-search" ref={stockRef}>
        <summary>
          <Search size={14} />
          Find stock media
        </summary>
        <form onSubmit={search}>
          <Select
            label="Stock provider"
            value={provider}
            onChange={setProvider}
          >
            <option value="mixkit">Selected Mixkit clips · no key</option>
            <option value="commons">Wikimedia · no key</option>
            <option value="pexels">
              Pexels {capabilities?.stock?.pexels ? "" : "· server key needed"}
            </option>
          </Select>
          <Select label="Stock type" value={kind} onChange={setKind}>
            <option value="video">Videos</option>
            <option value="image">Images</option>
          </Select>
          <label className="field">
            <span>Search stock</span>
            <input
              aria-label="Search stock"
              placeholder="e.g. robot, city, technology"
              required
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="quiet-button full-width"
            type="submit"
            disabled={working || !query.trim()}
          >
            {working ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Search size={14} />
            )}
            Search library
          </button>
          <small className="control-hint">
            Only your search words go to the provider. Your footage stays local.
          </small>
        </form>
        {stockNote && (
          <p className="stock-note" role="status">
            {stockNote}
          </p>
        )}
        <div className="stock-results">
          {results.map((item) => (
            <article className="stock-result" key={item.id}>
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" loading="lazy" />
              ) : (
                <Film size={24} />
              )}
              <strong>{item.title}</strong>
              <small>
                {item.author} · {item.license}
              </small>
              <div>
                <a href={item.url} target="_blank" rel="noreferrer">
                  Source <ExternalLink size={12} />
                </a>
                <button
                  className="quiet-button"
                  disabled={!ready || working || busy}
                  onClick={() => importStock(item)}
                >
                  Use clip <Plus size={12} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <a
          className="text-button"
          href={
            provider === "mixkit"
              ? "https://mixkit.co/free-stock-video/"
              : provider === "pexels"
                ? "https://www.pexels.com/videos/"
                : "https://commons.wikimedia.org/"
          }
          target="_blank"
          rel="noreferrer"
        >
          {provider === "mixkit"
            ? "Footage by Mixkit"
            : provider === "pexels"
              ? "Stock by Pexels"
              : "Explore Wikimedia Commons"}
          <ExternalLink size={12} />
        </a>
      </details>
    </div>
  )
}
