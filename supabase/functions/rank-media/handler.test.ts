import { assertEquals } from "jsr:@std/assert@1"
import { handleRankMedia, type RankMediaDeps, type MediaItemRow } from "./handler.ts"

function baseDeps(overrides: Partial<RankMediaDeps> = {}): RankMediaDeps {
  return {
    verifyTripOwnership: async () => true,
    listTripMedia: async () => [],
    createSignedUrl: async (p) => `https://x/${p}`,
    scoreMedia: async () => ({ quality_score: 80, content_category: "scenery" }),
    updateMediaScore: async () => {},
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
    { id: "m1", storage_path: "t1/a.jpg", quality_score: 95, content_category: "food", is_favourite: false },
    { id: "m2", storage_path: "t1/b.jpg", quality_score: null, content_category: null, is_favourite: true },
    { id: "m3", storage_path: "t1/c.jpg", quality_score: 60, content_category: "group", is_favourite: false },
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
    { id: "m1", storage_path: "t1/a.jpg", quality_score: null, content_category: null, is_favourite: false },
  ]
  const r = await handleRankMedia(
    baseDeps({ listTripMedia: async () => media, scoreMedia: async () => { throw new Error("api down") } }),
    { trip_id: "t1", slide_count: 3 },
  )
  assertEquals(r.status, 422)
})
