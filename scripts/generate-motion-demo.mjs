import "../src/backend/env-loader.js"
import config from "../config/default.js"
import { runCommand } from "../src/backend/utils/process-runner.js"
import path from "node:path"

// Original code-generated motion asset; no downloaded footage or recordings.
const graph = [
  "[0:v]drawgrid=w=80:h=60:t=1:c=0x273323",
  "drawbox=x=90:y=180:w=210:h=150:c=0x34492b:t=2",
  "drawbox=x=375:y=180:w=210:h=150:c=0x597433:t=2",
  "drawbox=x=660:y=180:w=210:h=150:c=0x34492b:t=2",
  "drawbox=x=300:y=250:w=75:h=3:c=0xd1ff31:t=fill",
  "drawbox=x=585:y=250:w=75:h=3:c=0xd1ff31:t=fill",
  "drawtext=font=Arial:text='FROM IDEAS TO IMPACT':fontsize=34:fontcolor=0xeef5e5:x=(w-tw)/2:y=75",
  "drawtext=font=Arial:text='INPUT':fontsize=25:fontcolor=0xd1ff31:x=153:y=215",
  "drawtext=font=Arial:text='PROCESS':fontsize=25:fontcolor=0xd1ff31:x=423:y=215",
  "drawtext=font=Arial:text='OUTPUT':fontsize=25:fontcolor=0xd1ff31:x=715:y=215",
  "drawtext=font=Arial:text='Your idea':fontsize=16:fontcolor=0xa1b393:x=155:y=280",
  "drawtext=font=Arial:text='Make the connection':fontsize=16:fontcolor=0xa1b393:x=409:y=280",
  "drawtext=font=Arial:text='A clearer story':fontsize=16:fontcolor=0xa1b393:x=706:y=280",
  "drawtext=font=Arial:text='Original ASKEdits motion sample':fontsize=16:fontcolor=0x9faf91:x=(w-tw)/2:y=445[base]"
].join(",") + ";[base][1:v]overlay=x='90+mod(t*140,780)':y=370:shortest=1[v]"
await runCommand({command:config.media.ffmpegBin,args:["-hide_banner","-y","-f","lavfi","-i","color=c=0x0a100b:s=960x540:r=30:d=8","-f","lavfi","-i","color=c=0xd1ff31:s=20x8:r=30:d=8","-filter_complex_threads","1","-filter_complex",graph,"-map","[v]","-an","-c:v","libx264","-preset","fast","-crf","23","-pix_fmt","yuv420p","-movflags","+faststart",path.resolve("public/demo/tech-broll.mp4")],timeoutMs:60000})
console.log("Generated original motion sample: public/demo/tech-broll.mp4")
