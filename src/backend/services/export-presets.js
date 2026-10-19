/**
 * Export Presets — Defines resolutions, aspect ratios, and encoding settings for different platforms.
 */

export const EXPORT_FORMATS = {
  tiktok: {
    name: "TikTok / Shorts / Reels (9:16)",
    width: 1080,
    height: 1920
  },
  youtube_landscape: {
    name: "YouTube Landscape (16:9)",
    width: 1920,
    height: 1080
  },
  instagram_square: {
    name: "Instagram Square (1:1)",
    width: 1080,
    height: 1080
  },
  twitter: {
    name: "Twitter / X (16:9 720p)",
    width: 1280,
    height: 720
  },
  original: {
    name: "Original (No Change)",
    width: null,
    height: null
  }
}

export const EXPORT_QUALITIES = {
  draft: {
    name: "Draft (Fastest)",
    crf: 28,
    preset: "ultrafast"
  },
  standard: {
    name: "Standard (Balanced)",
    crf: 23,
    preset: "fast"
  },
  high: {
    name: "High (Great Quality)",
    crf: 18,
    preset: "medium"
  },
  max: {
    name: "Max (Archival)",
    crf: 15,
    preset: "slow"
  }
}

export function generateExportScaleFilter({ formatId, sourceMeta, resizeMode = "crop_to_fill" }) {
  if (formatId === "original" || !EXPORT_FORMATS[formatId]) {
    return "setsar=1"
  }

  const target = EXPORT_FORMATS[formatId]
  
  if (resizeMode === "fit_with_bars") {
    // To avoid stretching, we scale to fit within the bounding box, then pad with black bars.
    // force_original_aspect_ratio=decrease means it will scale down to fit inside WxH.
    // pad=W:H:(ow-iw)/2:(oh-ih)/2 centers the video on a black background of exactly WxH.
    return `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
  } else {
    // crop_to_fill (default) - scale to cover bounding box, crop the excess
    return `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${target.width}:${target.height},setsar=1`
  }
}
