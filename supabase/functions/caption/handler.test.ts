import { assert, assertEquals } from "jsr:@std/assert@1"
import { handleCaption, type CaptionDeps } from "./handler.ts"

function baseDeps(overrides: Partial<CaptionDeps> = {}): CaptionDeps {
  return {
    getOwnedGeneration: async () => ({ trip_id: "t1", theme_id: "golden_hour", selection: [{ media_item_id: "m1" }] }),
    getTripName: async () => "Toronto 2026",
    getThemeDisplayName: async () => "Golden Hour",
    getSelectionCategories: async () => ["scenery"],
    writeCaption: async () => "Golden hours in Toronto.",
    saveCaption: async () => {},
    ...overrides,
  }
}

Deno.test("400 when generation_id missing", async () => {
  assertEquals((await handleCaption(baseDeps(), {})).status, 400)
})
Deno.test("403 when caller does not own the generation", async () => {
  const r = await handleCaption(baseDeps({ getOwnedGeneration: async () => null }), { generation_id: "g1" })
  assertEquals(r.status, 403)
})
Deno.test("custom_text is saved as a custom caption without calling the model", async () => {
  let wrote = 0
  const saved: unknown[] = []
  const r = await handleCaption(
    baseDeps({ writeCaption: async () => { wrote++; return "x" }, saveCaption: async (_id, cap, mode) => { saved.push([cap, mode]) } }),
    { generation_id: "g1", custom_text: "  My own words  " },
  )
  assertEquals(r.status, 200)
  assertEquals(wrote, 0)
  assertEquals(r.body, { caption: "My own words", caption_mode: "custom" })
  assertEquals(saved[0], ["My own words", "custom"])
})
Deno.test("400 when custom_text is only whitespace", async () => {
  assertEquals((await handleCaption(baseDeps(), { generation_id: "g1", custom_text: "   " })).status, 400)
})
Deno.test("generates and saves a caption from content when no custom_text", async () => {
  const saved: unknown[] = []
  const r = await handleCaption(
    baseDeps({ saveCaption: async (_id, cap, mode) => { saved.push([cap, mode]) } }),
    { generation_id: "g1" },
  )
  assertEquals(r.status, 200)
  assertEquals(r.body, { caption: "Golden hours in Toronto.", caption_mode: "generated" })
  assertEquals(saved[0], ["Golden hours in Toronto.", "generated"])
})
Deno.test("still generates when trip/selection context is thin (no 500)", async () => {
  // Captured via a wrapper object (not a bare `let`) — TS's control-flow
  // analysis narrows a `let` that's only ever reassigned inside a closure
  // back to its initializer's type at the read site, which would falsely
  // report `never` here even though the closure does run.
  const captured: { input: { tripName: string; categorySummary: string } | null } = { input: null }
  const r = await handleCaption(
    baseDeps({
      getOwnedGeneration: async () => ({ trip_id: "t1", theme_id: null, selection: [] }),
      getTripName: async () => null,
      getSelectionCategories: async () => [],
      getThemeDisplayName: async () => null,
      writeCaption: async (input) => { captured.input = input; return "Some caption." },
    }),
    { generation_id: "g1" },
  )
  assertEquals(r.status, 200)
  assert(captured.input !== null)
  assertEquals(captured.input!.tripName, "our trip")
  assertEquals(captured.input!.categorySummary, "a mix of moments")
})
