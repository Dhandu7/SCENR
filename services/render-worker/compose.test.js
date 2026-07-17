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
