import { ChevronDown } from "lucide-react"
import { useStudio } from "./StudioContext.jsx"
import { studioHref } from "./studio-navigation.js"
export const stageNames = {
  probing: "Reading your footage",
  preview: "Building a smooth preview",
  "audio-analysis": "Finding pauses and leveling the source",
  transcription: "Transcribing speech locally",
  queued: "Preparing your footage"
}
export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={"toggle-row" + (disabled ? " disabled" : "")}>
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}
export function Select({ label, value, onChange, children, disabled }) {
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
export function TemplateArt({ template, compact = false }) {
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
export function RecipeSection({ icon: Icon, title, children, open = false }) {
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
export const aspectRatio = (settings, media) =>
  settings.aspect === "original"
    ? media
      ? media.width + " / " + media.height
      : "16 / 9"
    : settings.aspect.replace(":", " / ")
export const friendlyFile = (name) =>
  name?.replace(/\.[^.]+$/, "") || "Untitled project"

export function PageLink({ page, children, ...props }) {
  const { navigate, projectId } = useStudio()
  return (
    <a
      {...props}
      href={studioHref(page, projectId)}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault()
          navigate(page)
        }
      }}
    >
      {children}
    </a>
  )
}
