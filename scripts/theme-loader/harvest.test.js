import { test } from "node:test"
import assert from "node:assert/strict"
import { harvestTheme, pickLargestImageUrl } from "./harvest.js"

test("pickLargestImageUrl picks the largest width entry", () => {
  const url = pickLargestImageUrl({ "236x": { url: "small.jpg" }, "736x": { url: "big.jpg" } })
  assert.equal(url, "big.jpg")
})

test("pickLargestImageUrl returns null for missing images", () => {
  assert.equal(pickLargestImageUrl(undefined), null)
  assert.equal(pickLargestImageUrl({}), null)
})

test("harvestTheme dedupes by id and drops pins with no image", async () => {
  const deps = {
    runApifyActor: async () => [
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "2", images: {}, description: "no image" },
      { id: "3", images: { "236x": { url: "c.jpg" } }, description: "c" },
    ],
  }
  const pins = await harvestTheme(deps, "test query", 80)
  assert.deepEqual(pins.map((p) => p.id), ["1", "3"])
})

test("harvestTheme passes query and maxItems through to runApifyActor", async () => {
  let capturedArgs
  const deps = {
    runApifyActor: async (query, maxItems) => {
      capturedArgs = { query, maxItems }
      return []
    },
  }
  await harvestTheme(deps, "golden hour", 80)
  assert.deepEqual(capturedArgs, { query: "golden hour", maxItems: 80 })
})
