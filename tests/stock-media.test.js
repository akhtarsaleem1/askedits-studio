import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  STOCK_CATALOG,
  searchCatalog,
  mixkitVideoMetadata
} from "../src/backend/services/stock-catalog.js"
import { stockQueries } from "../src/backend/services/stock-jobs.js"
import {
  allowedMediaUrl,
  commonsResults,
  stockResult,
  searchStock,
  downloadStock,
  pexelsTitle
} from "../src/backend/services/stock-media-service.js"

test("stock downloads accept only known HTTPS media hosts", () => {
  for (const url of [
    "http://upload.wikimedia.org/test.webm",
    "https://localhost/test.mp4",
    "https://127.0.0.1/test.mp4",
    "file:///etc/passwd",
    "https://upload.wikimedia.org.attacker.example/x.mp4",
    "https://user:secret@upload.wikimedia.org/x.webm"
  ]) {
    assert.equal(allowedMediaUrl(url), false, url)
  }
  assert.equal(
    allowedMediaUrl(
      "https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.webm"
    ),
    true
  )
  assert.equal(
    allowedMediaUrl("https://videos.pexels.com/video-files/123/example.mp4"),
    true
  )
  assert.throws(() => stockResult("an-arbitrary-URL"), /expired/)
})
test("Pexels clips are described by their actual titles, never relabelled as the search query", () => {
  assert.equal(
    pexelsTitle(
      {
        id: 123,
        url: "https://www.pexels.com/video/woman-applying-skin-cream-123/"
      },
      "video"
    ),
    "woman applying skin cream"
  )
  assert.equal(
    pexelsTitle({ id: 123, url: "https://www.pexels.com/video/123/" }, "video"),
    "Pexels video 123"
  )
  assert.equal(
    pexelsTitle({ id: 123, url: "https://attacker.example/not-real" }, "video"),
    "Pexels video 123"
  )
})
test("curated search finds actual topic matches and requires the current free license", async () => {
  assert.equal(
    searchCatalog("university students")[0].title,
    "Students on a university campus"
  )
  assert.deepEqual(searchCatalog("unicorn spaceship"), [])
  const result = await searchStock("programming", "mixkit")
  assert.ok(result.items.length >= 2)
  const clip = STOCK_CATALOG[0]
  const metadata = (license) =>
    '<script type="application/ld+json">' +
    JSON.stringify({
      "@graph": [
        {
          "@type": "VideoObject",
          "@id": clip.url + "#video",
          license,
          contentUrl: clip.mediaUrl
        }
      ]
    }) +
    "</script>"
  assert.equal(
    mixkitVideoMetadata(metadata(clip.licenseUrl), clip.url).contentUrl,
    clip.mediaUrl
  )
  assert.throws(
    () =>
      mixkitVideoMetadata(
        metadata("https://mixkit.co/license/#videoRestricted"),
        clip.url
      ),
    /could not be verified/
  )
  assert.throws(
    () =>
      mixkitVideoMetadata(
        metadata(clip.licenseUrl).replace("41637-720.mp4", "other.mp4"),
        clip.url
      ),
    /could not be verified/
  )
})
test("downloads validate every redirect and remove incomplete or oversized files", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "stock-download-test-")
  )
  const originalFetch = globalThis.fetch
  const target = path.join(directory, "clip.mp4")
  try {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" }
      })
    await assert.rejects(
      downloadStock(
        { mediaUrl: "https://videos.pexels.com/example.mp4" },
        target
      ),
      /not supported/
    )
    globalThis.fetch = async () =>
      new Response("large", {
        headers: { "content-length": String(81 * 1024 * 1024) }
      })
    await assert.rejects(
      downloadStock(
        { mediaUrl: "https://videos.pexels.com/example.mp4" },
        target
      ),
      /under 80 MB/
    )
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]))
            controller.error(new Error("network interrupted"))
          }
        })
      )
    await assert.rejects(
      downloadStock(
        { mediaUrl: "https://videos.pexels.com/example.mp4" },
        target
      ),
      /network interrupted/
    )
    await assert.rejects(fs.stat(target), { code: "ENOENT" })
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]))
    await downloadStock(
      { mediaUrl: "https://videos.pexels.com/example.mp4" },
      target
    )
    assert.equal((await fs.stat(target)).size, 3)
  } finally {
    globalThis.fetch = originalFetch
    await fs.rm(directory, { recursive: true, force: true })
  }
})
test("automatic footage searches use distinct spoken topics and stop without captions", () => {
  assert.deepEqual(
    stockQueries({ captions: [], summary: { outputDurationSec: 20 } }),
    []
  )
  const scenes = stockQueries({
    captions: [
      { startSec: 0, endSec: 3, text: "Software development and programming." },
      { startSec: 4, endSec: 7, text: "Study at a university campus." },
      { startSec: 8, endSec: 11, text: "Software applications and coding." }
    ],
    summary: { outputDurationSec: 12 }
  })
  assert.deepEqual(
    scenes.map((scene) => scene.topic),
    ["development", "education"]
  )
})
test("Commons results retain attribution and exclude unsupported licenses and files", () => {
  const page = (license, mime = "video/webm", size = 1000) => ({
    title: "File:Example.webm",
    imageinfo: [
      {
        mime,
        size,
        url: "https://upload.wikimedia.org/test.webm",
        thumburl: "https://upload.wikimedia.org/test.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.webm",
        extmetadata: {
          Artist: { value: "<a>Original author</a>" },
          LicenseShortName: { value: license },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }
        }
      }
    ]
  })
  const results = commonsResults({
    query: {
      pages: {
        1: page("CC BY 4.0"),
        2: page("CC BY-SA 4.0"),
        3: page("Public domain"),
        4: page("CC0", "application/pdf"),
        5: page("CC0", "video/webm", 90 * 1024 * 1024)
      }
    }
  })
  assert.equal(results.length, 2)
  assert.equal(results[0].author, "Original author")
  assert.match(results[0].licenseUrl, /creativecommons/)
})
