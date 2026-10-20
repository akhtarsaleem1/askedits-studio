import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import config from "../../../config/default.js"
import { createHttpError } from "../utils/errors.js"
import { searchCatalog, mixkitVideoMetadata } from "./stock-catalog.js"

const agent =
  "ASKEditsStudio/2.1 (https://github.com/akhtarsaleem1/askedits-studio)"
const results = new Map()
const maxBytes = 80 * 1024 * 1024
const plain = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
const safeLink = (value, fallback) => {
  try {
    return new URL(value).protocol === "https:" ? value : fallback
  } catch {
    return fallback
  }
}
export function allowedMediaUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      [
        "upload.wikimedia.org",
        "images.pexels.com",
        "videos.pexels.com",
        "assets.mixkit.co"
      ].includes(url.hostname) &&
      (!url.port || url.port === "443")
    )
  } catch {
    return false
  }
}
const publicResult = (result) => ({
  id: result.id,
  title: result.title,
  thumbnail: result.thumbnail,
  kind: result.kind,
  author: result.author,
  license: result.license,
  licenseUrl: result.licenseUrl,
  url: result.url,
  provider: result.provider
})
export function commonsResults(data) {
  return Object.values(data.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0],
      meta = info?.extmetadata ?? {}
    const license = plain(meta.LicenseShortName?.value)
    const kind = /^video\//.test(info?.mime ?? "")
      ? "video"
      : /^image\/(jpeg|png|webp)$/.test(info?.mime ?? "")
        ? "image"
        : null
    if (
      !kind ||
      !allowedMediaUrl(info.url) ||
      info.size > maxBytes ||
      !/^(Public domain|CC0|CC BY(?:\s|$))/i.test(license)
    )
      return []
    return [
      {
        title: plain(page.title.replace(/^File:/, "")),
        mediaUrl: info.url,
        thumbnail: allowedMediaUrl(info.thumburl) ? info.thumburl : null,
        kind,
        provider: "commons",
        author: plain(meta.Artist?.value || meta.Credit?.value || info.user),
        license,
        licenseUrl: safeLink(
          meta.LicenseUrl?.value,
          "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia"
        ),
        url: safeLink(info.descriptionurl, "https://commons.wikimedia.org/")
      }
    ]
  })
}
export async function searchStock(query, provider = "commons", kind = "video") {
  if (typeof query !== "string" || !query.trim() || query.length > 100)
    throw createHttpError(400, "Enter a stock search of 1–100 characters.")
  if (
    !["mixkit", "commons", "pexels"].includes(provider) ||
    !["video", "image"].includes(kind)
  )
    throw createHttpError(
      400,
      "Choose a supported stock provider and media type."
    )
  let matches
  if (provider === "mixkit") {
    matches = kind === "video" ? searchCatalog(query) : []
  } else if (provider === "commons") {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch:
        "filetype:" +
        (kind === "video" ? "video" : "bitmap") +
        " " +
        query.trim(),
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata|user",
      iiurlwidth: "400",
      iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl"
    })
    const response = await fetch(
      "https://commons.wikimedia.org/w/api.php?" + params,
      { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(20000) }
    )
    if (!response.ok)
      throw createHttpError(
        502,
        "Wikimedia stock search is unavailable. Try again or upload your own B-roll."
      )
    const body = await response.text()
    if (body.length > 2 * 1024 * 1024)
      throw createHttpError(502, "Stock search response was too large.")
    matches = commonsResults(JSON.parse(body)).filter(
      (result) => result.kind === kind
    )
  } else {
    if (!config.broll.pexelsApiKey)
      throw createHttpError(
        409,
        "Add PEXELS_API_KEY to the server .env and restart to enable Pexels. Wikimedia search and your own uploads work without a key."
      )
    const endpoint =
      kind === "video"
        ? "https://api.pexels.com/v1/videos/search"
        : "https://api.pexels.com/v1/search"
    const response = await fetch(
      endpoint +
        "?" +
        new URLSearchParams({ query: query.trim(), per_page: "8" }),
      {
        headers: {
          Authorization: config.broll.pexelsApiKey,
          "User-Agent": agent
        },
        signal: AbortSignal.timeout(20000)
      }
    )
    if (!response.ok)
      throw createHttpError(
        502,
        "Pexels search failed. Check the server key or use Wikimedia."
      )
    const data = await response.json()
    matches = ((kind === "video" ? data.videos : data.photos) ?? []).flatMap(
      (item) => {
        const file =
          kind === "video"
            ? item.video_files
                ?.filter(
                  (file) => file.file_type === "video/mp4" && file.width <= 1920
                )
                .sort((a, b) => b.width - a.width)[0]?.link
            : item.src?.large2x
        if (!allowedMediaUrl(file)) return []
        return [
          {
            title: query.trim() + " · " + item.id,
            mediaUrl: file,
            thumbnail: kind === "video" ? item.image : item.src?.medium,
            kind,
            provider: "pexels",
            author: item.user?.name ?? item.photographer,
            license: "Pexels License",
            licenseUrl: "https://www.pexels.com/license/",
            url: item.url
          }
        ]
      }
    )
  }
  const now = Date.now()
  for (const [id, item] of results) if (item.expiresAt < now) results.delete(id)
  const items = matches.slice(0, 8).map((item) => {
    const result = {
      ...item,
      id: randomUUID().replaceAll("-", ""),
      expiresAt: now + 15 * 60 * 1000
    }
    results.set(result.id, result)
    return publicResult(result)
  })
  while (results.size > 200) results.delete(results.keys().next().value)
  return {
    items,
    provider,
    note:
      provider === "mixkit"
        ? "Selected Mixkit footage, downloaded on demand. Free license is rechecked before importing; credits are included with exports. This is a small curated collection, not the full Mixkit library."
        : provider === "commons"
          ? "Public-domain, CC0, and CC BY results only. Source and license credits are included with exports."
          : "Stock from Pexels. Review the license and creator before importing."
  }
}
export function stockResult(id) {
  const item = results.get(id)
  if (!item || item.expiresAt < Date.now())
    throw createHttpError(
      404,
      "This stock result expired. Search again before importing."
    )
  return item
}
export async function downloadStock(item, target, externalSignal) {
  let url = item.mediaUrl
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(60000)])
    : AbortSignal.timeout(60000)
  let file
  try {
    if (item.provider === "mixkit") {
      // Only curated item pages may be requested; never accept user-supplied URLs.
      if (
        !searchCatalog(item.title).some(
          (clip) => clip.url === item.url && clip.mediaUrl === item.mediaUrl
        )
      )
        throw createHttpError(
          400,
          "Choose footage from the curated collection."
        )
      const page = await fetch(item.url, {
        redirect: "error",
        headers: { "User-Agent": agent },
        signal
      })
      if (!page.ok)
        throw createHttpError(
          502,
          "Could not verify the stock clip's license. Try again later."
        )
      const html = await page.text()
      if (html.length > 2 * 1024 * 1024)
        throw createHttpError(502, "Stock metadata was too large.")
      mixkitVideoMetadata(html, item.url)
    }
    for (let redirects = 0; redirects < 4; redirects++) {
      if (!allowedMediaUrl(url))
        throw createHttpError(400, "This stock media URL is not supported.")
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": agent },
        signal
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        url = new URL(response.headers.get("location"), url).href
        continue
      }
      if (!response.ok || !response.body)
        throw createHttpError(
          502,
          "Stock download failed. Try a different clip."
        )
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body.cancel()
        throw createHttpError(413, "Choose stock media under 80 MB.")
      }
      file = await fs.open(target, "wx")
      let bytes = 0
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (bytes > maxBytes)
          throw createHttpError(413, "Choose stock media under 80 MB.")
        await file.write(chunk)
      }
      await file.close()
      file = null
      if (!bytes) throw createHttpError(502, "The stock file was empty.")
      return target
    }
    throw createHttpError(502, "The stock download redirected too many times.")
  } catch (error) {
    await file?.close()
    await fs.unlink(target).catch(() => {})
    throw error
  }
}
