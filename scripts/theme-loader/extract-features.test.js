import { test } from "node:test"
import assert from "node:assert/strict"
import { extractFeatures, CONTENT_CATEGORIES, normalizeMediaType } from "./extract-features.js"

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

test("normalizeMediaType passes through a supported type", () => {
  assert.equal(normalizeMediaType("image/png"), "image/png")
})

test("normalizeMediaType strips a charset suffix and lowercases", () => {
  assert.equal(normalizeMediaType("Image/JPEG; charset=binary"), "image/jpeg")
})

test("normalizeMediaType maps the nonstandard image/jpg to image/jpeg", () => {
  assert.equal(normalizeMediaType("image/jpg"), "image/jpeg")
})

test("normalizeMediaType falls back to image/jpeg for missing or unrecognized types", () => {
  assert.equal(normalizeMediaType(null), "image/jpeg")
  assert.equal(normalizeMediaType(undefined), "image/jpeg")
  assert.equal(normalizeMediaType("application/octet-stream"), "image/jpeg")
})
