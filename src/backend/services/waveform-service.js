import fs from "node:fs/promises"
import { createReadStream } from "node:fs"

export async function audioWaveform(filePath, bins = 72) {
  const handle = await fs.open(filePath, "r")
  let dataOffset = 0,
    dataSize = 0
  try {
    const stat = await handle.stat()
    let offset = 12
    const header = Buffer.alloc(8)
    while (offset + 8 <= stat.size) {
      await handle.read(header, 0, 8, offset)
      const name = header.toString("ascii", 0, 4),
        length = header.readUInt32LE(4)
      if (name === "data") {
        dataOffset = offset + 8
        dataSize = Math.min(length, stat.size - dataOffset)
        break
      }
      offset += 8 + length + (length % 2)
    }
  } finally {
    await handle.close()
  }
  if (!dataSize) return []
  const peaks = Array(bins).fill(0)
  const samples = Math.floor(dataSize / 2)
  let sample = 0
  for await (const chunk of createReadStream(filePath, {
    start: dataOffset,
    end: dataOffset + dataSize - 1,
    highWaterMark: 65536
  })) {
    for (let i = 0; i + 1 < chunk.length; i += 2, sample++) {
      const bin = Math.min(bins - 1, Math.floor((sample / samples) * bins))
      peaks[bin] = Math.max(peaks[bin], Math.abs(chunk.readInt16LE(i)) / 32768)
    }
  }
  const max = Math.max(...peaks, 0.01)
  return peaks.map((peak) => Math.round((peak / max) * 1000) / 1000)
}
