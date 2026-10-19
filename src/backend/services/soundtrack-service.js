import fs from "node:fs/promises"

// Small original procedural music beds. No third-party recordings or network calls.
export async function createSoundtrack(mood, filePath) {
  const sampleRate = 44100,
    seconds = 16,
    count = sampleRate * seconds
  const data = Buffer.alloc(44 + count * 2)
  data.write("RIFF", 0)
  data.writeUInt32LE(data.length - 8, 4)
  data.write("WAVEfmt ", 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(sampleRate, 24)
  data.writeUInt32LE(sampleRate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write("data", 36)
  data.writeUInt32LE(count * 2, 40)
  const chords =
    mood === "cinematic"
      ? [
          [130.81, 155.56, 196],
          [103.83, 130.81, 155.56],
          [116.54, 146.83, 174.61],
          [98, 123.47, 146.83]
        ]
      : [
          [130.81, 164.81, 196],
          [110, 130.81, 164.81],
          [87.31, 110, 130.81],
          [98, 123.47, 146.83]
        ]
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate,
      chord = chords[Math.floor(t / 4) % chords.length]
    const envelope =
      Math.min(1, (t % 4) / 0.4, (4 - (t % 4)) / 0.6) *
      Math.min(1, t / 0.2, (seconds - t) / 0.25)
    let value =
      chord.reduce(
        (sum, frequency) =>
          sum +
          Math.sin(2 * Math.PI * frequency * t) * 0.1 +
          Math.sin(2 * Math.PI * frequency * 2 * t) * 0.025,
        0
      ) * envelope
    const beat = t % (mood === "pulse" ? 0.5 : 1)
    if (mood === "pulse")
      value +=
        Math.sin(2 * Math.PI * (48 * beat + 32 * (1 - Math.exp(-beat * 18)))) *
        Math.exp(-beat * 16) *
        0.27
    if (mood === "focus")
      value +=
        Math.sin(2 * Math.PI * chord[Math.floor(t * 2) % 3] * 4 * t) *
        Math.exp(-(t % 0.5) * 9) *
        0.07
    data.writeInt16LE(
      Math.round(Math.max(-0.9, Math.min(0.9, value)) * 32767),
      44 + i * 2
    )
  }
  await fs.writeFile(filePath, data)
  return filePath
}
