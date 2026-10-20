import test, { after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import config from "../config/default.js"
import { runCommand } from "../src/backend/utils/process-runner.js"
import { renderTemplateVideo } from "../src/backend/services/template-renderer.js"
import {
  defaultEditSettings,
  EDIT_TEMPLATES
} from "../src/shared/edit-templates.js"
import app from "../src/backend/app.js"

const enabled = process.env.RUN_MEDIA_TESTS === "1"
let directory
async function fixture(name, audio = true) {
  console.log("Creating media fixture:", name)
  directory ??= await fs.mkdtemp(path.join(os.tmpdir(), "askedits-media-"))
  const base = path.join(directory, name)
  await fs.mkdir(base, { recursive: true })
  const originalFile = path.join(base, "source.mp4")
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30:duration=8"
  ]
  if (audio)
    args.push(
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=8"
    )
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p")
  if (audio) args.push("-c:a", "aac")
  args.push(originalFile)
  await runCommand({ command: config.media.ffmpegBin, args, timeoutMs: 30000 })
  const paths = {
    originalFile,
    rendersDir: base,
    silenceDetectionFile: path.join(base, "silence.json"),
    transcriptFile: path.join(base, "transcript.json")
  }
  return {
    paths,
    media: { width: 320, height: 180, durationSec: 8, hasAudio: audio }
  }
}
after(async () => {
  if (!directory) return
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()))
  assert.ok(path.basename(directory).startsWith("askedits-media-"))
  await fs.rm(directory, { recursive: true, force: true })
})

