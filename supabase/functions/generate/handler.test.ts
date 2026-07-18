import { assertEquals } from "jsr:@std/assert@1"
import { handleGenerate, processGeneration, type GenerateDeps } from "./handler.ts"

function baseDeps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return {
    verifyMediaBelongToTrip: async () => true,
    createGeneration: async () => ({ id: "gen1" }),
    updateGeneration: async () => {},
    getMediaStoragePath: async (id) => `t1/${id}.jpg`,
    createSignedUrl: async () => "https://x/get",
    createSignedUploadUrl: async () => "https://x/put",
    renderPost: async (_s, _u, _grade) => true,
    waitUntil: () => {},
    ...overrides,
  }
}

Deno.test("400 when media_item_ids is empty", async () => {
  assertEquals((await handleGenerate(baseDeps(), { trip_id: "t1", media_item_ids: [] })).status, 400)
})
Deno.test("400 when media_item_ids exceeds 20", async () => {
  const ids = Array.from({ length: 21 }, (_, i) => `m${i}`)
  assertEquals((await handleGenerate(baseDeps(), { trip_id: "t1", media_item_ids: ids })).status, 400)
})
Deno.test("403 when a media id does not belong to the caller's trip", async () => {
  const r = await handleGenerate(baseDeps({ verifyMediaBelongToTrip: async () => false }), {
    trip_id: "t1", media_item_ids: ["m1"],
  })
  assertEquals(r.status, 403)
})
Deno.test("500 when generation creation fails", async () => {
  const r = await handleGenerate(baseDeps({ createGeneration: async () => null }), {
    trip_id: "t1", media_item_ids: ["m1"],
  })
  assertEquals(r.status, 500)
})
Deno.test("200 with generation id + schedules background work", async () => {
  let scheduled: Promise<void> | null = null
  const r = await handleGenerate(baseDeps({ waitUntil: (p) => { scheduled = p } }), {
    trip_id: "t1", media_item_ids: ["m1", "m2"],
  })
  assertEquals(r.status, 200)
  assertEquals(r.body, { generation_id: "gen1" })
  assertEquals(scheduled !== null, true)
})
Deno.test("processGeneration renders every slide and completes with ordered selection", async () => {
  const rendered: { source: string; upload: string }[] = []
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    createSignedUrl: async (p) => `get:${p}`,
    createSignedUploadUrl: async (p) => `put:${p}`,
    renderPost: async (source, upload) => { rendered.push({ source, upload }); return true },
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["mA", "mB", "mC"], null)
  assertEquals(rendered.length, 3)
  assertEquals(rendered.map((r) => r.upload), ["put:t1/gen1/0.jpg", "put:t1/gen1/1.jpg", "put:t1/gen1/2.jpg"])
  const final = updates[updates.length - 1]
  assertEquals(final.status, "complete")
  assertEquals(final.output_url, "t1/gen1/")
  assertEquals(final.selection, [{ media_item_id: "mA" }, { media_item_id: "mB" }, { media_item_id: "mC" }])
})
Deno.test("processGeneration fails if any slide's media has no storage path", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    getMediaStoragePath: async (id) => (id === "bad" ? null : `t1/${id}.jpg`),
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["ok", "bad"], null)
  assertEquals(updates[updates.length - 1].status, "failed")
})
Deno.test("processGeneration fails when a render fails", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    renderPost: async () => false,
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["m1"], null)
  assertEquals(updates[updates.length - 1].status, "failed")
})
Deno.test("processGeneration fails gracefully on an unexpected exception", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    getMediaStoragePath: async () => { throw new Error("db down") },
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["m1"], null)
  assertEquals(updates[updates.length - 1].status, "failed")
})
Deno.test("threads the theme's grade into every renderPost call", async () => {
  const grades: unknown[] = []
  const deps = baseDeps({ renderPost: async (_s, _u, grade) => { grades.push(grade); return true } })
  await processGeneration(deps, "gen1", "t1", ["m1", "m2"], "golden_hour")
  assertEquals(grades.length, 2)
  assertEquals((grades[0] as { brightness: number }).brightness, 1.06)
  assertEquals(grades[0], grades[1])
})

Deno.test("passes a null grade for an unknown/absent theme", async () => {
  let received: unknown = "unset"
  const deps = baseDeps({ renderPost: async (_s, _u, grade) => { received = grade; return true } })
  await processGeneration(deps, "gen1", "t1", ["m1"], null)
  assertEquals(received, null)
})
