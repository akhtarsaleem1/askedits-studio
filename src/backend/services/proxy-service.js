import config from "../../../config/default.js"

/**
 * Select the optimal proxy tier based on source video resolution.
 * Higher-res sources get higher-tier proxies to maintain usable quality.
 *
 * @param {{ width: number, height: number }} sourceMeta
 * @returns {{ tier: string, config: object }}
 */
export function selectProxyTier(sourceMeta) {
  const tiers = config.media.proxy.tiers
  const sourceHeight = sourceMeta?.height ?? 0
  const sourceWidth = sourceMeta?.width ?? 0
  const maxDimension = Math.max(sourceWidth, sourceHeight)

  // For sources <= 720p, use low proxy (no point proxying at same res)
  if (maxDimension <= 720) {
    return { tier: "low", config: tiers.low }
  }

  // For sources 721p–1080p, use medium proxy
  if (maxDimension <= 1920) {
    return { tier: "medium", config: tiers.medium }
  }

  // For sources > 1080p (1440p, 4K, etc.), use high proxy
  return { tier: "high", config: tiers.high }
}

/**
 * Build the FFmpeg scale filter for a specific proxy tier.
 *
 * @param {object} tierConfig
 * @returns {string}
 */
export function buildProxyScaleFilterForTier(tierConfig) {
  return `scale=${tierConfig.width}:${tierConfig.maxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`
}

/**
 * Get proxy generation metadata for an asset.
 *
 * @param {object} assetRecord
 * @returns {{ ready: boolean, tier: string|null, resolution: string|null }}
 */
export function getProxyStatus(assetRecord) {
  const proxyMeta = assetRecord?.proxyMeta

  if (!proxyMeta) {
    return { ready: false, tier: null, resolution: null }
  }

  return {
    ready: true,
    tier: proxyMeta.tier,
    resolution: `${proxyMeta.width}x${proxyMeta.height}`
  }
}

/**
 * Build FFmpeg arguments for adaptive proxy generation.
 *
 * @param {object} sourceMeta - Source video metadata
 * @returns {{ scaleFilter: string, crf: number, preset: string, tier: string }}
 */
export function buildAdaptiveProxyArgs(sourceMeta) {
  const { tier, config: tierConfig } = selectProxyTier(sourceMeta)

  return {
    scaleFilter: buildProxyScaleFilterForTier(tierConfig),
    crf: tierConfig.crf,
    preset: tierConfig.preset,
    tier,
    width: tierConfig.width,
    maxHeight: tierConfig.maxHeight
  }
}
