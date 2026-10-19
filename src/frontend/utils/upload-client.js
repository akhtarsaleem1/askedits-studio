const API_ROOT = "/api/uploads"

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`)
  }

  return payload
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort)
      resolve()
    }, ms)

    const handleAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException("The request was cancelled.", "AbortError"))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    signal?.addEventListener("abort", handleAbort, { once: true })
  })
}

export async function createUploadSession(payload, signal) {
  const response = await fetch(`${API_ROOT}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal
  })

  return parseResponse(response)
}

export async function uploadFileInChunks({ assetId, file, chunkSize, signal, onProgress }) {
  const totalBytes = file.size
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize))
  let uploadedBytes = 0

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, totalBytes)
    const chunk = file.slice(start, end)

    const response = await fetch(`${API_ROOT}/${assetId}/chunks/${index}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream"
      },
      body: chunk,
      signal
    })

    const payload = await parseResponse(response)
    uploadedBytes += chunk.size

    onProgress?.({
      asset: payload.asset,
      chunkIndex: index,
      totalChunks,
      uploadedBytes,
      totalBytes,
      percent: Math.round((uploadedBytes / totalBytes) * 100)
    })
  }
}

export async function completeUploadSession(assetId, signal) {
  const response = await fetch(`${API_ROOT}/${assetId}/complete`, {
    method: "POST",
    signal
  })

  return parseResponse(response)
}

export async function reprocessUploadSession(assetId, signal) {
  const response = await fetch(`${API_ROOT}/${assetId}/reprocess`, {
    method: "POST",
    signal
  })

  return parseResponse(response)
}

export async function analyzeUploadSession(assetId, signal) {
  const response = await fetch(`${API_ROOT}/${assetId}/analyze`, {
    method: "POST",
    signal
  })

  return parseResponse(response)
}

export async function getUploadStatus(assetId, signal) {
  const response = await fetch(`${API_ROOT}/${assetId}/status`, {
    signal
  })

  return parseResponse(response)
}

export async function waitForProcessing(assetId, { signal, intervalMs = 2000, onStatus } = {}) {
  while (true) {
    const payload = await getUploadStatus(assetId, signal)
    onStatus?.(payload.asset)

    if (payload.asset.processingStatus === "ready" || payload.asset.processingStatus === "failed") {
      return payload.asset
    }

    await delay(intervalMs, signal)
  }
}

export async function waitForAiAnalysis(assetId, { signal, intervalMs = 3000, onStatus } = {}) {
  while (true) {
    const payload = await getUploadStatus(assetId, signal)
    onStatus?.(payload.asset)

    const status = payload.asset.aiAnalysis?.status
    if (status === "ready" || status === "failed" || status === "skipped") {
      return payload.asset
    }

    await delay(intervalMs, signal)
  }
}

