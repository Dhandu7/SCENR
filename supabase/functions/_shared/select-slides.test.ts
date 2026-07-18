import { assert, assertEquals } from "jsr:@std/assert@1"
import { allocateSlots, selectSlides, selectSlidesByComposition, type ScoredMedia } from "./select-slides.ts"
import { combinedScore } from "./cosine.ts"

const m = (id: string, score: number, fav: boolean): ScoredMedia => ({
  media_item_id: id, storage_path: `t1/${id}.jpg`, quality_score: score, is_favourite: fav,
  content_category: "scenery", theme_fit: null,
})

Deno.test("empty pool → empty selection", () => {
  const r = selectSlides([], 5)
  assertEquals(r.slots.length, 0)
  assertEquals(r.slide_count, 0)
})

Deno.test("no favourites → top-N by quality, none reserved, rest on bench", () => {
  const r = selectSlides([m("a", 60, false), m("b", 90, false), m("c", 75, false), m("d", 50, false)], 2)
  assertEquals(r.slots.map((s) => s.media_item_id), ["b", "c"])
  assertEquals(r.slots.every((s) => !s.reserved), true)
  assertEquals(r.bench.map((s) => s.media_item_id), ["a", "d"])
})

Deno.test("reserves up to 2 favourites regardless of score, fills the rest by quality", () => {
  const r = selectSlides(
    [m("fav1", 40, true), m("fav2", 30, true), m("hi", 99, false), m("mid", 70, false)],
    3,
  )
  const reserved = r.slots.filter((s) => s.reserved).map((s) => s.media_item_id)
  assertEquals(reserved.sort(), ["fav1", "fav2"]) // both low-scored favourites reserved
  const filled = r.slots.filter((s) => !s.reserved).map((s) => s.media_item_id)
  assertEquals(filled, ["hi"]) // 1 remaining slot → the strongest non-favourite
})

Deno.test("caps favourite reservation at 2 even when more favourites exist", () => {
  const r = selectSlides(
    [m("f1", 55, true), m("f2", 54, true), m("f3", 53, true), m("g", 80, false)],
    4,
  )
  assertEquals(r.slots.filter((s) => s.reserved).length, 2)
  // f3 is not reserved but is still eligible for a fill slot on quality
  assertEquals(r.slots.map((s) => s.media_item_id).includes("f3"), true)
})

Deno.test("slide_count larger than the pool clamps to pool size", () => {
  const r = selectSlides([m("a", 60, false), m("b", 90, false)], 10)
  assertEquals(r.slide_count, 2)
  assertEquals(r.bench.length, 0)
})

Deno.test("single-slide 'post' still reserves the favourite", () => {
  const r = selectSlides([m("fav", 20, true), m("hi", 95, false)], 1)
  assertEquals(r.slots.map((s) => s.media_item_id), ["fav"])
  assertEquals(r.slots[0].reserved, true)
})

Deno.test("allocateSlots splits proportionally (largest-remainder)", () => {
  assertEquals(
    allocateSlots({ scenery: 0.5, group: 0.3, food: 0.2 }, { scenery: 100, group: 100, food: 100 }, 10),
    { scenery: 5, group: 3, food: 2 },
  )
})
Deno.test("allocateSlots renormalizes over categories present in the pool", () => {
  assertEquals(
    allocateSlots({ scenery: 0.5, group: 0.3, food: 0.2 }, { scenery: 100, group: 100 }, 10),
    { scenery: 6, group: 4 },
  )
})
Deno.test("allocateSlots caps at a category's photo count and redistributes overflow", () => {
  assertEquals(
    allocateSlots({ solo_portrait: 0.9, group: 0.1 }, { solo_portrait: 3, group: 100 }, 10),
    { solo_portrait: 3, group: 7 },
  )
})
Deno.test("allocateSlots returns {} when template shares no category with the pool", () => {
  assertEquals(allocateSlots({ solo_portrait: 1 }, { scenery: 100 }, 10), {})
})
Deno.test("allocateSlots never exceeds total available photos", () => {
  assertEquals(allocateSlots({ scenery: 1 }, { scenery: 4 }, 10), { scenery: 4 })
})

// factory: theme_fit defaults to null (no embedding) unless given
const mc = (id: string, score: number, fav: boolean, cat: string, fit: number | null = null): ScoredMedia => ({
  media_item_id: id, storage_path: `t1/${id}.jpg`, quality_score: score, is_favourite: fav,
  content_category: cat, theme_fit: fit,
})

Deno.test("selectSlidesByComposition fills categories per the template", () => {
  const pool = [
    mc("s1", 90, false, "scenery"), mc("s2", 80, false, "scenery"), mc("s3", 70, false, "scenery"),
    mc("g1", 85, false, "group"), mc("g2", 60, false, "group"), mc("f1", 50, false, "food"),
  ]
  const r = selectSlidesByComposition(pool, 5, { scenery: 0.6, group: 0.2, food: 0.2 })
  assertEquals(r.slots.map((s) => s.content_category).sort(), ["food", "group", "scenery", "scenery", "scenery"])
})

Deno.test("selectSlidesByComposition reserves up to 2 favourites on top of the mix", () => {
  const pool = [
    mc("fav", 40, true, "candid_funny"),
    mc("s1", 90, false, "scenery"), mc("s2", 80, false, "scenery"), mc("s3", 70, false, "scenery"),
  ]
  const r = selectSlidesByComposition(pool, 3, { scenery: 1 })
  assertEquals(r.slots.filter((s) => s.reserved).map((s) => s.media_item_id), ["fav"])
  assertEquals(r.slots.filter((s) => !s.reserved).every((s) => s.content_category === "scenery"), true)
})

Deno.test("selectSlidesByComposition picks best quality within a category when no theme-fit", () => {
  const pool = [
    mc("s_hi", 90, false, "scenery"), mc("s_lo", 50, false, "scenery"),
    mc("g_fav", 70, true, "group"), mc("g_hi", 70, false, "group"),
  ]
  const r = selectSlidesByComposition(pool, 2, { scenery: 0.5, group: 0.5 })
  assertEquals(r.slots.map((s) => s.media_item_id).sort(), ["g_fav", "s_hi"])
})

Deno.test("theme-fit overrides raw quality within a category", () => {
  // s_fit is lower quality (60) but a near-perfect theme match; s_q is higher quality (95) but off-theme.
  const pool = [mc("s_fit", 60, false, "scenery", 0.95), mc("s_q", 95, false, "scenery", 0.1)]
  const r = selectSlidesByComposition(pool, 1, { scenery: 1 })
  assertEquals(r.slots[0].media_item_id, "s_fit")
  // sanity: the weighting genuinely favors s_fit
  assert(combinedScore(0.95, 60) > combinedScore(0.1, 95))
})

Deno.test("selectSlidesByComposition falls back to quality when template shares no category", () => {
  const pool = [mc("a", 60, false, "scenery"), mc("b", 90, false, "scenery")]
  assertEquals(selectSlidesByComposition(pool, 1, { food: 1 }).slots.map((s) => s.media_item_id), ["b"])
})

Deno.test("selectSlidesByComposition clamps to pool size and benches leftovers", () => {
  const pool = [mc("s1", 90, false, "scenery"), mc("s2", 80, false, "scenery"), mc("s3", 70, false, "scenery")]
  const r = selectSlidesByComposition(pool, 2, { scenery: 1 })
  assertEquals(r.slots.length, 2)
  assertEquals(r.bench.map((b) => b.media_item_id), ["s3"])
})
