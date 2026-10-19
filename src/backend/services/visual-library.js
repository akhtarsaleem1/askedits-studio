import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import config from "../../../config/default.js"
import { runCommand } from "../utils/process-runner.js"
import { createHttpError } from "../utils/errors.js"
import { updateAssetRecord } from "./upload-repository.js"

export function publicVisual(item, projectId) {
  return {
    id: item.id,
    originalName: item.originalName,
    kind: item.kind,
    width: item.width,
    height: item.height,
    durationSec: item.durationSec,
    source: item.source,
    thumbnail: "/api/studio/" + projectId + "/visuals/" + item.id + "/thumbnail"
  }
}
export async function registerVisual(
  record,
  incomingFile,
  originalName,
  source = {
    provider: "upload",
    license: "User supplied — review your usage rights"
  }
) {
  if ((record.visualAssets?.length ?? 0) >= 24)
    throw createHttpError(
      409,
      "This project already contains 24 B-roll assets."
    )
  const { stdout } = await runCommand({
    command: config.media.ffprobeBin,
    args: [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      incomingFile
    ],
    timeoutMs: 15000
  })
  const probe = JSON.parse(stdout),
    stream = probe.streams?.find((item) => item.codec_type === "video")
  const image =
    ["png", "mjpeg", "webp"].includes(stream?.codec_name) &&
    /image2|jpeg_pipe|png_pipe|webp_pipe/.test(probe.format?.format_name ?? "")
  const durationSec = Number(probe.format?.duration ?? stream?.duration ?? 0)
  if (
    !stream ||
    !(stream.width > 0 && stream.height > 0) ||
    Math.max(stream.width, stream.height) > 8192 ||
    (!image && !(durationSec > 0.1))
  )
    throw createHttpError(
      415,
      "Choose a readable video, PNG, JPG, or WebP image up to 8192 pixels."
    )
  const id = randomUUID().replaceAll("-", "")
  await fs.mkdir(record.paths.brollDir, { recursive: true })
  const extension = image
    ? { png: "png", mjpeg: "jpg", webp: "webp" }[stream.codec_name]
    : /webm|matroska/.test(probe.format.format_name)
      ? "webm"
      : "mp4"
  const target = path.join(record.paths.brollDir, id + "." + extension),
    thumbnailPath = path.join(record.paths.brollDir, id + ".jpg")
  try {
    await fs.rename(incomingFile, target)
    await runCommand({
      command: config.media.ffmpegBin,
      args: [
        "-hide_banner",
        "-y",
        "-threads",
        "2",
        "-i",
        target,
        "-frames:v",
        "1",
        "-vf",
        "scale=400:-2",
        thumbnailPath
      ],
      timeoutMs: 30000
    })
    const item = {
      id,
      originalName: path.basename(originalName).slice(0, 160),
      kind: image ? "image" : "video",
      width: stream.width,
      height: stream.height,
      durationSec: image ? null : durationSec,
      path: target,
      thumbnailPath,
      source
    }
    await updateAssetRecord(record.assetId, (current) => {
      current.visualAssets ??= []
      if (current.visualAssets.length >= 24)
        throw createHttpError(
          409,
          "This project already contains 24 B-roll assets."
        )
      current.visualAssets.push(item)
    })
    return publicVisual(item, record.assetId)
  } catch (error) {
    await Promise.all([
      fs.unlink(target).catch(() => {}),
      fs.unlink(thumbnailPath).catch(() => {})
    ])
    throw error
  }
}
