import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeVector,
  computeCentroid,
  computeCompositionTemplate,
  computePalette,
  aggregateFingerprint,
} from "./aggregate.js"

test("normalizeVector produces a unit vector", () => {
  const normalized = normalizeVector([3, 4])
  assert.equal(normalized[0], 0.6)
  assert.equal(normalized[1], 0.8)
})

test("normalizeVector handles an all-zero vector without dividing by zero", () => {
  assert.deepEqual(normalizeVector([0, 0]), [0, 0])
})

test("computeCentroid averages and re-normalizes multiple embeddings", () => {
  const centroid = computeCentroid([
    [1, 0],
    [0, 1],
  ])
  const magnitude = Math.sqrt(centroid[0] ** 2 + centroid[1] ** 2)
  assert.ok(Math.abs(magnitude - 1) < 1e-9)
  assert.ok(Math.abs(centroid[0] - centroid[1]) < 1e-9)
})

test("computeCompositionTemplate returns a normalized frequency distribution", () => {
  const distribution = computeCompositionTemplate(["scenery", "scenery", "group", "food"])
  assert.equal(distribution.scenery, 0.5)
  assert.equal(distribution.group, 0.25)
  assert.equal(distribution.food, 0.25)
})

test("computePalette returns the most frequent terms, most common first", () => {
  const palette = computePalette([["warm amber", "soft gold"], ["warm amber"], ["deep orange"]])
  assert.deepEqual(palette.slice(0, 1), ["warm amber"])
})

test("aggregateFingerprint throws for zero features", () => {
  assert.throws(() => aggregateFingerprint("golden_hour", "Golden Hour", []))
})

test("aggregateFingerprint produces the full fingerprint shape", () => {
  const features = [
    { id: "1", embedding: [1, 0], category: "scenery", palette: ["warm amber"], description: "a" },
    { id: "2", embedding: [0, 1], category: "group", palette: ["warm amber"], description: "b" },
  ]
  const fingerprint = aggregateFingerprint("golden_hour", "Golden Hour", features)
  assert.equal(fingerprint.theme_id, "golden_hour")
  assert.equal(fingerprint.display_name, "Golden Hour")
  assert.equal(fingerprint.sample_count, 2)
  assert.equal(fingerprint.centroid_vec.length, 2)
  assert.deepEqual(fingerprint.composition_template, { scenery: 0.5, group: 0.5 })
  assert.deepEqual(fingerprint.palette.slice(0, 1), ["warm amber"])
  assert.equal(fingerprint.notes, "a | b")
})
