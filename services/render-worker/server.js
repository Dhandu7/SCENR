import { createServer } from "node:http"
import { handleRender } from "./handler.js"
import { composePost } from "./compose.js"

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const RENDER_WORKER_SECRET = process.env.RENDER_WORKER_SECRET || undefined

async function fetchImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
async function uploadImage(url, buffer) {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: buffer })
  return response.ok
}

const deps = { fetchImage, uploadImage, compose: composePost, expectedSecret: RENDER_WORKER_SECRET }

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not_found" }))
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let body
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) } catch { body = {} }
  const providedSecret = req.headers["x-render-worker-secret"]
  const result = await handleRender(deps, body, providedSecret)
  res.writeHead(result.status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(result.body))
})

server.listen(PORT, () => console.log(`render-worker listening on :${PORT}`))
