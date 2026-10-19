const locks = new Map()

// Serialize upload writes so parallel chunk retries cannot overwrite metadata.
export async function withAssetLock(assetId, action) {
  const previous = locks.get(assetId) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(action)
  locks.set(assetId, current)
  try {
    return await current
  } finally {
    if (locks.get(assetId) === current) locks.delete(assetId)
  }
}
