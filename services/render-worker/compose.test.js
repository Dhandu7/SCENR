import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { composePost } from "./compose.js"

async function makeTestImage(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } }).jpeg().toBuffer()
}

test("composePost crops a wide image to 1080x1080", async () => {
  const meta = await sharp(await composePost(await makeTestImage(1600, 900))).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})
test("composePost crops a tall image to 1080x1080", async () => {
  const meta = await sharp(await composePost(await makeTestImage(600, 1200))).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})
test("composePost outputs jpeg", async () => {
  const meta = await sharp(await composePost(await makeTestImage(500, 500))).metadata()
  assert.equal(meta.format, "jpeg")
})

test("composePost applies a grade and shifts the image toward the overlay color", async () => {
  const src = await makeTestImage(1200, 1200)
  const plain = await composePost(src)
  const graded = await composePost(src, { brightness: 1.0, saturation: 1.0, overlay: { r: 0, g: 0, b: 255, alpha: 0.5 } })
  const p = await sharp(plain).stats()
  const g = await sharp(graded).stats()
  assert.ok(g.channels[2].mean > p.channels[2].mean) // blue rises under a blue overlay
  const meta = await sharp(graded).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})

test("composePost without a grade is unchanged (no-op path)", async () => {
  const src = await makeTestImage(1080, 1080)
  assert.equal(Buffer.compare(await composePost(src), await composePost(src, undefined)), 0)
})
