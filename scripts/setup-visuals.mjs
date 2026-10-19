import "../src/backend/env-loader.js"
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { personMatteStatus } from "../src/backend/services/person-matte.js"

const packages = path.resolve(
  process.env.PERSON_SEGMENTATION_PACKAGES || "storage/runtime/person-packages"
)
const target = path.resolve(
  process.env.PERSON_SEGMENTATION_MODEL ||
    "storage/models/selfie_segmenter.tflite"
)
const digest =
  "191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b"
if (!(await personMatteStatus()).available)
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_BIN || "python",
      [
        "-m",
        "pip",
        "install",
        "--target",
        packages,
        "-r",
        "python/requirements-visual.txt"
      ],
      { stdio: "inherit", windowsHide: true }
    )
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Python visual runtime installation failed."))
    )
  })
const existing = await fs.readFile(target).catch(() => null)
if (
  !existing ||
  createHash("sha256").update(existing).digest("hex") !== digest
) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
    { signal: AbortSignal.timeout(60000) }
  )
  if (!response.ok) throw new Error("Could not download the selfie model.")
  const model = Buffer.from(await response.arrayBuffer())
  if (
    model.length > 10 * 1024 * 1024 ||
    createHash("sha256").update(model).digest("hex") !== digest
  )
    throw new Error("The downloaded model did not match its expected checksum.")
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, model)
}
console.log("Local presenter cutout installed. Restart the studio server.")
