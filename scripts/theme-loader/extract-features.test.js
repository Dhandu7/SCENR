import { test } from "node:test"
import assert from "node:assert/strict"
import { extractFeatures, CONTENT_CATEGORIES } from "./extract-features.js"

const pin = { id: "1", imageUrl: "https://example.com/a.jpg", description: "" }

test("extractFeatures combines embedding and tag on success", async () => {
  const deps = {
    embedImage: async () => [0.1, 0.2, 0.3],
    tagImage: async () => ({ category: "scenery", palette: ["warm amber"], description: "warm golden light" }),
  }
  const result = await extractFeatures(deps, pin)
  assert.deepEqual(result, {
    id: "1",
    embedding: [0.1, 0.2, 0.3],
    category: "scenery",
    palette: ["warm amber"],
    description: "warm golden light",
  })
})

test("extractFeatures returns null when embedding fails", async () => {
  const deps = {
    embedImage: async () => {
      throw new Error("network error")
    },
    tagImage: async () => ({ category: "scenery", palette: [], description: "x" }),
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("extractFeatures returns null when tagging fails", async () => {
  const deps = {
    embedImage: async () => [0.1],
    tagImage: async () => {
      throw new Error("network error")
    },
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("extractFeatures returns null for an unrecognized category", async () => {
  const deps = {
    embedImage: async () => [0.1],
    tagImage: async () => ({ category: "bogus_category", palette: [], description: "x" }),
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("CONTENT_CATEGORIES matches the fixed taxonomy", () => {
  assert.deepEqual(CONTENT_CATEGORIES, [
    "solo_portrait",
    "group",
    "scenery",
    "food",
    "action_fit",
    "candid_funny",
  ])
})
