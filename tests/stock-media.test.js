import test from "node:test"
import assert from "node:assert/strict"
import {
  allowedMediaUrl,
  commonsResults,
  stockResult
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
