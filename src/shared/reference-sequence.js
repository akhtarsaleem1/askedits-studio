const topics = [
  [/computer|science|graduate|education/i, "COMPUTER SCIENCE", "FOUNDATION"],
  [
    /founder|entrepreneur|company|ceo|business/i,
    "BUILDING A VISION",
    "ENTREPRENEURSHIP"
  ],
  [
    /java|flutter|application|software|development/i,
    "IDEAS INTO APPS",
    "DEVELOPMENT"
  ],
  [/problem|solution|difference/i, "SOLVE REAL PROBLEMS", "PURPOSE"],
  [/people|team|together/i, "BUILD TOGETHER", "COLLABORATION"],
  [/intelligence|research|machine|\bai\b/i, "MOBILE + AI", "RESEARCH"],
  [/innovation|global|leadership/i, "THINK BEYOND", "INNOVATION"],
  [/future|hope|connect|opportunity/i, "WHAT COMES NEXT", "THE NEXT CHAPTER"]
]
export function referenceCards(captions, duration, headline = "YOUR STORY") {
  const count = Math.min(10, Math.max(1, Math.ceil(duration / 6)))
  const step = duration / count
  return Array.from({ length: count }, (_, index) => {
    const startSec = index * step,
      endSec = (index + 1) * step
    const words = captions.filter(
      (c) => c.startSec < endSec && c.endSec > startSec
    )
    const text = words.map((c) => c.text).join(" ")
    const topic = topics.find(([pattern]) => pattern.test(text))
    return {
      startSec,
      endSec,
      title:
        topic?.[1] ??
        (index === 0
          ? headline
          : text
              .split(/\s+/)
              .slice(0, 5)
              .join(" ")
              .replace(/[.,!?]/g, "")
              .toUpperCase() || "YOUR NEXT IDEA"),
      kicker: topic?.[2] ?? "THE STORY",
      number: index + 1
    }
  })
}
export function referencePlacements(cards, assets, duration) {
  if (!assets.length) return []
  return cards
    .filter((_, i) => i % 2 === 1 || cards.length === 1)
    .slice(0, 12)
    .map((card, index) => ({
      assetId: assets[index % assets.length].id,
      startSec: Math.round((card.startSec + 0.65) * 100) / 100,
      endSec:
        Math.round(
          Math.min(duration, card.endSec - 0.2, card.startSec + 5) * 100
        ) / 100,
      clipStartSec: 0,
      label: card.title
    }))
    .filter((v) => v.endSec - v.startSec >= 0.15)
}
