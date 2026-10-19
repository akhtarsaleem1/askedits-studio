import fs from "node:fs/promises"

export const even = (value) => Math.max(2, Math.round(value / 2) * 2)
export function presenterBox(plan) {
  const { width, height } = plan.dimensions
  return height >= width
    ? {
        width: even(width * 0.94),
        height: even(height * 0.45),
        x: even(width * 0.03),
        y: even(height * 0.525)
      }
    : {
        width: even(width * 0.44),
        height: even(height * 0.82),
        x: even(width * 0.53),
        y: even(height * 0.13)
      }
}
const fixed = (value) => Number(value).toFixed(4)
const assTime = (value) => {
  const cs = Math.round(Math.max(0, value) * 100)
  return (
    Math.floor(cs / 360000) +
    ":" +
    String(Math.floor(cs / 6000) % 60).padStart(2, "0") +
    ":" +
    String(Math.floor(cs / 100) % 60).padStart(2, "0") +
    "." +
    String(cs % 100).padStart(2, "0")
  )
}
const safeText = (text) =>
  String(text)
    .replace(/[{}\\\r\n]/g, " ")
    .trim()
export function graphicsEvents(plan) {
  if (!plan.settings.graphics) return ""
  const { width: w, height: h } = plan.dimensions
  const color = plan.settings.captionColor.slice(1)
  const accent =
    "&H00" + color.slice(4, 6) + color.slice(2, 4) + color.slice(0, 2)
  const event = (start, end, text, tags) =>
    "Dialogue: 2," +
    assTime(start) +
    "," +
    assTime(end) +
    ",Default,,0,0,0,,{" +
    tags +
    "}" +
    safeText(text) +
    "\n"
  const introEnd = Math.min(
    1.8,
    plan.summary.outputDurationSec,
    plan.visuals[0]?.startSec ?? 1.8
  )
  let result =
    plan.settings.headline && introEnd > 0.3
      ? event(
          0,
          introEnd,
          plan.settings.headline.toUpperCase(),
          "\\an8\\move(" +
            Math.round(w / 2) +
            "," +
            Math.round(h * 0.04) +
            "," +
            Math.round(w / 2) +
            "," +
            Math.round(h * 0.08) +
            ",0,220)\\fs" +
            Math.round(w * 0.06) +
            "\\b1\\1c" +
            accent +
            "\\fad(90,170)"
        )
      : ""
  plan.visuals.forEach((visual, index) => {
    result += event(
      visual.startSec,
      Math.min(visual.startSec + 0.6, visual.endSec),
      String(index + 1).padStart(2, "0"),
      "\\an5\\pos(" +
        Math.round(w / 2) +
        "," +
        Math.round(h * 0.13) +
        ")\\fs" +
        Math.round(w * 0.23) +
        "\\b1\\1c" +
        accent +
        "\\fscx125\\fscy125\\t(0,150,\\fscx100\\fscy100)\\fad(45,100)"
    )
    if (visual.label)
      result += event(
        visual.startSec + 0.55,
        Math.min(visual.startSec + 2, visual.endSec),
        visual.label,
        "\\an8\\pos(" +
          Math.round(w / 2) +
          "," +
          Math.round(h * 0.085) +
          ")\\fs" +
          Math.round(w * 0.052) +
          "\\b1\\1c&H00FFFFFF\\fad(80,100)"
      )
  })
  return result
}

