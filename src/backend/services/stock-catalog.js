import { matchTokens } from "../../shared/caption-director.js"

// Small editorial selection, not a scraped stock library. Downloads are on demand.
const clips = [
  [
    "programmer-working-with-codes-on-a-computer-41637",
    "Programmer at two monitors",
    "A developer writes software code at a computer desk. Programming development coding applications technology.",
    "development innovation"
  ],
  [
    "computer-code-in-the-screen-9757",
    "Computer code on screen",
    "Close view of computer programming code. Software development coding website applications technology.",
    "development innovation"
  ],
  [
    "business-people-at-work-meeting-4809",
    "Team planning at work",
    "Office coworkers discussing charts and documents around laptops. Business company startup teamwork collaboration meeting.",
    "business team finance"
  ],
  [
    "students-walking-in-a-university-4519",
    "Students on a university campus",
    "Students with backpacks walking toward a university building. Education college school graduate study campus.",
    "education"
  ],
  [
    "business-person-working-with-devices-1814",
    "Working with phone and keyboard",
    "Hands working with a smartphone and keyboard at an office desk. Mobile phone business technology devices.",
    "development business innovation"
  ],
  [
    "flying-around-a-great-rocky-mountain-35941",
    "Mountain aerial",
    "Drone view around a rocky mountain with trees and surrounding scenery. Travel mountains nature landscape journey.",
    "travel nature"
  ],
  [
    "people-exercising-on-treadmills-in-a-gym-100529",
    "Treadmill training",
    "People exercising on treadmills in a gym. Fitness workout exercise running sport health training.",
    "fitness"
  ],
  [
    "cook-mixing-ingredients-in-a-mixture-43020",
    "Chef preparing ingredients",
    "Close view of a pastry chef mixing ingredients for a dessert. Food cooking kitchen recipe meal preparation.",
    "food"
  ],
  [
    "students-walking-through-a-college-4560",
    "Walking through college gardens",
    "Students carrying books and backpacks through a college garden. University education study school campus.",
    "education"
  ],
  [
    "chef-working-in-a-large-kitchen-43048",
    "Chef in a professional kitchen",
    "Chef pouring ingredients into an electric mixer in a professional kitchen. Cooking food bread recipe preparation.",
    "food"
  ]
]
export const STOCK_CATALOG = clips.map(([slug, title, description, topics]) => {
  const id = slug.match(/-(\d+)$/)[1]
  const base =
    id === "100529"
      ? `https://assets.mixkit.co/active_storage/video_items/${id}/1725383771/${id}-video`
      : `https://assets.mixkit.co/videos/${id}/${id}`
  return {
    title,
    description,
    topics: topics.split(" "),
    kind: "video",
    provider: "mixkit",
    author: "Mixkit",
    license: "Mixkit Stock Video Free License",
    licenseUrl: "https://mixkit.co/license/#videoFree",
    url: "https://mixkit.co/free-stock-video/" + slug + "/",
    thumbnail: base + "-thumb-720-0.jpg",
    mediaUrl: base + "-720.mp4"
  }
})
export function searchCatalog(query) {
  const tokens = matchTokens(query)
  return STOCK_CATALOG.map((item) => ({
    item,
    score: tokens.filter((token) =>
      matchTokens(
        item.title + " " + item.description + " " + item.topics.join(" ")
      ).includes(token)
    ).length
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
}
export function mixkitVideoMetadata(html, pageUrl) {
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let data
    try {
      data = JSON.parse(match[1])
    } catch {
      continue
    }
    const video = (data["@graph"] ?? [data]).find(
      (item) =>
        item["@type"] === "VideoObject" && item["@id"] === pageUrl + "#video"
    )
    if (video?.license !== "https://mixkit.co/license/#videoFree") continue
    if (
      video.contentUrl ===
      STOCK_CATALOG.find((item) => item.url === pageUrl)?.mediaUrl
    )
      return video
  }
  throw new Error(
    "This clip's free video license or download could not be verified. Choose another clip."
  )
}
