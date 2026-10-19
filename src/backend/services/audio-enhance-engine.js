/**
 * Audio Enhancement Engine — Generates FFmpeg filters for voice cleanup and leveling.
 */

export function generateAudioEnhanceFilters({ settings }) {
  if (!settings?.voiceCleanup) {
    return { filterGraph: "" }
  }

  const filters = []

  // 1. Highpass/Lowpass to remove rumble (below 80Hz) and extreme hiss (above 13000Hz)
  filters.push(`highpass=f=80`)
  filters.push(`lowpass=f=13000`)

  // 2. Denoise (afftdn works well without external models)
  // nr=12: noise reduction in dB (12 is mild/moderate)
  // nf=-40: noise floor in dB
  filters.push(`afftdn=nr=12:nf=-40`)

  // 3. Compressor to level the voice out
  // threshold=-15dB, ratio=3:1, attack=5ms, release=50ms, makeup=3dB
  filters.push(`acompressor=threshold=-15dB:ratio=3:attack=5:release=50:makeup=3`)

  return { filterGraph: filters.join(",") }
}
