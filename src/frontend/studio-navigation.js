export const STUDIO_PAGES = [
  {
    id: "projects",
    title: "Your projects",
    description: "Start with your footage, or pick up where you left off."
  },
  {
    id: "templates",
    title: "Find your style",
    description: "Choose a starting point. You can fine-tune it in the editor."
  },
  {
    id: "editor",
    title: "Make it yours",
    description: "Refine the story, then preview your edit."
  },
  {
    id: "exports",
    title: "Ready to share",
    description:
      "Review your settings, export, and download your finished videos."
  }
]

export function readStudioLocation() {
  const url = new URL(window.location.href)
  const page = url.pathname.replace(/^\/+|\/+$/g, "")
  return {
    page: STUDIO_PAGES.some((item) => item.id === page) ? page : "projects",
    project: url.searchParams.get("project")
  }
}

export function studioHref(page, project) {
  return "/" + page + (project ? "?project=" + encodeURIComponent(project) : "")
}
