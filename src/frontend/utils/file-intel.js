export function extractVideoPreview(file) {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const video = document.createElement("video")

    const cleanup = () => {
      video.removeAttribute("src")
      video.load()
    }

    const resolveWithSnapshot = () => {
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0
      let thumbnailDataUrl = null

      try {
        const canvas = document.createElement("canvas")
        canvas.width = width || 640
        canvas.height = height || 360

        const context = canvas.getContext("2d")

        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.84)
        }
      } catch {
        thumbnailDataUrl = null
      }

      cleanup()

      resolve({
        previewUrl,
        thumbnailDataUrl,
        durationSec,
        width,
        height
      })
    }

    video.preload = "metadata"
    video.muted = true
    video.playsInline = true

    video.addEventListener(
      "loadedmetadata",
      () => {
        const durationSec = Number.isFinite(video.duration) ? video.duration : 0

        if (durationSec > 0.25 || video.duration === Infinity) {
          video.currentTime = durationSec > 0 ? Math.min(durationSec / 3, 1.5) : 0.1
          return
        }

        if (video.readyState >= 2) resolveWithSnapshot()
        else video.addEventListener("loadeddata", resolveWithSnapshot, { once: true })
      },
      { once: true }
    )

    video.addEventListener("seeked", resolveWithSnapshot, { once: true })
    video.addEventListener(
      "error",
      () => {
        cleanup()
        URL.revokeObjectURL(previewUrl)
        reject(new Error("The selected file could not be previewed in the browser."))
      },
      { once: true }
    )

    video.src = previewUrl
    video.load()
  })
}