test(
  "reference composition uses the person mask and crops baked-in caption pixels",
  { skip: !enabled, timeout: 90000 },
  async () => {
    const record = await fixture("person-mask", false)
    record.media = { ...record.media, width: 320, height: 576, durationSec: 3 }
    record.paths.optimizedDir = record.paths.rendersDir
    const mask = path.join(record.paths.optimizedDir, "person-mask-v1.mp4")
    for (const [filter, target] of [
      [
        "color=c=lime:s=320x576:r=30:d=3,drawbox=x=0:y=460:w=320:h=60:color=red:t=fill",
        record.paths.originalFile
      ],
      [
        "color=c=black:s=288x512:r=15:d=3,drawbox=x=64:y=100:w=160:h=412:color=white:t=fill",
        mask
      ]
    ])
      await runCommand({
        command: config.media.ffmpegBin,
        args: [
          "-v",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          filter,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          target
        ],
        timeoutMs: 15000
      })
    const result = await renderTemplateVideo(
      record,
      {
        ...defaultEditSettings("tech-brief"),
        preview: true,
        endSec: 3,
        removeBackground: true,
        sourceCropTop: 0.14,
        sourceCropBottom: 0.24,
        music: "none",
        motion: false,
        captions: false,
        graphics: false,
        sfx: "none"
      },
      "masked_reference"
    )
    for (const [x, y, kind] of [
      [6, 650, "background"],
      [270, 650, "person"],
      [270, 925, "cropped-caption-area"]
    ]) {
      const frame = await runCommand({
        command: config.media.ffmpegBin,
        args: [
          "-hide_banner",
          "-ss",
          "1",
          "-i",
          result.paths.video,
          "-vf",
          `crop=4:4:${x}:${y},signalstats,metadata=mode=print`,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-"
        ],
        timeoutMs: 15000
      })
      const u = Number(
        frame.stderr.match(/lavfi.signalstats.UAVG=([\d.]+)/)?.[1]
      )
      const v = Number(
        frame.stderr.match(/lavfi.signalstats.VAVG=([\d.]+)/)?.[1]
      )
      if (kind === "background")
        assert.ok(
          Math.abs(u - 128) < 5 && Math.abs(v - 128) < 5,
          "Masked source background is replaced"
        )
      else
        assert.ok(
          u < 90 && v < 90,
          "The presenter remains green and the baked-in red caption strip is cropped: " +
            kind
        )
    }
  }
)
test(
  "all templates encode valid H.264/AAC videos with the requested shape",
  { skip: !enabled, timeout: 180000 },
  async () => {
    const record = await fixture("templates")
    for (const template of EDIT_TEMPLATES) {
      console.log("Encoding template:", template.id)
      const result = await renderTemplateVideo(
        record,
        {
          ...defaultEditSettings(template.id),
          preview: true,
          startSec: 0,
          endSec: 4,
          duration: "full",
          captions: false
        },
        "test_" + template.id
      )
      assert.equal(result.output.width, result.dimensions.width)
      assert.equal(result.output.height, result.dimensions.height)
      assert.ok(
        Math.abs(result.output.durationSec - result.summary.outputDurationSec) <
          0.25,
        template.id
      )
      assert.ok(result.output.size > 1000)
      const bytes = await fs.readFile(result.paths.video)
      assert.ok(
        bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")),
        "fast-start MP4"
      )
    }
  }
)
test(
  "silent video, music, captions, and pause cuts export without missing-stream failures",
  { skip: !enabled, timeout: 90000 },
  async () => {
    const silent = await fixture("silent", false)
    const result = await renderTemplateVideo(
      silent,
      {
        ...defaultEditSettings("cinematic-story"),
        preview: true,
        endSec: 3,
        music: "focus",
        captions: true,
        manualCaptions: [
          { startSec: 0.25, endSec: 2, text: "Original test caption" }
        ]
      },
      "test_silent"
    )
    assert.ok(result.output.durationSec > 2.8)
    assert.match(
      await fs.readFile(result.paths.srt, "utf8"),
      /Original test caption/
    )
    const speech = await fixture("cuts")
    await fs.writeFile(
      speech.paths.silenceDetectionFile,
      JSON.stringify({ intervals: [{ startSec: 2, endSec: 4 }] })
    )
    const cut = await renderTemplateVideo(
      speech,
      {
        ...defaultEditSettings("creator-punch"),
        preview: true,
        music: "none",
        manualCaptions: [{ startSec: 5, endSec: 6, text: "After the cut" }]
      },
      "test_cuts"
    )
    assert.ok(cut.output.durationSec < 7)
    const fullHD = await renderTemplateVideo(
      speech,
      {
        ...defaultEditSettings("clean-interview"),
        preview: false,
        resolution: 1080,
        endSec: 1.5,
        captions: false
      },
      "test_fullhd"
    )
    assert.equal(fullHD.output.width, 1920)
    assert.equal(fullHD.output.height, 1080)
    assert.match(await fs.readFile(cut.paths.srt, "utf8"), /00:00:03,340/)
  }
)
test(
  "HTTP upload, preparation, plan, render, download, and cancellation work together",
  { skip: !enabled, timeout: 120000 },
  async () => {
    const input = await fixture("api")
    const bytes = await fs.readFile(input.paths.originalFile)
    config.upload.storageRoot = path.join(directory, "api-storage")
    const server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    const base = "http://127.0.0.1:" + server.address().port
    const json = async (url, options = {}) => {
      const response = await fetch(base + url, options)
      const payload = await response.json()
      assert.ok(response.ok, JSON.stringify(payload))
      return payload
    }
    const post = (body) => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    try {
      const session = await json(
        "/api/uploads/session",
        post({
          originalName: "fixture.mp4",
          fileSize: bytes.length,
          totalChunks: 1,
          transcriptionMode: "off"
        })
      )
      const id = session.asset.assetId
      await json("/api/uploads/" + id + "/chunks/0", {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes
      })
      await json("/api/uploads/" + id + "/complete", { method: "POST" })
      let workspace
      for (let i = 0; i < 100; i++) {
        workspace = await json("/api/studio/" + id + "/workspace")
        if (["ready", "failed"].includes(workspace.asset.processingStatus))
          break
        await new Promise((r) => setTimeout(r, 200))
      }
      assert.equal(
        workspace.asset.processingStatus,
        "ready",
        JSON.stringify(workspace.asset.errors)
      )
      assert.equal(workspace.asset.audio.waveform.length, 72)
      assert.ok(workspace.asset.audio.waveform.some((peak) => peak > 0))
      const settings = {
        ...defaultEditSettings("clean-interview"),
        preview: true,
        endSec: 3,
        captions: false
      }
      const plan = await json("/api/studio/" + id + "/plan", post(settings))
      assert.ok(plan.segments.length)
      const queued = await json(
        "/api/uploads/" + id + "/render",
        post(settings)
      )
      let job
      for (let i = 0; i < 100; i++) {
        job = await json("/api/studio/" + id + "/renders/" + queued.renderId)
        if (["ready", "failed"].includes(job.status)) break
        await new Promise((r) => setTimeout(r, 200))
      }
      assert.equal(job.status, "ready", job.error)
      const download = await fetch(base + job.urls.video + "?download=1")
      assert.equal(download.status, 200)
      assert.match(download.headers.get("content-disposition"), /attachment/)
      assert.ok((await download.arrayBuffer()).byteLength > 1000)
      const cancelled = await json(
        "/api/uploads/" + id + "/render",
        post({ ...settings, preview: false, resolution: 1080, endSec: 8 })
      )
      await json(
        "/api/studio/" + id + "/renders/" + cancelled.renderId + "/cancel",
        { method: "POST" }
      )
      for (let i = 0; i < 30; i++) {
        job = await json("/api/studio/" + id + "/renders/" + cancelled.renderId)
        if (job.status === "cancelled") break
        await new Promise((r) => setTimeout(r, 100))
      }
      assert.equal(job.status, "cancelled")
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)

test(
  "explainer renders video and image B-roll, graphics, captions, and audible effects",
  { skip: !enabled, timeout: 120000 },
  async () => {
    const record = await fixture("explainer", false)
    const red = path.join(record.paths.rendersDir, "red.mp4"),
      blue = path.join(record.paths.rendersDir, "blue.png")
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=320x180:r=30:d=2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        red
      ],
      timeoutMs: 15000
    })
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x180",
        "-frames:v",
        "1",
        blue
      ],
      timeoutMs: 15000
    })
    const redId = "a".repeat(32),
      blueId = "b".repeat(32)
    record.visualAssets = [
      {
        id: redId,
        path: red,
        kind: "video",
        durationSec: 2,
        originalName: "Red test visual",
        source: {
          provider: "upload",
          author: "ASKEdits test fixture",
          license: "Original"
        }
      },
      {
        id: blueId,
        path: blue,
        kind: "image",
        durationSec: null,
        originalName: "Blue test image",
        source: { provider: "upload", license: "Original" }
      }
    ]
    const result = await renderTemplateVideo(
      record,
      {
        ...defaultEditSettings("tech-brief"),
        preview: true,
        endSec: 4,
        music: "none",
        sourceVolume: 0,
        transition: "slide",
        manualCaptions: [
          {
            startSec: 0.5,
            endSec: 3.8,
            text: "One clear idea changes every frame"
          }
        ],
        visuals: [
          { assetId: redId, startSec: 1, endSec: 2.4, label: "THE IDEA" },
          { assetId: blueId, startSec: 2.6, endSec: 3.8, label: "THE RESULT" }
        ]
      },
      "test_explainer"
    )
    assert.equal(result.output.width, 540)
    assert.equal(result.output.height, 960)
    const plan = JSON.parse(await fs.readFile(result.paths.plan, "utf8"))
    assert.equal(plan.visuals.length, 2)
    assert.ok(plan.captions.length >= 6)
    assert.ok(plan.sfx.length >= 4)
    assert.match(
      await fs.readFile(result.paths.credits, "utf8"),
      /ASKEdits test fixture/
    )
    for (const [at, channel, minimum] of [
      [1.6, "VAVG", 200],
      [3.1, "UAVG", 190]
    ]) {
      const frame = await runCommand({
        command: config.media.ffmpegBin,
        args: [
          "-hide_banner",
          "-ss",
          String(at),
          "-i",
          result.paths.video,
          "-vf",
          "crop=10:10:260:280,signalstats,metadata=mode=print",
          "-frames:v",
          "1",
          "-f",
          "null",
          "-"
        ],
        timeoutMs: 15000
      })
      const value = Number(
        frame.stderr.match(
          new RegExp("lavfi.signalstats." + channel + "=([0-9.]+)")
        )?.[1]
      )
      assert.ok(
        value > minimum,
        "The imported visual is actually visible at its scheduled time: " +
          at +
          " / " +
          value
      )
    }
    const sound = await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-i",
        result.paths.video,
        "-vn",
        "-af",
        "astats=reset=0",
        "-f",
        "null",
        "-"
      ],
      timeoutMs: 15000
    })
    const rms = Number(sound.stderr.match(/RMS level dB: (-?[0-9.]+)/)?.[1])
    assert.ok(
      Number.isFinite(rms) && rms > -65,
      "The export includes real audible SFX over the otherwise silent source"
    )
  }
)
