// Timing is derived from narration. Media is selected by descriptions, never rotation.
const themes = [
  [
    "development",
    "app apps application applications software java flutter coding code developer development programming mobile website websites interface ui prototype prototypes"
  ],
  [
    "business",
    "business founder ceo entrepreneur entrepreneurship company brand branding portfolio studio showcase startup vision"
  ],
  [
    "research",
    "research artificial intelligence ai machine learning neural model models science laboratory"
  ],
  [
    "team",
    "team teamwork people together collaboration meeting leadership leaders community"
  ],
  [
    "education",
    "education graduate graduated university college student study studying school computer science"
  ],
  [
    "travel",
    "travel trip journey city beach mountains landscape tourism vacation ocean lake"
  ],
  ["food", "food cooking kitchen meal restaurant recipe chef eating"],
  [
    "fitness",
    "fitness exercise training workout gym running sport sports health"
  ],
  ["nature", "nature forest wildlife trees animals environment garden flowers"],
  [
    "finance",
    "money finance financial investing investment bank stock market budget savings"
  ],
  [
    "innovation",
    "innovation future technology ideas idea solution solutions problem problems product products digital"
  ]
].map(([id, words]) => ({ id, words: new Set(words.split(" ")) }))
const stop = new Set(
  "a an the i im i'm am is are was were be been being it its this that those these and or of for to in on at by with from as my our your their his her me we you they them but not just can could would should do does did has have had more most very into about then than also who which what where when how why someone something really".split(
    " "
  )
)
const clean = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
export const matchTokens = (text) =>
  clean(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stop.has(t))
const ids = (tokens) =>
  themes
    .filter((t) => tokens.some((word) => t.words.has(word)))
    .map((t) => t.id)
