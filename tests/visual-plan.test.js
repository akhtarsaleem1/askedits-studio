import test from "node:test"
import assert from "node:assert/strict"
import { defaultEditSettings } from "../src/shared/edit-templates.js"
import {
  buildEditPlan,
  normalizeEditSettings
} from "../src/shared/edit-planner.js"

const media = { width: 1920, height: 1080, durationSec: 20, hasAudio: true }
const id = "a".repeat(32)
const visualAssets = [
  {
    id,
    kind: "video",
    durationSec: 3,
    originalName: "Original clip",
    source: { provider: "upload", license: "Original" }
  }
]
test("the explainer preset creates timed word captions and bounded sound cues", () => {
  const plan = buildEditPlan({
    media,
    settings: {
      ...defaultEditSettings("tech-brief"),
      manualCaptions: [
        { startSec: 1, endSec: 3, text: "A clear story matters" }
      ]
    }
  })
  assert.equal(plan.settings.layout, "presenter")
  assert.equal(plan.captions.length, 4)
  assert.deepEqual(
    plan.captions.map((item) => item.text),
    ["A", "clear", "story", "matters"]
  )
  assert.equal(plan.captions[1].startSec, 1.5)
  assert.ok(plan.sfx.some((event) => event.type === "impact"))
  assert.ok(
    plan.sfx.every(
      (event) =>
        event.timeSec >= 0 && event.timeSec < plan.summary.outputDurationSec
    )
  )
})
test("B-roll follows the edited timeline and preserves media credits", () => {
  const settings = {
    ...defaultEditSettings("tech-brief"),
    preview: true,
    visuals: [
      { assetId: id, startSec: 2, endSec: 5, label: "The next idea" },
      { assetId: id, startSec: 15, endSec: 18 }
    ]
  }
  const plan = buildEditPlan({
    media,
    settings,
    visualAssets,
    silence: { intervals: [{ startSec: 6, endSec: 9 }] }
  })
  assert.equal(plan.visuals.length, 1)
  assert.equal(plan.visuals[0].startSec, 2)
  assert.equal(plan.visuals[0].endSec, 5)
  assert.equal(plan.credits[0].license, "Original")
  assert.ok(plan.warnings.some((message) => message.includes("preview")))
  assert.ok(plan.sfx.every((event) => event.timeSec < 12))
})
test("invalid, missing, overlapping, and out-of-range visual placements are rejected", () => {
  assert.throws(() =>
    normalizeEditSettings(
      {
        ...defaultEditSettings("tech-brief"),
        visuals: [{ assetId: "../../file", startSec: 1, endSec: 2 }]
      },
      media
    )
  )
  assert.throws(
    () =>
      buildEditPlan({
        media,
        settings: {
          ...defaultEditSettings("tech-brief"),
          visuals: [{ assetId: id, startSec: 1, endSec: 2 }]
        }
      }),
    /missing/
  )
  assert.throws(
    () =>
      buildEditPlan({
        media,
        visualAssets,
        settings: {
          ...defaultEditSettings("tech-brief"),
          visuals: [
            { assetId: id, startSec: 1, endSec: 3 },
            { assetId: id, startSec: 2, endSec: 4 }
          ]
        }
      }),
    /overlap/
  )
  assert.throws(
    () =>
      buildEditPlan({
        media,
        visualAssets,
        settings: {
          ...defaultEditSettings("tech-brief"),
          visuals: [{ assetId: id, startSec: 1, endSec: 2, clipStartSec: 5 }]
        }
      }),
    /in-point/
  )
  assert.throws(() =>
    normalizeEditSettings(
      { ...defaultEditSettings("tech-brief"), sfxVolume: Infinity },
      media
    )
  )
})
test("scene transitions adjust timing while captions remain within the edit", () => {
  for (const transition of ["cut", "slide", "wipe", "flash", "dissolve"]) {
    const plan = buildEditPlan({
      media,
      settings: {
        ...defaultEditSettings("tech-brief"),
        transition,
        manualCaptions: [{ startSec: 4, endSec: 6, text: "After the cut" }]
      }
    })
    assert.equal(plan.summary.transitionCount > 0, transition !== "cut")
    assert.ok(
      plan.captions.every(
        (caption) =>
          caption.startSec >= 0 &&
          caption.endSec <= plan.summary.outputDurationSec
      )
    )
  }
})
