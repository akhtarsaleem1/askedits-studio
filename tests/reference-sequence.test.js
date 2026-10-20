import test from "node:test"
import assert from "node:assert/strict"
import {
  referenceCards,
  referencePlacements
} from "../src/shared/reference-sequence.js"
import {
  buildEditPlan,
  normalizeEditSettings
} from "../src/shared/edit-planner.js"
import { defaultEditSettings } from "../src/shared/edit-templates.js"

test("reference chapters cover the entire edit and supporting visuals extend past the opening", () => {
  const cards = referenceCards(
    [
      { startSec: 0, endSec: 6, text: "computer science" },
      { startSec: 18, endSec: 24, text: "building applications" }
    ],
    54,
    "MY STORY"
  )
  assert.equal(cards[0].startSec, 0)
  assert.equal(cards.at(-1).endSec, 54)
  assert.equal(cards[0].title, "COMPUTER SCIENCE")
  for (let i = 1; i < cards.length; i++)
    assert.equal(cards[i].startSec, cards[i - 1].endSec)
  const visuals = referencePlacements(
    cards,
    [{ id: "a".repeat(32) }, { id: "b".repeat(32) }],
    54
  )
  assert.ok(visuals.at(-1).startSec > 40)
  assert.ok(
    visuals.every(
      (v, i) =>
        v.endSec <= 54 &&
        v.endSec > v.startSec &&
        (!i || v.startSec >= visuals[i - 1].endSec)
    )
  )
})
test("reference cropping and editable chapters are validated and appear in the render plan", () => {
  const media = { width: 720, height: 1280, durationSec: 18, hasAudio: true }
  const settings = {
    ...defaultEditSettings("tech-brief"),
    sourceCropTop: 0.14,
    sourceCropBottom: 0.24,
    cardTitles: ["MY INTRODUCTION"],
    manualCaptions: [{ startSec: 1, endSec: 6, text: "computer science" }]
  }
  const plan = buildEditPlan({ media, settings })
  assert.equal(plan.storyCards[0].title, "MY INTRODUCTION")
  assert.equal(plan.sourceWidth, 720)
  assert.equal(plan.settings.sourceCropBottom, 0.24)
  assert.throws(() =>
    normalizeEditSettings({ ...settings, sourceCropBottom: 0.8 }, media)
  )
  assert.throws(() =>
    normalizeEditSettings({ ...settings, removeBackground: "yes" }, media)
  )
  assert.throws(() =>
    normalizeEditSettings({ ...settings, cardTitles: ["a".repeat(61)] }, media)
  )
})
