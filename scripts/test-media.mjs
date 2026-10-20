import "../src/backend/env-loader.js"
import { spawnSync } from "node:child_process"
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "tests/media-render.test.js",
    "tests/stock-jobs.test.js"
  ],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_MEDIA_TESTS: "1" },
    windowsHide: true
  }
)
process.exit(result.status ?? 1)
