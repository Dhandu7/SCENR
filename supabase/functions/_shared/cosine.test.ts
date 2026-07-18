import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1"
import { combinedScore, cosineSimilarity, parseVector } from "./cosine.ts"

Deno.test("parseVector handles a pgvector string, an array, and junk", () => {
  assertEquals(parseVector("[1,2,3]"), [1, 2, 3])
  assertEquals(parseVector([1, 2, 3]), [1, 2, 3])
  assertEquals(parseVector(null), null)
  assertEquals(parseVector("not json"), null)
  assertEquals(parseVector(42), null)
})

Deno.test("cosineSimilarity: identical=1, orthogonal=0, opposite=-1", () => {
  assertAlmostEquals(cosineSimilarity([1, 0], [1, 0]), 1)
  assertAlmostEquals(cosineSimilarity([1, 0], [0, 1]), 0)
  assertAlmostEquals(cosineSimilarity([1, 0], [-1, 0]), -1)
})

Deno.test("cosineSimilarity guards length mismatch and zero vectors", () => {
  assertEquals(cosineSimilarity([1, 2, 3], [1, 2]), 0)
  assertEquals(cosineSimilarity([0, 0], [1, 1]), 0)
})

Deno.test("combinedScore weights theme-fit 0.7 / quality 0.3 and clamps", () => {
  // perfect fit, perfect quality -> 1
  assertAlmostEquals(combinedScore(1, 100), 1)
  // no fit, perfect quality -> 0.3
  assertAlmostEquals(combinedScore(0, 100), 0.3)
  // perfect fit, zero quality -> 0.7
  assertAlmostEquals(combinedScore(1, 0), 0.7)
  // negative fit and >100 quality both clamp
  assertAlmostEquals(combinedScore(-0.5, 200), 0.3)
})

Deno.test("combinedScore: higher theme-fit beats higher quality within the weighting", () => {
  // fit 0.9/quality 50 vs fit 0.2/quality 100
  assert(combinedScore(0.9, 50) > combinedScore(0.2, 100))
})
