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
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Studio pages" })
      .getByRole("link", { name, exact: true })
  await page
    .getByRole("heading", { name: "Your projects", exact: true })
    .waitFor()
  assert.equal(new URL(page.url()).pathname, "/projects")
  await nav("Editor").click()
  await page
    .getByRole("heading", { name: "Start with your footage.", exact: true })
    .waitFor()
  assert.equal(await page.locator(".settings-panel").count(), 0)
  await nav("Templates").click()
  assert.equal(await page.locator(".template-card").count(), 7)
  assert.equal(await page.locator("video").count(), 0)
  await page.getByRole("button", { name: /Travel Journal/ }).click()
  await page.goBack()
  await page
    .getByRole("heading", { name: "Start with your footage.", exact: true })
    .waitFor()
  await nav("Projects").click()
  checks.push(
    "Separate page URLs, empty states, template browsing, and browser Back navigation"
  )
  const auto = page.locator(".ingest-options input[type=checkbox]")
  if (await auto.isChecked()) await auto.uncheck()
  await page
    .getByRole("button", { name: "Try demo footage", exact: true })
    .click()
  await page
    .getByText("Your footage is ready. Find a style to get started.", {
      exact: true
    })
    .waitFor({ timeout: 45000 })
  checks.push("Upload and FFmpeg preparation on the Projects page")
  await page
    .getByRole("link", { name: "Choose a template", exact: true })
    .click()
  assert.equal(
    await page
      .getByRole("button", { name: /Travel Journal/ })
      .getAttribute("aria-pressed"),
    "true"
  )
  await page.getByRole("button", { name: /Cinematic Story/ }).click()
  await page
    .getByRole("link", { name: "Continue to editor", exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelector(".recipe-banner button")?.disabled === false,
    null,
    { timeout: 15000 }
  )
  assert.equal(await page.locator(".template-list").count(), 0)
  await page.getByRole("button", { name: "Captions", exact: true }).click()
  await page.getByLabel("Import SRT captions", { exact: true }).setInputFiles({
    name: "sample.srt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "1\n00:00:00,400 --> 00:00:02,900\nMake every frame count.\n\n2\n00:00:04,000 --> 00:00:06,000\nA clear story comes first.\n"
    )
  })
  await page
    .getByLabel("Caption 1 text", { exact: true })
    .fill("Your story. Refined.")
  await page.getByRole("tab", { name: "Captions", exact: true }).click()
  await page.getByRole("checkbox", { name: /^Burn in captions/ }).check()
  await page.getByRole("tab", { name: "Framing", exact: true }).click()
  assert.equal(await page.getByLabel("Music bed", { exact: true }).count(), 0)
  await page.getByRole("button", { name: "1:1", exact: true }).click()
  await nav("Exports").click()
  await page.getByLabel("Output", { exact: true }).selectOption("720")
  assert.equal(await page.locator(".editor-bottom").count(), 0)
  await nav("Editor").click()
  await page.getByRole("tab", { name: "Framing", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  assert.equal(
    await page
      .getByRole("tab", { name: "Pacing", exact: true })
      .getAttribute("aria-selected"),
    "true"
  )
  await page.keyboard.press("End")
  assert.equal(
    await page
      .getByRole("tab", { name: "Audio", exact: true })
      .getAttribute("aria-selected"),
    "true"
  )
  await page.getByLabel("Music bed", { exact: true }).selectOption("focus")
  await page.waitForFunction(
    () => document.querySelector(".recipe-banner button")?.disabled === false,
    null,
    { timeout: 10000 }
  )
  checks.push(
    "Template, caption, framing, and audio edits persist between dedicated pages"
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
  const preview = await page.locator("video").evaluate((v) => ({
    width: v.videoWidth,
    height: v.videoHeight,
    duration: v.duration
  }))
  assert.equal(preview.width, 540)
  assert.equal(preview.height, 540)
  assert.ok(preview.duration <= 12.3)
  checks.push("Real preview rendering on the Editor page")
  await page.getByRole("link", { name: "Review & export", exact: true }).click()
  assert.equal(new URL(page.url()).pathname, "/exports")
  await page.getByRole("button", { name: "Export video", exact: true }).click()
  await nav("Templates").click()
  await nav("Exports").click()
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
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth === 720,
    null,
    { timeout: 10000 }
  )
  const captionLink = await page
    .getByRole("link", { name: "Captions .srt", exact: false })
    .getAttribute("href")
  assert.match(
    await page.request.get(base + captionLink).then((r) => r.text()),
    /Your story\. Refined\./
  )
  checks.push("Final MP4 and timed SRT download on the Exports page")
  await nav("Templates").click()
  await page.getByRole("button", { name: /Tech Brief/ }).click()
  await page
    .getByRole("link", { name: "Continue to editor", exact: true })
    .click()
  await page.getByRole("tab", { name: "Visuals", exact: true }).click()
  await page
    .getByLabel("Upload B-roll", { exact: true })
    .setInputFiles(path.resolve("public/demo/tech-broll.mp4"))
  await page.locator(".visual-library-item").first().waitFor({ timeout: 30000 })
  await page
    .getByLabel("B-roll 1 label", { exact: true })
    .fill("A BETTER STORY")
  await page.getByLabel("B-roll 1 start", { exact: true }).fill("1")
  await page.getByLabel("B-roll 1 end", { exact: true }).fill("4")
  await page
    .getByRole("button", { name: "Try original motion sample", exact: true })
    .click()
  await page
    .getByLabel("Remove B-roll 2", { exact: true })
    .waitFor({ timeout: 30000 })
  assert.equal(await page.locator(".visual-library-item").count(), 2)
  await page.getByLabel("Remove B-roll 2", { exact: true }).click()
  await page
    .getByLabel("Opening headline", { exact: true })
    .fill("ONE GOOD IDEA")
  await page.locator(".stock-search summary").click()
  await page.route("**/api/studio/stock/search?*", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Provider unavailable during offline browser check" }
    })
  )
  await page.getByLabel("Search stock", { exact: true }).fill("robot")
  await page
    .getByRole("button", { name: "Search library", exact: true })
    .click()
  await page
    .locator(".stock-note")
    .filter({ hasText: "could not connect" })
    .waitFor()
  await page.unroute("**/api/studio/stock/search?*")
  await page.locator(".stock-search summary").click()
  await page.getByRole("tab", { name: "Pacing", exact: true }).click()
  await page
    .getByLabel("Scene transition", { exact: true })
    .selectOption("slide")
  await page.getByRole("tab", { name: "Audio", exact: true }).click()
  assert.equal(
    await page.getByLabel("Transition sounds", { exact: true }).inputValue(),
    "punchy"
  )
  await page.waitForFunction(
    () => document.querySelector(".recipe-banner button")?.disabled === false,
    null,
    { timeout: 15000 }
  )
  await page
    .getByRole("button", { name: "Render preview", exact: true })
    .click()
  await page
    .getByText("Preview ready. Review it, then export in full quality.", {
      exact: true
    })
    .waitFor({ timeout: 90000 })
  await page.getByRole("button", { name: "Timeline", exact: true }).click()
  assert.equal(await page.locator(".broll-track span").count(), 1)
  assert.ok((await page.locator(".sfx-track span").count()) > 0)
  await page.getByRole("tab", { name: "Visuals", exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
    null,
    { timeout: 15000 }
  )
  await page.locator("video").evaluate((video) => {
    video.currentTime = 2
  })
  await page.waitForFunction(
    () => !document.querySelector("video")?.seeking,
    null,
    { timeout: 10000 }
  )
  await page.screenshot({
    path: path.join(output, "explainer-editor.png"),
    fullPage: true
  })
  await nav("Exports").click()
  await page.getByLabel("Output", { exact: true }).selectOption("720")
  await page.getByRole("button", { name: "Export video", exact: true }).click()
  await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .waitFor({ timeout: 120000 })
  await page.waitForFunction(
    () => document.querySelector("video")?.videoHeight === 1280,
    null,
    { timeout: 15000 }
  )
  const planUrl = await page
    .getByRole("link", { name: "Edit decisions .json", exact: false })
    .getAttribute("href")
  const explainerPlan = await page.request
    .get(base + planUrl)
    .then((response) => response.json())
  assert.equal(explainerPlan.settings.templateId, "tech-brief")
  assert.equal(explainerPlan.visuals.length, 1)
  assert.equal(explainerPlan.settings.layout, "presenter")
  assert.equal(explainerPlan.settings.transition, "slide")
  assert.ok(explainerPlan.sfx.length > 0)
  const creditUrl = await page
    .getByRole("link", { name: "Media credits", exact: false })
    .getAttribute("href")
  assert.match(
    await page.request
      .get(base + creditUrl)
      .then((response) => response.text()),
    /tech-broll/
  )
  await page.locator("video").evaluate((video) => {
    video.currentTime = 2
  })
  await page.waitForFunction(
    () => !document.querySelector("video")?.seeking,
    null,
    { timeout: 10000 }
  )
  await page.screenshot({
    path: path.join(output, "explainer-exports.png"),
    fullPage: true
  })
  checks.push(
    "Reference-inspired explainer with uploaded B-roll, editable timing, motion title, word captions, slide transitions, sound cues, 720p export, stock error recovery, and media credits"
  )
  await nav("Templates").click()
  const draftSaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/draft") &&
      r.request().method() === "PUT" &&
      r.request().postDataJSON()?.templateId === "podcast-spotlight" &&
      r.ok()
  )
  await page.getByRole("button", { name: /Podcast Spotlight/ }).click()
  await draftSaved
  const deepLink = page.url()
  assert.equal(new URL(deepLink).pathname, "/templates")
  assert.ok(new URL(deepLink).searchParams.get("project"))
  await page.reload({ waitUntil: "networkidle" })
  await page
    .locator(".template-card[aria-pressed=true]")
    .filter({ hasText: "Podcast Spotlight" })
    .waitFor({ timeout: 10000 })
  const isolated = await browser.newContext()
  const deepPage = await isolated.newPage()
  await deepPage.goto(deepLink, { waitUntil: "networkidle" })
  await deepPage
    .locator(".template-card[aria-pressed=true]")
    .filter({ hasText: "Podcast Spotlight" })
    .waitFor({ timeout: 10000 })
  await isolated.close()
  await nav("Editor").click()
  assert.equal(
    await page
      .locator(".recipe-banner")
      .getByText("Podcast Spotlight", { exact: true })
      .count(),
    1
  )
  await page.goBack()
  await page
    .getByRole("heading", { name: "Find your style", exact: true })
    .waitFor()
  await page.goForward()
  await page
    .getByRole("heading", { name: "Make it yours", exact: true })
    .waitFor()
  await nav("Projects").click()
  assert.ok((await page.locator(".project-card").count()) > 0)
  await page.locator(".project-card").first().click()
  await page
    .getByRole("heading", { name: "Make it yours", exact: true })
    .waitFor()
  await nav("Exports").click()
  await page
    .getByRole("button", { name: "Export video", exact: true })
    .waitFor()
  assert.ok((await page.locator(".export-card").count()) > 0)
  checks.push(
    "Saved drafts across pages and reload, isolated project deep links, Back/Forward, stale renders, and recent projects"
  )
  for (const name of ["Projects", "Templates", "Editor", "Exports"]) {
    await nav(name).click()
    if (await page.locator("video").count()) {
      await page.waitForFunction(
        () => document.querySelector("video")?.readyState >= 2,
        null,
        { timeout: 15000 }
      )
      await page.locator("video").evaluate((video) => {
        video.currentTime = 1
      })
      await page.waitForFunction(
        () => !document.querySelector("video")?.seeking,
        null,
        { timeout: 10000 }
      )
    }
    await page.screenshot({
      path: path.join(output, name.toLowerCase() + ".png"),
      fullPage: true
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ["Projects", "Templates", "Editor", "Exports"]) {
    await nav(name).click()
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true,
      name + " has no horizontal overflow"
    )
    await page.screenshot({
      path: path.join(output, name.toLowerCase() + "-mobile.png"),
      fullPage: true
    })
  }
  assert.deepEqual(errors, [])
  checks.push(
    "All four mobile pages fit without horizontal overflow or browser exceptions"
  )
  console.log(checks.map((check) => "PASS " + check).join("\n"))
} catch (error) {
  const failurePage = browser?.contexts()[0]?.pages()[0]
  if (failurePage && !failurePage.isClosed())
    await failurePage
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => {})
  console.error(serverLog)
  throw error
} finally {
  // Cancel encoders before stopping the server so a failed assertion cannot
  // leave an FFmpeg child running against the temporary storage directory.
  try {
    const { projects } = await fetch(base + "/api/studio/projects").then((r) =>
      r.json()
    )
    for (const project of projects) {
      const { asset } = await fetch(
        base + "/api/studio/" + project.assetId + "/workspace"
      ).then((r) => r.json())
      for (const render of asset.renders.filter((r) =>
        ["queued", "running"].includes(r.status)
      )) {
        await fetch(
          base +
            "/api/studio/" +
            project.assetId +
            "/renders/" +
            render.renderId +
            "/cancel",
          { method: "POST" }
        )
      }
    }
  } catch {
    /* The server may already have exited. */
  }
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