// Original sound design synthesized locally. No third-party recordings.
export async function createEffectsTrack(plan, filePath) {
  if (!plan.sfx.length) return null
  const rate = 22050
  const seconds = Math.min(
    plan.summary.outputDurationSec,
    plan.sfx.at(-1).timeSec + 0.7
  )
  const count = Math.ceil(seconds * rate),
    header = Buffer.alloc(44)
  header.write("RIFF")
  header.writeUInt32LE(36 + count * 2, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(count * 2, 40)
  const file = await fs.open(filePath, "w")
  let seed = 48271
  const intensity = plan.settings.sfx === "punchy" ? 1 : 0.55
  try {
    await file.write(header)
    for (let offset = 0; offset < count; offset += 8192) {
      const length = Math.min(8192, count - offset),
        samples = Buffer.alloc(length * 2)
      const events = plan.sfx.filter(
        (event) =>
          event.timeSec < (offset + length) / rate &&
          event.timeSec + 0.7 > offset / rate
      )
      for (let i = 0; i < length; i++) {
        const time = (offset + i) / rate
        let value = 0
        for (const event of events) {
          const t = time - event.timeSec
          if (t < 0 || t > 0.65) continue
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
          const noise = seed / 2147483648 - 1
          if (event.type === "whoosh")
            value +=
              (noise * 0.28 +
                Math.sin(2 * Math.PI * (180 * t + 1100 * t * t)) * 0.12) *
              Math.sin(Math.PI * Math.min(1, t / 0.4)) *
              Math.exp(-t * 5)
          if (event.type === "click")
            value +=
              (noise * 0.16 + Math.sin(2 * Math.PI * 1250 * t) * 0.25) *
              Math.exp(-t * 85)
          if (event.type === "impact")
            value +=
              (Math.sin(
                2 * Math.PI * (65 * t + 1.5 * (1 - Math.exp(-t * 18)))
              ) *
                0.55 +
                noise * 0.12) *
              Math.exp(-t * 13)
        }
        samples.writeInt16LE(
          Math.round(Math.max(-0.9, Math.min(0.9, value * intensity)) * 32767),
          i * 2
        )
      }
      await file.write(samples)
    }
  } finally {
    await file.close()
  }
  return filePath
}

export function composeExplainerVideo(graph, plan, basePad, visualInputs) {
  const { width: w, height: h } = plan.dimensions
  const duration = fixed(plan.summary.outputDurationSec)
  let current = basePad
  if (plan.settings.layout === "presenter") {
    // Low-resolution procedural contour field, enlarged after evaluation.
    graph.push(
      "color=c=0x080b09:s=288x512:r=30:d=" +
        duration +
        (plan.settings.graphics
          ? ",format=gray,geq=lum='if(lt(abs(sin(X/23+2*sin(Y/41+N/90))),0.045),78,8)'"
          : "") +
        ",scale=" +
        w +
        ":" +
        h +
        ",format=yuv420p,settb=AVTB[contours]"
    )
    const box = presenterBox(plan)
    graph.push(
      "[contours][" +
        current +
        "]overlay=x=" +
        box.x +
        ":y=" +
        box.y +
        ":shortest=1[layout]"
    )
    current = "layout"
  }
  visualInputs.forEach((input, index) => {
    const visual = plan.visuals[index],
      length = visual.endSec - visual.startSec
    const presenter = plan.settings.layout === "presenter"
    const portrait = h >= w
    const vw = presenter ? even(w * (portrait ? 0.94 : 0.47)) : w,
      vh = presenter ? even(h * (portrait ? 0.32 : 0.65)) : h
    const x = presenter ? even(w * 0.03) : 0,
      y = presenter ? even(h * (portrait ? 0.18 : 0.24)) : 0
    const enter = Math.min(0.16, length / 4)
    const resize =
      visual.kind === "image"
        ? "format=rgba,scale=" +
          vw +
          ":" +
          vh +
          ":force_original_aspect_ratio=decrease:force_divisible_by=2,pad=" +
          vw +
          ":" +
          vh +
          ":(ow-iw)/2:(oh-ih)/2:color=black@0"
        : "scale=" +
          vw +
          ":" +
          vh +
          ":force_original_aspect_ratio=increase:force_divisible_by=2,crop=" +
          vw +
          ":" +
          vh
    graph.push(
      "[" +
        input +
        ":v]trim=duration=" +
        fixed(length) +
        ",setpts=PTS-STARTPTS,fps=30," +
        resize +
        ",setsar=1,format=yuva420p,fade=t=in:st=0:d=" +
        fixed(enter) +
        ":alpha=1,fade=t=out:st=" +
        fixed(Math.max(0, length - enter)) +
        ":d=" +
        fixed(enter) +
        ":alpha=1,setpts=PTS+" +
        fixed(visual.startSec) +
        "/TB[broll" +
        index +
        "]"
    )
    const animatedX =
      plan.settings.transition === "slide"
        ? "'" +
          x +
          "+" +
          w +
          "*max(0,1-(t-" +
          fixed(visual.startSec) +
          ")/" +
          fixed(enter) +
          ")'"
        : String(x)
    graph.push(
      "[" +
        current +
        "][broll" +
        index +
        "]overlay=x=" +
        animatedX +
        ":y=" +
        y +
        ":enable='between(t," +
        fixed(visual.startSec) +
        "," +
        fixed(visual.endSec) +
        ")':eof_action=pass:repeatlast=0[visual" +
        index +
        "]"
    )
    current = "visual" + index
  })
  return current
}
