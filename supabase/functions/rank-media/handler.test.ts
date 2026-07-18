import { assert, assertEquals } from "jsr:@std/assert@1"
import { handleRankMedia, type RankMediaDeps, type MediaItemRow } from "./handler.ts"

function baseDeps(overrides: Partial<RankMediaDeps> = {}): RankMediaDeps {
  return {
    verifyTripOwnership: async () => true,
    listTripMedia: async () => [],
    createSignedUrl: async (p) => `https://x/${p}`,
    scoreMedia: async () => ({ quality_score: 80, content_category: "scenery" }),
    embedMedia: async () => [1, 0, 0],
    updateMediaCache: async () => {},
    getTheme: async () => null,
    ...overrides,
  }
}

Deno.test("400 when trip_id missing", async () => {
  assertEquals((await handleRankMedia(baseDeps(), { slide_count: 5 })).status, 400)
})
Deno.test("400 when slide_count out of 1..20", async () => {
  assertEquals((await handleRankMedia(baseDeps(), { trip_id: "t1", slide_count: 0 })).status, 400)
  assertEquals((await handleRankMedia(baseDeps(), { trip_id: "t1", slide_count: 21 })).status, 400)
})
Deno.test("403 when caller does not own the trip", async () => {
  const r = await handleRankMedia(baseDeps({ verifyTripOwnership: async () => false }), { trip_id: "t1", slide_count: 5 })
  assertEquals(r.status, 403)
})
Deno.test("422 when the trip has no usable photos", async () => {
  const r = await handleRankMedia(baseDeps({ listTripMedia: async () => [] }), { trip_id: "t1", slide_count: 5 })
  assertEquals(r.status, 422)
})
Deno.test("scores only uncached media and returns an ordered N-slot selection with reserved favourites", async () => {
  const media: MediaItemRow[] = [
    { id: "m1", storage_path: "t1/a.jpg", quality_score: 95, content_category: "food", is_favourite: false, embedding: null },
    { id: "m2", storage_path: "t1/b.jpg", quality_score: null, content_category: null, is_favourite: true, embedding: null },
    { id: "m3", storage_path: "t1/c.jpg", quality_score: 60, content_category: "group", is_favourite: false, embedding: null },
  ]
  let scoreCalls = 0
  const r = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      scoreMedia: async () => { scoreCalls++; return { quality_score: 40, content_category: "candid_funny" } },
    }),
    { trip_id: "t1", slide_count: 2 },
  )
  assertEquals(scoreCalls, 1) // only m2 was uncached
  assertEquals(r.status, 200)
  const reserved = r.body.slots.filter((s: { reserved: boolean }) => s.reserved).map((s: { media_item_id: string }) => s.media_item_id)
  assertEquals(reserved, ["m2"]) // the favourite is reserved despite its low (40) score
  assertEquals(r.body.slots.length, 2)
})
Deno.test("422 when every media item fails scoring", async () => {
  const media: MediaItemRow[] = [
    { id: "m1", storage_path: "t1/a.jpg", quality_score: null, content_category: null, is_favourite: false, embedding: null },
  ]
  const r = await handleRankMedia(
    baseDeps({ listTripMedia: async () => media, scoreMedia: async () => { throw new Error("api down") } }),
    { trip_id: "t1", slide_count: 3 },
  )
  assertEquals(r.status, 422)
})

Deno.test("composition select: theme centroid picks the on-theme photo within a category", async () => {
  const media: MediaItemRow[] = [
    { id: "s_on", storage_path: "t/on.jpg", quality_score: 60, content_category: "scenery", is_favourite: false, embedding: "[1,0,0]" },
    { id: "s_off", storage_path: "t/off.jpg", quality_score: 95, content_category: "scenery", is_favourite: false, embedding: "[0,1,0]" },
  ]
  const r = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      getTheme: async () => ({ composition_template: { scenery: 1 }, centroid_vec: "[1,0,0]" }),
    }),
    { trip_id: "t1", slide_count: 1, theme_id: "coastal" },
  )
  assertEquals(r.status, 200)
  // s_on is lower quality but its embedding matches the centroid exactly -> theme-fit wins
  assertEquals(r.body.slots[0].media_item_id, "s_on")
})

Deno.test("embeds only photos missing an embedding and caches the result", async () => {
  const media: MediaItemRow[] = [
    { id: "cached", storage_path: "t/c.jpg", quality_score: 70, content_category: "scenery", is_favourite: false, embedding: "[0,1,0]" },
    { id: "fresh", storage_path: "t/f.jpg", quality_score: 80, content_category: "scenery", is_favourite: false, embedding: null },
  ]
  let embeds = 0
  const cached: Record<string, unknown>[] = []
  const r = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      embedMedia: async () => { embeds++; return [1, 0, 0] },
      updateMediaCache: async (_id, patch) => { cached.push(patch) },
      getTheme: async () => ({ composition_template: { scenery: 1 }, centroid_vec: "[1,0,0]" }),
    }),
    { trip_id: "t1", slide_count: 2, theme_id: "coastal" },
  )
  assertEquals(r.status, 200)
  assertEquals(embeds, 1) // only "fresh" was embedded
  assert(cached.some((p) => "embedding" in p)) // the fresh embedding was persisted
})

Deno.test("a photo whose embedding fails is still selectable (theme_fit neutral), not dropped", async () => {
  const media: MediaItemRow[] = [
    { id: "s1", storage_path: "t/s1.jpg", quality_score: 90, content_category: "scenery", is_favourite: false, embedding: null },
  ]
  const r = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      embedMedia: async () => { throw new Error("voyage down") },
      getTheme: async () => ({ composition_template: { scenery: 1 }, centroid_vec: "[1,0,0]" }),
    }),
    { trip_id: "t1", slide_count: 1, theme_id: "coastal" },
  )
  assertEquals(r.status, 200)
  assertEquals(r.body.slots[0].media_item_id, "s1")
})

Deno.test("falls back to naive quality selection when theme has no fingerprint", async () => {
  const media: MediaItemRow[] = [
    { id: "s1", storage_path: "t/s1.jpg", quality_score: 90, content_category: "scenery", is_favourite: false, embedding: null },
    { id: "g1", storage_path: "t/g1.jpg", quality_score: 60, content_category: "group", is_favourite: false, embedding: null },
  ]
  const r = await handleRankMedia(
    baseDeps({ listTripMedia: async () => media, getTheme: async () => null }),
    { trip_id: "t1", slide_count: 1, theme_id: "unknown" },
  )
  assertEquals(r.body.slots[0].media_item_id, "s1")
})

Deno.test("keeps already-scored photo when signed-URL fails for embed-only", async () => {
  const media: MediaItemRow[] = [
    { id: "scored", storage_path: "t/scored.jpg", quality_score: 85, content_category: "scenery", is_favourite: false, embedding: null },
  ]
  const r = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      createSignedUrl: async () => null,
      getTheme: async () => ({ composition_template: { scenery: 1 }, centroid_vec: "[1,0,0]" }),
    }),
    { trip_id: "t1", slide_count: 1, theme_id: "coastal" },
  )
  assertEquals(r.status, 200)
  assertEquals(r.body.slots[0].media_item_id, "scored")
})
