import { assertEquals } from "jsr:@std/assert@1"
import { selectSlides, type ScoredMedia } from "./select-slides.ts"

const m = (id: string, score: number, fav: boolean): ScoredMedia => ({
  media_item_id: id, storage_path: `t1/${id}.jpg`, quality_score: score, is_favourite: fav,
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
