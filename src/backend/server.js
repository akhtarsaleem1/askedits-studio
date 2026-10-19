import "./env-loader.js"
import config from "../../config/default.js"
import app from "./app.js"

const server = app.listen(config.serverPort, config.serverHost, () => {
  console.log(`ASKEdits is ready at http://${config.serverHost}:${config.serverPort}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
