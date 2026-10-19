import fs from "node:fs/promises"
import path from "node:path"
import config from "../../../config/default.js"
import { buildEditPlan, captionsToSrt } from "../../shared/edit-planner.js"
import { getEditTemplate } from "../../shared/edit-templates.js"
import { runCommand } from "../utils/process-runner.js"
import { createSoundtrack } from "./soundtrack-service.js"
import { getFFmpegStatus } from "./ffmpeg-runtime.js"

export async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch {
    return null
  }
}
export async function planTemplateEdit(record, settings) {
  return buildEditPlan({
    media: record.media,
    settings,
    silence: (await readOptionalJson(record.paths.silenceDetectionFile)) ?? {},
    transcript: await readOptionalJson(record.paths.transcriptFile),
    hasCustomMusic: Boolean(record.music?.path)
  })
}
const n = (value) => Number(value).toFixed(4)
const assTime = (value) => {
  const cs = Math.max(0, Math.round(value * 100))
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
export function makeAssCaptions(plan) {
  const { width, height } = plan.dimensions
  const bold = plan.settings.captionStyle === "bold"
  const minimal = plan.settings.captionStyle === "minimal"
  const size = Math.round(
    Math.min(width, height) * (bold ? 0.065 : minimal ? 0.04 : 0.048)
  )
  const color = plan.settings.captionColor.slice(1)
  const highlight =
    "&H00" + color.slice(4, 6) + color.slice(2, 4) + color.slice(0, 2)
  const header =
    "[Script Info]\nScriptType: v4.00+\nPlayResX: " +
    width +
    "\nPlayResY: " +
    height +
    "\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans," +
    size +
    ",&H00FFFFFF," +
    highlight +
    ",&H00201812,&H70000000," +
    (bold ? -1 : 0) +
    ",0,0,0,100,100,0,0,1," +
    Math.max(1, Math.round(size / 18)) +
    ",1,2," +
    Math.round(width * 0.07) +
    "," +
    Math.round(width * 0.07) +
    "," +
    Math.round(height * 0.16) +
    ",1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
  return (
    header +
    plan.captions
      .map((caption) => {
        const text = caption.text
          .replace(/[{}\\]/g, "")
          .replace(/\r?\n/g, "\\N")
        const tag = bold
          ? "{\\fad(55,65)\\fscx105\\fscy105\\t(0,110,\\fscx100\\fscy100)\\1c" +
            highlight +
            "}"
          : "{\\fad(80,80)\\1c" + highlight + "}"
        return (
          "Dialogue: 0," +
          assTime(caption.startSec) +
          "," +
          assTime(caption.endSec) +
          ",Default,,0,0,0,," +
          tag +
          text +
          "\n"
        )
      })
      .join("")
  )
}
export function buildTemplateFilterGraph(
  plan,
  { hasAudio, musicInput = null, assName = null }
) {
  const { width: w, height: h } = plan.dimensions
  const template = getEditTemplate(plan.templateId)
  const segments = plan.segments
  const graph = []
  graph.push(
    "[0:v]split=" +
      segments.length +
      segments.map((_, i) => "[vi" + i + "]").join("")
  )
  const audioInput = hasAudio ? "0:a" : "1:a"
  graph.push(
    "[" +
      audioInput +
      "]asplit=" +
      segments.length +
      segments.map((_, i) => "[ai" + i + "]").join("")
  )
  for (let i = 0; i < segments.length; i++) {
    const shot = segments[i]
    const base =
      "[vi" +
      i +
      "]trim=start=" +
      n(shot.startSec) +
      ":end=" +
      n(shot.endSec) +
      ",setpts=PTS-STARTPTS,fps=30,settb=AVTB"
    if (plan.settings.framing === "fit") {
      graph.push(base + ",split=2[bg" + i + "][fg" + i + "]")
      graph.push(
        "[bg" +
          i +
          "]scale=" +
          w +
          ":" +
          h +
          ":force_original_aspect_ratio=increase:force_divisible_by=2,crop=" +
          w +
          ":" +
          h +
          ",boxblur=20:2[blur" +
          i +
          "]"
      )
      graph.push(
        "[fg" +
          i +
          "]scale=" +
          w +
          ":" +
          h +
          ":force_original_aspect_ratio=decrease:force_divisible_by=2[fit" +
          i +
          "]"
      )
      graph.push(
        "[blur" +
          i +
          "][fit" +
          i +
          "]overlay=(W-w)/2:(H-h)/2,setsar=1[frame" +
          i +
          "]"
      )
    } else {
      graph.push(
        base +
          ",scale=" +
          w +
          ":" +
          h +
          ":force_original_aspect_ratio=increase:force_divisible_by=2,crop=" +
          w +
          ":" +
          h +
          ":(iw-ow)*" +
          n(plan.settings.focalX / 100) +
          ":(ih-oh)*" +
          n(plan.settings.focalY / 100) +
          ",setsar=1[frame" +
          i +
          "]"
      )
    }
    const effects = []
    if (plan.settings.motion && shot.zoom > 1) {
      if (template.kind === "montage")
        effects.push(
          "zoompan=z='min(1+" +
            n(shot.zoom - 1) +
            "*on/" +
            Math.max(1, Math.round((shot.endSec - shot.startSec) * 30)) +
            "," +
            shot.zoom +
            ")':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=" +
            w +
            "x" +
            h +
            ":fps=30"
        )
      else
        effects.push(
          "scale=" +
            Math.ceil((w * shot.zoom) / 2) * 2 +
            ":" +
            Math.ceil((h * shot.zoom) / 2) * 2 +
            ",crop=" +
            w +
            ":" +
            h
        )
    }
    if (plan.settings.colorGrade)
      effects.push(
        "eq=contrast=" +
          template.grade.contrast +
          ":saturation=" +
          template.grade.saturation +
          ":brightness=" +
          template.grade.brightness
      )
    effects.push("format=yuv420p", "setsar=1", "settb=AVTB")
    graph.push("[frame" + i + "]" + effects.join(",") + "[v" + i + "]")
    graph.push(
      "[ai" +
        i +
        "]atrim=start=" +
        n(shot.startSec) +
        ":end=" +
        n(shot.endSec) +
        ",asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a" +
        i +
        "]"
    )
  }
  let v = "v0",
    a = "a0"
  for (let i = 1; i < segments.length; i++) {
    const shot = segments[i]
    if (shot.transitionSec > 0) {
      graph.push(
        "[" +
          v +
          "][v" +
          i +
          "]xfade=transition=fade:duration=" +
          n(shot.transitionSec) +
          ":offset=" +
          n(shot.outputStartSec) +
          "[vx" +
          i +
          "]"
      )
      graph.push(
        "[" +
          a +
          "][a" +
          i +
          "]acrossfade=d=" +
          n(shot.transitionSec) +
          ":c1=tri:c2=tri[ax" +
          i +
          "]"
      )
    } else {
      graph.push(
        "[" +
          v +
          "][" +
          a +
          "][v" +
          i +
          "][a" +
          i +
          "]concat=n=2:v=1:a=1[vx" +
          i +
          "][ax" +
          i +
          "]"
      )
    }
    v = "vx" + i
    a = "ax" + i
  }
  const duration = plan.summary.outputDurationSec
  const fade = Math.min(template.kind === "montage" ? 0.35 : 0.08, duration / 4)
  graph.push(
    "[" +
      v +
      "]fps=30,settb=1/30,fade=t=in:st=0:d=" +
      n(fade) +
      ",fade=t=out:st=" +
      n(Math.max(0, duration - fade)) +
      ":d=" +
      n(fade) +
      (assName ? ",ass=filename='" + assName + "'" : "") +
      ",format=yuv420p[vout]"
  )
  const audio = []
  if (plan.settings.voiceCleanup && hasAudio)
    audio.push(
      "highpass=f=75",
      "afftdn=nr=8:nf=-40",
      "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
  audio.push(
    "aresample=48000",
    "volume=" + n(plan.settings.sourceVolume),
    "apad",
    "atrim=duration=" + n(duration)
  )
  graph.push("[" + a + "]" + audio.join(",") + "[voice]")
  if (musicInput !== null) {
    graph.push(
      "[" +
        musicInput +
        ":a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=" +
        n(duration) +
        ",asetpts=PTS-STARTPTS,volume=" +
        n(plan.settings.musicVolume) +
        ",afade=t=in:d=0.3,afade=t=out:st=" +
        n(Math.max(0, duration - 0.5)) +
        ":d=0.5[music]"
    )
    if (hasAudio && plan.settings.sourceVolume > 0) {
      graph.push("[voice]asplit=2[dry][side]")
      graph.push(
        "[music][side]sidechaincompress=threshold=.025:ratio=6:attack=20:release=350[ducked]"
      )
      graph.push(
        "[dry][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[aout]"
      )
    } else
      graph.push(
        "[voice][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[aout]"
      )
  } else graph.push("[voice]alimiter=limit=.95[aout]")
  return graph.join(";\n")
}
export async function renderTemplateVideo(
  record,
  input,
  renderId,
  onProgress,
  signal
) {
  if (!(await getFFmpegStatus()).available) {
    throw new Error(
      "Install FFmpeg 8 or newer and set FFMPEG_BIN in .env before rendering."
    )
  }
  const plan = await planTemplateEdit(record, input)
  const directory = record.paths.rendersDir
  await fs.mkdir(directory, { recursive: true })
  const video = path.join(directory, renderId + ".mp4")
  const ass = path.join(directory, renderId + ".ass")
  const srt = path.join(directory, renderId + ".srt")
  const planFile = path.join(directory, renderId + "-plan.json")
  const filterFile = path.join(directory, renderId + "-filters.txt")
  // Serialize graph scheduling: parallel workers can stall split/framesync
  // graphs with zoom, transitions, and sidechain audio. Encoding remains threaded.
  const args = [
    "-hide_banner",
    "-y",
    "-threads",
    "2",
    "-filter_threads",
    "2",
    "-filter_complex_threads",
    "1",
    "-i",
    record.paths.originalFile
  ]
  let nextInput = 1
  if (!record.media.hasAudio) {
    args.push(
      "-f",
      "lavfi",
      "-t",
      n(plan.settings.endSec),
      "-i",
      "anullsrc=r=48000:cl=stereo"
    )
    nextInput++
  }
  let musicInput = null
  if (plan.settings.music !== "none") {
    const musicPath =
      plan.settings.music === "custom"
        ? record.music.path
        : await createSoundtrack(
            plan.settings.music,
            path.join(directory, renderId + "-music.wav")
          )
    musicInput = nextInput++
    // Bound the demuxer as well as the filter output. Older FFmpeg versions can
    // continue buffering a looping WAV after a short multi-input graph ends.
    args.push(
      "-stream_loop",
      "-1",
      "-t",
      n(plan.summary.outputDurationSec),
      "-i",
      musicPath
    )
  }
  await fs.writeFile(ass, makeAssCaptions(plan))
  await fs.writeFile(srt, captionsToSrt(plan.captions))
  await fs.writeFile(planFile, JSON.stringify(plan, null, 2))
  const graph = buildTemplateFilterGraph(plan, {
    hasAudio: record.media.hasAudio,
    musicInput,
    assName: plan.captions.length ? path.basename(ass) : null
  })
  await fs.writeFile(filterFile, graph)
  args.push(
    "-filter_complex_script",
    filterFile,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    n(plan.summary.outputDurationSec),
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    plan.settings.preview ? "ultrafast" : "fast",
    "-crf",
    plan.settings.preview ? "27" : "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    video
  )
  let progressBuffer = ""
  try {
    await runCommand({
      command: config.media.ffmpegBin,
      args,
      cwd: directory,
      signal,
      timeoutMs: Math.max(
        120000,
        Math.min(1800000, plan.summary.outputDurationSec * 10000)
      ),
      onData: (text) => {
        progressBuffer += text
        const lines = progressBuffer.split("\n")
        progressBuffer = lines.pop()
        for (const line of lines)
          if (line.startsWith("out_time_us="))
            onProgress?.(
              Math.min(
                98,
                Math.max(
                  1,
                  Math.round(
                    (Number(line.split("=")[1]) /
                      1000000 /
                      plan.summary.outputDurationSec) *
                      100
                  )
                )
              )
            )
      },
      onStderrData:
        process.env.ASKEDITS_MEDIA_DEBUG === "1"
          ? (text) => process.stderr.write(text)
          : undefined,
      notFoundMessage:
        "FFmpeg is missing. Install it or set FFMPEG_BIN in .env."
    })
    const { stdout } = await runCommand({
      command: config.media.ffprobeBin,
      args: [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        video
      ],
      timeoutMs: 15000
    })
    const probe = JSON.parse(stdout)
    const stream = probe.streams?.find((s) => s.codec_type === "video")
    if (!stream || Number(probe.format?.duration) <= 0)
      throw new Error("The encoder did not produce a valid video.")
    return {
      renderId,
      generatedAt: new Date().toISOString(),
      settings: plan.settings,
      summary: plan.summary,
      warnings: plan.warnings,
      dimensions: plan.dimensions,
      output: {
        durationSec: Number(probe.format.duration),
        width: stream.width,
        height: stream.height,
        size: Number(probe.format.size)
      },
      paths: { video, ass, srt, plan: planFile }
    }
  } catch (error) {
    await fs.unlink(video).catch(() => {})
    throw error
  }
}
