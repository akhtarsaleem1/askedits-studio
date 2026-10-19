import "../src/backend/env-loader.js"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { chromium } from "playwright"

const port = Number(process.env.STUDIO_TEST_PORT ?? 18789)
const base = "http://127.0.0.1:" + port
const storage = await fs.mkdtemp(path.join(os.tmpdir(), "askedits-ui-"))
const output = path.resolve("output/browser")
await fs.mkdir(output, { recursive: true })
const server = spawn(process.execPath, ["src/backend/server.js"], {
  env: { ...process.env, PORT: String(port), STORAGE_ROOT: storage },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
})
let serverLog = ""
server.stdout.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-8000)
})
server.stderr.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-8000)
})
let browser
const checks = []
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/api/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    if (server.exitCode !== null) throw new Error("Server exited: " + serverLog)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {})
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }
  })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(base, { waitUntil: "networkidle" })
  await page.locator(".system-status .online").waitFor({ timeout: 30000 })
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Good footage. Great stories.",
        exact: true
      })
      .count(),
    1
  )
  const auto = page.locator(".ingest-options input[type=checkbox]")
  if (await auto.isChecked()) await auto.uncheck()
  await page
    .getByRole("button", { name: "Try demo footage", exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelector(".recipe-banner button")?.disabled === false,
    null,
    { timeout: 45000 }
  )
  checks.push("Upload and FFmpeg preparation")
  await page.getByRole("button", { name: "Captions", exact: true }).click()
  await page
    .getByLabel("Import SRT captions", { exact: true })
    .setInputFiles({
      name: "sample.srt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "1\n00:00:00,400 --> 00:00:02,900\nMake every frame count.\n\n2\n00:00:04,000 --> 00:00:06,000\nA clear story comes first.\n"
      )
    })
  await page
    .getByLabel("Caption 1 text", { exact: true })
    .fill("Your story. Refined.")
  await page.getByRole("button", { name: /Cinematic Story/ }).click()
  await page.getByRole("checkbox", { name: /^Burn in captions/ }).check()
  await page.getByRole("button", { name: "1:1", exact: true }).click()
  await page.getByLabel("Output", { exact: true }).selectOption("720")
  await page.getByLabel("Music bed", { exact: true }).selectOption("focus")
  await page.waitForFunction(
    () => document.querySelector(".recipe-banner button")?.disabled === false,
    null,
    { timeout: 10000 }
  )
  checks.push(
    "Template selection, SRT import, caption editing, aspect ratio and audio settings"
  )
  await page
    .getByRole("button", { name: "Render preview", exact: true })
    .click()
  await page
    .getByText("Preview ready. Review it, then export in full quality.", {
      exact: true
    })
    .waitFor({ timeout: 90000 })
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth > 0,
    null,
    { timeout: 10000 }
  )
  const preview = await page
    .locator("video")
    .evaluate((video) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration
    }))
  assert.equal(preview.width, 540)
  assert.equal(preview.height, 540)
  assert.ok(preview.duration <= 12.3)
  checks.push("A real 540p video preview with source comparison")
  await page.getByRole("button", { name: "Export video", exact: true }).click()
  await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .waitFor({ timeout: 120000 })
  const url = await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .getAttribute("href")
  const download = await page.request.get(base + url)
  assert.equal(download.status(), 200)
  assert.match(download.headers()["content-disposition"], /attachment/)
  assert.ok((await download.body()).byteLength > 1000)
  const metadata = await page
    .locator("video")
    .evaluate((video) => ({
      width: video.videoWidth,
      height: video.videoHeight
    }))
  assert.equal(metadata.width, 720)
  assert.equal(metadata.height, 720)
  const captionLink = await page
    .getByRole("link", { name: "Captions .srt", exact: true })
    .getAttribute("href")
  const srt = await page.request.get(base + captionLink).then((r) => r.text())
  assert.match(srt, /Your story\. Refined\./)
  checks.push("Final MP4 download and retimed SRT download")
  await page.getByRole("button", { name: /Podcast Spotlight/ }).click()
  await page.waitForFunction(
    () =>
      document
        .querySelector(".saved-state")
        ?.textContent.includes("Saved locally"),
    null,
    { timeout: 10000 }
  )
  await page.reload({ waitUntil: "networkidle" })
  await page
    .getByRole("button", { name: /Podcast Spotlight/ })
    .waitFor({ timeout: 10000 })
  assert.equal(
    await page
      .getByRole("button", { name: /Podcast Spotlight/ })
      .getAttribute("aria-pressed"),
    "true"
  )
  assert.equal(
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .count(),
    1
  )
  await page
    .getByRole("button", { name: "Open recent project", exact: true })
    .click()
  assert.ok((await page.locator(".project-menu button").count()) > 0)
  await page
    .getByRole("button", { name: "Open recent project", exact: true })
    .click()
  checks.push(
    "Saved settings, stale-render detection, refresh recovery, and recent projects"
  )
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true
  })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true
  })
  assert.deepEqual(errors, [])
  checks.push(
    "Mobile layout without horizontal overflow and no browser exceptions"
  )
  console.log(checks.map((check) => "PASS " + check).join("\n"))
} catch (error) {
  console.error(serverLog)
  throw error
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    const closed = once(server, "close")
    server.kill()
    await closed
  }
  assert.equal(path.dirname(storage), path.resolve(os.tmpdir()))
  assert.ok(path.basename(storage).startsWith("askedits-ui-"))
  await fs.rm(storage, { recursive: true, force: true })
}
