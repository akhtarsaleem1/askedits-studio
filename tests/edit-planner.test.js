import test from "node:test"
import assert from "node:assert/strict"
import {
  EDIT_TEMPLATES,
  defaultEditSettings
} from "../src/shared/edit-templates.js"
import {
  buildEditPlan,
  normalizeEditSettings,
  parseSrt,
  captionsToSrt,
  suggestClips
} from "../src/shared/edit-planner.js"

const media = { width: 1920, height: 1080, durationSec: 20, hasAudio: true }
test("all templates produce bounded, reproducible edit decisions", () => {
  for (const template of EDIT_TEMPLATES) {
    const plan = buildEditPlan({
      media,
      settings: defaultEditSettings(template.id)
    })
    assert.ok(plan.segments.length)
    assert.ok(plan.summary.outputDurationSec <= 20.05)
    for (const segment of plan.segments) {
      assert.ok(
        segment.startSec >= 0 && segment.endSec <= media.durationSec + 0.001
      )
      assert.ok(segment.endSec > segment.startSec)
      assert.ok(segment.outputStartSec >= 0)
    }
    assert.equal(plan.dimensions.width % 2, 0)
    assert.equal(plan.dimensions.height % 2, 0)
  }
})
test("leading and trailing silence can be removed even with a single remaining segment", () => {
  const plan = buildEditPlan({
    media,
    settings: { ...defaultEditSettings("clean-interview"), motion: false },
    silence: {
      intervals: [
        { startSec: 0, endSec: 3 },
        { startSec: 18, endSec: 20 }
      ]
    }
  })
  assert.equal(plan.segments.length, 1)
  assert.equal(plan.segments[0].startSec, 2.83)
  assert.equal(plan.segments[0].endSec, 18.17)
  assert.equal(plan.summary.outputDurationSec, 15.34)
})
test("captions are retimed after cuts, not burned at their old positions", () => {
  const plan = buildEditPlan({
    media,
    settings: {
      ...defaultEditSettings("creator-punch"),
      motion: false,
      manualCaptions: [{ startSec: 10, endSec: 11, text: "After the pause" }]
    },
    silence: { intervals: [{ startSec: 2, endSec: 5 }] }
  })
  assert.equal(plan.captions[0].startSec, 7.34)
  assert.equal(plan.captions[0].endSec, 8.34)
  assert.equal(plan.captions[0].text, "After the pause")
})
test("silent and entirely quiet sources remain editable", () => {
  const plan = buildEditPlan({
    media: { ...media, hasAudio: false },
    settings: defaultEditSettings("creator-punch"),
    silence: { intervals: [{ startSec: 0, endSec: 20 }] }
  })
  assert.equal(plan.summary.outputDurationSec, 20)
  assert.ok(plan.warnings.some((message) => message.includes("no audio")))
  const quiet = buildEditPlan({
    media,
    settings: defaultEditSettings("creator-punch"),
    silence: { intervals: [{ startSec: 0, endSec: 20 }] }
  })
  assert.ok(quiet.summary.outputDurationSec > 0)
})
test("malformed ranges, template IDs, flags, colors, and custom music are rejected", () => {
  for (const input of [
    { templateId: "unknown" },
    { startSec: NaN },
    { startSec: 10, endSec: 9 },
    { aspect: "3:2" },
    { captionColor: "';evil" },
    { resolution: 800 },
    { captions: "true" }
  ]) {
    assert.throws(() => normalizeEditSettings(input, media), {
      statusCode: 400
    })
  }
  assert.throws(() => buildEditPlan({ media, settings: { music: "custom" } }), {
    statusCode: 400
  })
})
test("SRT import/export preserves timing and Unicode caption text", () => {
  const source =
    "1\n00:00:01,250 --> 00:00:02,900\nHello دنیا\n\n2\n00:00:04,000 --> 00:00:05,200\nA second line\n"
  const captions = parseSrt(source)
  assert.equal(captions[0].startSec, 1.25)
  assert.equal(captions[0].text, "Hello دنیا")
  assert.deepEqual(parseSrt(captionsToSrt(captions)), captions)
  assert.throws(() => parseSrt("invalid subtitle file"), { statusCode: 400 })
})
test("clip suggestions respect the source duration and avoid overlapping starting points", () => {
  const clips = suggestClips({ ...media, durationSec: 180 }, null, 30)
  assert.equal(clips.length, 3)
  assert.ok(clips.every((c) => c.endSec <= 180 && c.endSec - c.startSec === 30))
})

test("montage preview preserves the first shots of the final edit", () => {
  const settings = defaultEditSettings("cinematic-story")
  const longMedia = { ...media, durationSec: 180 }
  const finalPlan = buildEditPlan({ media: longMedia, settings })
  const preview = buildEditPlan({
    media: longMedia,
    settings: { ...settings, preview: true }
  })
  assert.equal(preview.summary.outputDurationSec, 12)
  assert.equal(preview.segments[0].startSec, finalPlan.segments[0].startSec)
  assert.equal(preview.segments[1].startSec, finalPlan.segments[1].startSec)
})
