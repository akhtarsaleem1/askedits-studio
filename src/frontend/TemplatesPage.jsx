import { Check, WandSparkles, ChevronRight } from "lucide-react"

import { useStudio } from "./StudioContext.jsx"
import { TemplateArt, PageLink } from "./StudioControls.jsx"

export default function TemplatesPage() {
  const {
    asset,
    settings,
    category,
    template,
    ready,
    availableTemplates,
    setCategory,
    selectTemplate
  } = useStudio()
  return (
    <main className="page-content templates-page">
      <div className="template-gallery">
        {" "}
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
      </div>
      <div className="page-next">
        <div className="selected-template-summary">
          <WandSparkles size={24} />
          <span>
            <strong>{template.name}</strong>
            <small>{template.description}</small>
          </span>
        </div>
        <PageLink
          page={ready ? "editor" : "projects"}
          className="primary-button"
        >
          {ready
            ? "Continue to editor"
            : asset
              ? "Check preparation"
              : "Add your footage"}
          <ChevronRight size={16} />
        </PageLink>
      </div>
    </main>
  )
}
