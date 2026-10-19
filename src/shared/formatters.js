export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const precision = value >= 100 || exponent === 0 ? 0 : 1

  return `${value.toFixed(precision)} ${units[exponent]}`
}

export function formatDuration(durationSec = 0) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return "00:00"
  }

  const totalSeconds = Math.round(durationSec)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