const rounded = (value) => Math.round(value * 1000) / 1000
export function visualDescription(asset) {
  return [asset.originalName?.replace(/\.[^.]+$/, ""), asset.description ?? ""]
    .filter(Boolean)
    .join(". ")
}
export function captionScenes(captions, duration, headline = "YOUR STORY") {
  const words = captions
    .flatMap((c) => {
      if (c.words?.length) return c.words
      const pieces = c.text.trim().split(/\s+/).filter(Boolean),
        step = (c.endSec - c.startSec) / Math.max(1, pieces.length)
      return pieces.map((text, i) => ({
        text,
        startSec: c.startSec + i * step,
        endSec: c.startSec + (i + 1) * step
      }))
    })
    .filter((w) => w.endSec > w.startSec && w.startSec < duration)
    .sort((a, b) => a.startSec - b.startSec)
  if (!words.length) return []
  const groups = []
  let current = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i],
      next = words[i + 1]
    current.push(word)
    const elapsed = word.endSec - current[0].startSec
    const currentTopics = ids(matchTokens(current.map((w) => w.text).join(" ")))
    const nextTopics = next ? ids(matchTokens(next.text)) : []
    const topicShift =
      elapsed >= 2.5 &&
      nextTopics.length &&
      !nextTopics.some((t) => currentTopics.includes(t))
    if (
      !next ||
      (elapsed >= 1.5 &&
        (/[.!?]$/.test(word.text) ||
          next.startSec - word.endSec > 0.5 ||
          topicShift ||
          elapsed >= 6.5))
    ) {
      groups.push(current)
      current = []
      if (groups.length === 19 && next) {
        groups.push(words.slice(i + 1))
        break
      }
    }
  }
  return groups.map((group, index) => {
    const text = group.map((w) => w.text).join(" "),
      tokens = matchTokens(text),
      topic = ids(tokens)[0] ?? "story"
    const startSec = index ? group[0].startSec : 0
    const endSec = groups[index + 1]?.[0].startSec ?? duration
    return {
      id: "cue-" + index,
      number: index + 1,
      startSec: rounded(startSec),
      endSec: rounded(endSec),
      text,
      topic,
      words: group,
      title:
        index === 0 && headline !== "THE NEXT BIG THING"
          ? headline
          : tokens.slice(0, 5).join(" ").toUpperCase() || "YOUR STORY",
      kicker: topic.toUpperCase(),
      searchQuery: tokens.slice(0, 7).join(" ")
    }
  })
}
export function rankVisual(scene, asset, semanticSimilarity) {
  const cue = matchTokens(scene.text),
    media = matchTokens(visualDescription(asset)),
    overlap = [...new Set(cue.filter((t) => media.includes(t)))]
  const cueThemes = ids(cue),
    mediaThemes = ids(media),
    sharedThemes = cueThemes.filter((t) => mediaThemes.includes(t))
  const lexical = Math.min(
    1,
    overlap.length * 0.24 + sharedThemes.length * 0.12
  )
  const semantic = Number.isFinite(semanticSimilarity)
    ? Math.max(0, semanticSimilarity)
    : null
  const literalScore =
    semantic === null ? lexical : semantic * 0.72 + lexical * 0.28
  // Curated stock illustrates a subject, rather than a named app or person.
  const thematic =
    asset.source?.provider === "mixkit" &&
    sharedThemes.length > 0 &&
    semantic !== null &&
    semantic >= 0.2
  const score = thematic
    ? Math.max(literalScore, 0.42 + Math.min(0.1, overlap.length * 0.025))
    : literalScore
  const anchor =
    scene.words.find((w) =>
      matchTokens(w.text).some((t) => overlap.includes(t))
    ) ??
    scene.words.find((w) =>
      ids(matchTokens(w.text)).some((t) => sharedThemes.includes(t))
    )
  return {
    score,
    overlap,
    sharedThemes,
    anchorSec: anchor?.startSec ?? scene.startSec,
    semantic,
    thematic: thematic && score > literalScore
  }
}
export function directCaptions({
  captions,
  assets,
  duration,
  headline,
  semanticScores = {}
}) {
  const scenes = captionScenes(captions, duration, headline),
    placements = [],
    decisions = []
  const uses = new Map()
  for (const scene of scenes) {
    const candidates = assets
      .map((asset) => ({
        asset,
        ...rankVisual(scene, asset, semanticScores[scene.id]?.[asset.id])
      }))
      .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id))
    const best = candidates.find(
      (c) =>
        (c.asset.kind !== "video" || c.asset.durationSec >= 0.6) &&
        c.score >= (c.semantic === null ? 0.34 : 0.38) &&
        ((uses.get(c.asset.id) ?? 0) < 2 || c.overlap.length >= 2)
    )
    let reason =
        "No sufficiently relevant library clip. Keep the presenter and topic graphic.",
      placement = null
    if (best && placements.length < 12) {
      const startSec = rounded(Math.max(scene.startSec, best.anchorSec - 0.06)),
        endSec = rounded(
          Math.min(
            duration,
            scene.endSec,
            startSec +
              (best.asset.kind === "video"
                ? Math.min(5, best.asset.durationSec)
                : 5)
          )
        )
      const previous = placements.at(-1)
      const transition =
        previous?.topic === scene.topic
          ? "cut"
          : best.asset.kind === "image"
            ? "dissolve"
            : "slide"
      if (
        endSec - startSec >= 0.6 &&
        (!previous || startSec >= previous.endSec)
      ) {
        reason =
          (best.thematic
            ? "Illustrative stock for the " + best.sharedThemes[0] + " topic"
            : best.overlap.length
              ? "Matched " + best.overlap.slice(0, 4).join(", ")
              : "Related sentence meaning") + "; enters at the spoken phrase."
        placement = {
          assetId: best.asset.id,
          startSec,
          endSec,
          clipStartSec: 0,
          label: scene.title.slice(0, 80),
          transition,
          topic: scene.topic
        }
        placements.push(placement)
        uses.set(best.asset.id, (uses.get(best.asset.id) ?? 0) + 1)
      }
    }
    decisions.push({
      cueId: scene.id,
      startSec: scene.startSec,
      endSec: scene.endSec,
      quote: scene.text,
      topic: scene.topic,
      searchQuery: scene.searchQuery,
      assetId: placement?.assetId ?? null,
      assetName: placement ? best.asset.originalName : null,
      matchScore: placement ? rounded(best.score) : null,
      transition: placement?.transition ?? "cut",
      transitionReason: !placement
        ? "Keep the presenter; no relevant clip is available."
        : placement.transition === "cut"
          ? "Same topic; use a clean visual cut while narration continues."
          : placement.transition === "dissolve"
            ? "Introduce a new still image with a short dissolve."
            : "Introduce footage at the topic change with a short slide.",
      transitionAtSec: placement?.startSec ?? scene.startSec,
      reason: placement
        ? reason
        : "No sufficiently relevant library clip. Keep the presenter and topic graphic."
    })
  }
  return { scenes, placements, decisions }
}
