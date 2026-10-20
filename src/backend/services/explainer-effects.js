import fs from "node:fs/promises"

export const even = (value) => Math.max(2, Math.round(value / 2) * 2)
export function presenterBox(plan) {
  const { width, height } = plan.dimensions
  if (plan.settings.layout === "reference")
    return height >= width
      ? { width, height: even(height * 0.69), x: 0, y: even(height * 0.31) }
      : {
          width: even(width * 0.52),
          height: even(height * 0.88),
          x: even(width * 0.48),
          y: even(height * 0.12)
        }
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
  if (plan.settings.layout === "reference") return referenceGraphics(plan)
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
    if (visual.label && visual.endSec - visual.startSec > 0.65)
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

function referenceGraphics(plan) {
  const { width: w, height: h } = plan.dimensions
  const color = plan.settings.captionColor.slice(1)
  const accent =
    "&H00" + color.slice(4, 6) + color.slice(2, 4) + color.slice(0, 2)
  const portrait = h >= w,
    cx = Math.round(w * (portrait ? 0.5 : 0.25))
  const text = (start, end, value, tags) =>
    end - start < 0.1
      ? ""
      : "Dialogue: 2," +
        assTime(start) +
        "," +
        assTime(end) +
        ",Default,,0,0,0,,{\\bord0\\shad0" +
        tags +
        "}" +
        safeText(value) +
        "\n"
  const openSlots = (start, end) => {
    let slots = [[start, end]]
    for (const v of plan.visuals)
      slots = slots.flatMap(([a, b]) =>
        v.endSec <= a || v.startSec >= b
          ? [[a, b]]
          : [
              [a, Math.min(b, v.startSec)],
              [Math.max(a, v.endSec), b]
            ].filter(([x, y]) => y - x > 0.15)
      )
    return slots
  }
  let output = ""
  for (const card of plan.storyCards ?? []) {
    for (const [start, end] of openSlots(card.startSec, card.endSec)) {
      const numberEnd = Math.min(start + 0.5, end)
      output += text(
        start,
        numberEnd,
        String(card.number).padStart(2, "0"),
        "\\an5\\pos(" +
          cx +
          "," +
          Math.round(h * 0.19) +
          ")\\fs" +
          Math.round(w * 0.32) +
          "\\b1\\1c" +
          accent +
          "\\fscx120\\fscy120\\t(0,160,\\fscx100\\fscy100)\\fad(50,100)"
      )
      const contentStart = numberEnd
      output += text(
        contentStart,
        end,
        card.kicker,
        "\\an5\\pos(" +
          cx +
          "," +
          Math.round(h * 0.065) +
          ")\\fs" +
          Math.round(w * 0.028) +
          "\\fsp3\\1c&H00BBBBBB\\fad(90,100)"
      )
      output += text(
        contentStart,
        end,
        card.title,
        "\\an5\\move(" +
          cx +
          "," +
          Math.round(h * 0.2) +
          "," +
          cx +
          "," +
          Math.round(h * 0.18) +
          ",0,180)\\fs" +
          Math.round(w * (portrait ? 0.105 : 0.055)) +
          "\\b1\\1c" +
          accent +
          "\\fad(90,100)"
      )
      // Moving brackets and a connector are original vector graphics.
      const y = Math.round(h * 0.31),
        unit = Math.round(w * 0.1)
      output +=
        "Dialogue: 1," +
        assTime(contentStart) +
        "," +
        assTime(end) +
        ",Default,,0,0,0,,{\\an7\\pos(" +
        (cx - unit * 2) +
        "," +
        y +
        ")\\p1\\bord2\\shad0\\1a&HFF&\\3c" +
        accent +
        "\\fad(100,120)}m 0 0 l " +
        unit +
        " 0 " +
        unit +
        " " +
        unit +
        " 0 " +
        unit +
        " 0 0 m " +
        unit +
        " " +
        Math.round(unit / 2) +
        " l " +
        unit * 3 +
        " " +
        Math.round(unit / 2) +
        " m " +
        unit * 3 +
        " 0 l " +
        unit * 4 +
        " 0 " +
        unit * 4 +
        " " +
        unit +
        " " +
        unit * 3 +
        " " +
        unit +
        " " +
        unit * 3 +
        " 0{\\p0}\n"
    }
  }
  for (const [index, visual] of plan.visuals.entries()) {
    output += text(
      visual.startSec,
      Math.min(visual.startSec + 0.5, visual.endSec),
      String(index + 1).padStart(2, "0"),
      "\\an5\\pos(" +
        cx +
        "," +
        Math.round(h * 0.07) +
        ")\\fs" +
        Math.round(w * 0.14) +
        "\\b1\\1c" +
        accent +
        "\\fad(40,100)"
    )
  }
  return output
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
  if (["presenter", "reference"].includes(plan.settings.layout)) {
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
    const presenter = ["presenter", "reference"].includes(plan.settings.layout)
    const reference = plan.settings.layout === "reference"
    const portrait = h >= w
    const vw = presenter ? even(w * (portrait ? 0.94 : 0.47)) : w,
      vh = presenter
        ? even(h * (portrait ? (reference ? 0.34 : 0.32) : 0.65))
        : h
    const x = presenter ? even(w * 0.03) : 0,
      y = presenter
        ? even(h * (portrait ? (reference ? 0.04 : 0.18) : 0.24))
        : 0
    const transition =
      plan.settings.transition === "auto" ||
      plan.settings.visualMode === "captions"
        ? visual.transition
        : plan.settings.transition
    const enter = transition === "cut" ? 0 : Math.min(0.18, length / 4)
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
        ",setsar=1,format=yuva420p" +
        (enter
          ? ",fade=t=in:st=0:d=" +
            fixed(enter) +
            ":alpha=1,fade=t=out:st=" +
            fixed(Math.max(0, length - enter)) +
            ":d=" +
            fixed(enter) +
            ":alpha=1"
          : "") +
        ",setpts=PTS+" +
        fixed(visual.startSec) +
        "/TB[broll" +
        index +
        "]"
    )
    const animatedX =
      transition === "slide"
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
