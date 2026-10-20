import test from "node:test"
import assert from "node:assert/strict"
import { directCaptions } from "../src/shared/caption-director.js"
import { buildEditPlan } from "../src/shared/edit-planner.js"
import { defaultEditSettings } from "../src/shared/edit-templates.js"

const app = {
  id: "a".repeat(32),
  originalName: "Mobile apps.png",
  description: "Java Flutter app interfaces and software development projects",
  kind: "image"
}
const beach = {
  id: "b".repeat(32),
  originalName: "Beach.mp4",
  description: "Ocean waves on a tropical vacation beach",
  kind: "video",
  durationSec: 8
}
const words = [
  { startSec: 1, endSec: 1.5, text: "Welcome." },
  { startSec: 4, endSec: 4.5, text: "Building" },
  { startSec: 4.5, endSec: 5, text: "apps" },
  { startSec: 5, endSec: 5.5, text: "with" },
  { startSec: 5.5, endSec: 6, text: "Flutter." },
  { startSec: 10, endSec: 11, text: "Beach" },
  { startSec: 11, endSec: 12, text: "vacation." }
]
test("curated stock can illustrate a supported topic without pretending to depict the named product", () => {
  const clip = {
    ...app,
    kind: "video",
    durationSec: 8,
    source: { provider: "mixkit" },
    description: "A developer programming software at a computer desk",
    originalName: "Programmer"
  }
  const result = directCaptions({
    captions: [{ startSec: 0, endSec: 4, text: "Applications using Flutter." }],
    assets: [clip, beach],
    duration: 4,
    semanticScores: { "cue-0": { [clip.id]: 0.24, [beach.id]: 0.1 } }
  })
  assert.equal(result.placements[0].assetId, clip.id)
  assert.match(result.decisions[0].reason, /Illustrative stock/)
  const unrelated = directCaptions({
    captions: [{ startSec: 0, endSec: 4, text: "Beach vacation." }],
    assets: [clip],
    duration: 4,
    semanticScores: { "cue-0": { [clip.id]: 0.24 } }
  })
  assert.equal(unrelated.placements.length, 0)
})
test("clips are selected by caption subject and enter at the spoken match, independent of library order", () => {
  for (const assets of [
    [app, beach],
    [beach, app]
  ]) {
    const result = directCaptions({
      captions: words,
      assets,
      duration: 16,
      headline: "TEST"
    })
    assert.equal(result.placements[0].assetId, app.id)
    assert.ok(Math.abs(result.placements[0].startSec - 4.5) <= 0.06)
    assert.equal(result.placements[1].assetId, beach.id)
    assert.equal(result.placements[1].startSec, 10)
    assert.equal(result.placements[0].transition, "dissolve")
    assert.equal(result.placements[1].transition, "slide")
  }
})
test("caption retiming and subject edits recompute footage decisions instead of keeping old placements", () => {
  const shifted = directCaptions({
    captions: words.map((c) => ({
      ...c,
      startSec: c.startSec + 2,
      endSec: c.endSec + 2
    })),
    assets: [app, beach],
    duration: 18
  })
  assert.ok(Math.abs(shifted.placements[0].startSec - 6.5) <= 0.06)
  const changed = directCaptions({
    captions: [{ startSec: 4, endSec: 7, text: "Beach vacation ocean waves." }],
    assets: [app, beach],
    duration: 9
  })
  assert.equal(changed.placements[0].assetId, beach.id)
})
test("unrelated footage is not inserted and missing footage has an actionable query", () => {
  const result = directCaptions({
    captions: [
      { startSec: 1, endSec: 4, text: "Preparing dinner in a kitchen." }
    ],
    assets: [app, beach],
    duration: 6
  })
  assert.equal(result.placements.length, 0)
  assert.equal(result.decisions[0].assetId, null)
  assert.match(result.decisions[0].searchQuery, /kitchen/)
})
test("local sentence scores can select a paraphrase without literal word overlap", () => {
  const result = directCaptions({
    captions: [
      { startSec: 1, endSec: 4, text: "A doctor helps a sick child." }
    ],
    assets: [
      {
        ...app,
        originalName: "Clinic.png",
        description: "Physician treating a patient"
      }
    ],
    duration: 6,
    semanticScores: { "cue-0": { [app.id]: 0.8 } }
  })
  assert.equal(result.placements[0].assetId, app.id)
  assert.match(result.decisions[0].reason, /sentence meaning/)
})
test("automatic visual decisions use edited caption times and preview remains a prefix of final", () => {
  const media = { width: 720, height: 1280, durationSec: 30, hasAudio: true }
  const settings = {
    ...defaultEditSettings("tech-brief"),
    visualMode: "captions",
    transition: "auto",
    manualCaptions: [
      { startSec: 1, endSec: 3, text: "Welcome to my story." },
      { startSec: 10, endSec: 13, text: "Building Java Flutter apps." },
      { startSec: 20, endSec: 23, text: "A beach vacation." }
    ]
  }
  const data = {
    media,
    settings,
    visualAssets: [app, beach],
    silence: { intervals: [{ startSec: 4, endSec: 8 }] }
  }
  const full = buildEditPlan(data),
    preview = buildEditPlan({
      ...data,
      settings: { ...settings, preview: true }
    })
  assert.ok(
    full.visuals[0].startSec < 10,
    "The B-roll follows the shifted speech after pause removal"
  )
  assert.deepEqual(
    preview.visuals,
    full.visuals
      .filter((v) => v.startSec < 11.9)
      .map((v) => ({ ...v, endSec: Math.min(12, v.endSec) }))
  )
  assert.deepEqual(
    preview.storyCards,
    full.storyCards
      .filter((c) => c.startSec < 12)
      .map((c) => ({ ...c, endSec: Math.min(12, c.endSec) }))
  )
  assert.ok(
    full.segments.every((s) => s.transitionSec === 0),
    "Speech is not crossfaded across words"
  )
  assert.ok(
    full.sfx.every((cue) => cue.timeSec < full.summary.outputDurationSec)
  )
})
