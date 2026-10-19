export async function api(path, options = {}) {
  const response = await fetch("/api/studio" + path, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      body.error || body.detail || "The request could not be completed."
    )
  return body
}
export const jsonRequest = (body, method = "POST", signal) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal
})
export const formatTime = (seconds) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0))
  return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0")
}
