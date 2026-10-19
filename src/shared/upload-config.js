export const SUPPORTED_VIDEO_FORMATS = [
  { label: "MP4", extension: ".mp4", mimeTypes: ["video/mp4"] },
  { label: "MOV", extension: ".mov", mimeTypes: ["video/quicktime"] },
  { label: "WebM", extension: ".webm", mimeTypes: ["video/webm"] },
  { label: "MKV", extension: ".mkv", mimeTypes: ["video/x-matroska"] }
]

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024
export const DEFAULT_CHUNK_SIZE_BYTES = 5 * 1024 * 1024

export function getSupportedFormatLabels() {
  return SUPPORTED_VIDEO_FORMATS.map((format) => format.label)
}

export function isSupportedVideoFile(filename = "") {
  const lowerName = filename.toLowerCase()
  return SUPPORTED_VIDEO_FORMATS.some(({ extension }) => lowerName.endsWith(extension))
}

export function validateVideoSelection({ name = "", size = 0 } = {}) {
  const errors = []

  if (!name) {
    errors.push("Please choose a video file before uploading.")
  }

  if (!isSupportedVideoFile(name)) {
    errors.push(`Unsupported file format. Use ${getSupportedFormatLabels().join(", ")}.`)
  }

  if (!Number.isSafeInteger(size) || size <= 0) {
    errors.push("The selected file appears to be empty or has an invalid size.")
  }

  if (size > MAX_UPLOAD_SIZE_BYTES) {
    errors.push("This file is larger than the current 2 GB upload limit.")
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
