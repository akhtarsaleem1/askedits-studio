import express from "express"
import cors from "cors"
import { existsSync } from "node:fs"
import path from "node:path"

import config from "../../config/default.js"
import uploadRoutes from "./routes/uploads.js"
import studioRoutes from "./routes/studio.js"

const app = express()
const distDirectory = path.resolve("dist")
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === config.clientOrigin || localOriginPattern.test(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin "${origin}" is not allowed.`))
    }
  })
)
app.use(express.json({ limit: "1mb" }))

app.get("/api/health", (request, response) => {
  response.json({
    name: config.appName,
    status: "ok"
  })
})

app.use("/api/uploads", uploadRoutes)
app.use("/api/studio", studioRoutes)

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error)
    return
  }

  response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : error.statusCode ?? error.status ?? 500).json({
    error: error.message ?? "Unexpected server error."
  })
})

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory))

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api") || path.extname(request.path)) {
      next()
      return
    }

    response.sendFile(path.join(distDirectory, "index.html"))
  })
}

export default app
