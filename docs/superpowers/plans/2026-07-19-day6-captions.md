# Day 6: Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a rendered carousel into a postable thing — give each generation a caption, written by Claude (Sonnet) from the trip + theme + the actual selected photos' content mix, editable by the organizer (write-your-own), with a regenerate affordance, persisted with its `caption_mode`.

**Architecture:** A new `caption` Edge Function is the single entry point. `POST {generation_id}` → generates a caption via Claude Sonnet from the generation's context (trip name, theme display name, the selected photos' `content_category` mix, slide count), persists `caption` + `caption_mode='generated'`, and returns it. `POST {generation_id, custom_text}` → persists the user's own text with `caption_mode='custom'`. The mobile Reveal screen loads the generation's stored caption; if none exists it calls `caption` to generate one, shows it in an editable field, and offers **Regenerate** (generate again) and **Save** (persist edited text as custom). No schema change — `generations.caption` and the `caption_mode` enum (`generated`|`custom`|`preset`) already exist.

**Tech Stack:** Deno (Supabase Edge Function), Claude Sonnet (`claude-sonnet-5`) for caption writing, Expo/React Native (mobile).

## Global Constraints

- **No schema migration.** `generations.caption text` and `caption_mode caption_mode` (enum `generated`|`custom`|`preset`) already exist (`0001_init.sql`). This day only uses `generated` and `custom`.
- **Caption is generated from CONTENT (text-based, MVP):** the Sonnet prompt is built from the trip name + theme display name + the selected photos' `content_category` distribution (already cached on `media_items` from Day-4 scoring) + slide count. **No per-photo vision** this day — one cheap Sonnet text call, reliable and testable. (Vision-enriched captions from the hero photo are a noted later refinement.)
- **Caption writer** (`caption-writer.ts`, the real Anthropic call) gets **no dedicated unit test** — matches the established precedent for real-I/O modules (`rank-media/score-photo.ts`, `rank-media/embed-photo.ts`). Its inputs are built by a pure, tested `summarizeCategories` helper and the DI-tested handler.
- **Ownership:** the caller must own the generation's trip. Enforce by reading the generation through the caller's **RLS-scoped** client (generations RLS already scopes SELECT to the owner) — a miss → 403, never a service-role read of someone else's generation.
- **Graceful/robust:** empty/whitespace `custom_text` → 400; a generation with no `selection`/`trip` → still returns a caption from whatever context exists (fall back to "our trip", no category summary); never 500 on a missing theme. Model `claude-sonnet-5`; strip surrounding quotes/markdown from the model's output.
- Follow the established edge-function pattern: pure `handleCaption(deps, req)` + injectable `deps` + thin `index.ts` using `serveJson` + `Deno.test` fakes (reference `supabase/functions/rank-media/` and `_shared/serve-json.ts`). Deno tests: `cd supabase/functions && deno test`. Pure-JSX mobile screen gets no Jest test.
- Deploy via Supabase MCP `deploy_edge_function` (project_id `alawnboscurigspqinlx`), bundling `_shared` per `supabase/functions/README.md` (rewrite `../_shared/…`→`./_shared/…` in deployed content only). Live caption generation needs the `ANTHROPIC_API_KEY` edge secret (user-set) — deferred to `/run`, matching Days 4–5.
- Never enter/print secrets; reference `.env` values via env vars only.

---

## File Structure

- `supabase/functions/caption/summarize.ts` (+ `.test.ts`) — **create**: pure `summarizeCategories(categories): string`.
- `supabase/functions/caption/caption-writer.ts` — **create**: Claude Sonnet call (no unit test).
- `supabase/functions/caption/handler.ts` (+ `.test.ts`) — **create**: DI handler (generate vs custom, ownership).
- `supabase/functions/caption/index.ts` — **create**: `buildDeps` + `serveJson`.
- `apps/mobile/src/app/reveal/[generationId].tsx` — **modify**: load caption; generate-on-empty; editable field + Regenerate + Save.

---

### Task 1: `caption` Edge Function

**Files:**
- Create: `supabase/functions/caption/{summarize.ts,summarize.test.ts,caption-writer.ts,handler.ts,handler.test.ts,index.ts}`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `POST /functions/v1/caption` body `{generation_id: string, custom_text?: string}` (Authorization = organizer JWT) → `{caption: string, caption_mode: "generated"|"custom"}` (200) or `{error}` (4xx/5xx). Task 2's Reveal screen consumes it.

- [ ] **Step 1: Write failing tests for `summarizeCategories`**

Create `supabase/functions/caption/summarize.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1"
import { summarizeCategories } from "./summarize.ts"

Deno.test("empty -> generic phrase", () => {
  assertEquals(summarizeCategories([]), "a mix of moments")
})
Deno.test("single category -> its readable phrase", () => {
  assertEquals(summarizeCategories(["scenery", "scenery"]), "mostly scenery")
})
Deno.test("dominant + secondary", () => {
  assertEquals(
    summarizeCategories(["group", "group", "group", "scenery"]),
    "mostly group shots, with some scenery",
  )
})
Deno.test("maps every category to a human phrase (no raw enum leaks)", () => {
  const phrase = summarizeCategories(["solo_portrait", "action_fit", "candid_funny", "food"])
  for (const raw of ["solo_portrait", "action_fit", "candid_funny"]) {
    assertEquals(phrase.includes(raw), false)
  }
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test caption/summarize.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `summarize.ts`**

```ts
// Turn the selected photos' content_category counts into a short natural phrase
// for the caption prompt — the "from content" input, with no raw enum values
// leaking into the model prompt.
const PHRASE: Record<string, string> = {
  solo_portrait: "portraits",
  group: "group shots",
  scenery: "scenery",
  food: "food",
  action_fit: "active shots",
  candid_funny: "candid moments",
}

export function summarizeCategories(categories: string[]): string {
  if (categories.length === 0) return "a mix of moments"
  const counts: Record<string, number> = {}
  for (const c of categories) counts[c] = (counts[c] ?? 0) + 1
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => PHRASE[c] ?? "moments")
  if (ranked.length === 1) return `mostly ${ranked[0]}`
  return `mostly ${ranked[0]}, with some ${ranked[1]}`
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd supabase/functions && deno test caption/summarize.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Implement `caption-writer.ts` (no unit test — real Anthropic I/O, verified live in `/run`)**

```ts
import { stripMarkdownFence } from "../_shared/strip-markdown-fence.ts"

export interface CaptionInput {
  tripName: string
  themeName: string | null
  categorySummary: string
  slideCount: number
}

// Writes a short Instagram caption with Claude Sonnet from the generation's
// content (trip + theme + the selected photos' category mix). Text-only — no
// per-photo vision this day.
export async function writeCaption(input: CaptionInput): Promise<string> {
  const themeClause = input.themeName ? ` with a ${input.themeName} mood` : ""
  const prompt =
    `Write a short, natural Instagram caption (1-2 sentences, at most one emoji, no hashtags) ` +
    `for a ${input.slideCount}-photo carousel from a trip called "${input.tripName}"${themeClause}. ` +
    `The photos are ${input.categorySummary}. Respond with ONLY the caption text — no quotes, no preamble.`

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 150,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 300)}`)
  // Strip a stray code fence and any surrounding quotes the model may add.
  return stripMarkdownFence(text).trim().replace(/^["'“”]+|["'“”]+$/g, "").trim()
}
```

- [ ] **Step 6: Write failing handler tests**

Create `supabase/functions/caption/handler.test.ts`:

```ts
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
  let received: { tripName: string; categorySummary: string } | null = null
  const r = await handleCaption(
    baseDeps({
      getOwnedGeneration: async () => ({ trip_id: "t1", theme_id: null, selection: [] }),
      getTripName: async () => null,
      getSelectionCategories: async () => [],
      getThemeDisplayName: async () => null,
      writeCaption: async (input) => { received = input; return "Some caption." },
    }),
    { generation_id: "g1" },
  )
  assertEquals(r.status, 200)
  assert(received !== null)
  assertEquals(received!.tripName, "our trip")
  assertEquals(received!.categorySummary, "a mix of moments")
})
```

- [ ] **Step 7: Run to verify failure**

```bash
cd supabase/functions && deno test caption/handler.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 8: Implement `handler.ts`**

```ts
import { summarizeCategories } from "./summarize.ts"
import type { CaptionInput } from "./caption-writer.ts"

export interface OwnedGeneration {
  trip_id: string
  theme_id: string | null
  selection: { media_item_id: string }[]
}

export interface CaptionDeps {
  // RLS-scoped read: returns the generation only if the caller owns its trip, else null.
  getOwnedGeneration(generationId: string): Promise<OwnedGeneration | null>
  getTripName(tripId: string): Promise<string | null>
  getThemeDisplayName(themeId: string | null): Promise<string | null>
  getSelectionCategories(mediaItemIds: string[]): Promise<string[]>
  writeCaption(input: CaptionInput): Promise<string>
  saveCaption(generationId: string, caption: string, mode: "generated" | "custom"): Promise<void>
}

export interface CaptionRequest {
  generation_id?: string
  custom_text?: string
}

export interface CaptionResult {
  status: number
  body: Record<string, unknown>
}

export async function handleCaption(deps: CaptionDeps, req: CaptionRequest): Promise<CaptionResult> {
  const { generation_id, custom_text } = req
  if (!generation_id) return { status: 400, body: { error: "missing_generation_id" } }

  const generation = await deps.getOwnedGeneration(generation_id)
  if (!generation) return { status: 403, body: { error: "not_generation_owner" } }

  // Write-your-own: persist the user's text verbatim, no model call.
  if (typeof custom_text === "string") {
    const text = custom_text.trim()
    if (!text) return { status: 400, body: { error: "empty_caption" } }
    await deps.saveCaption(generation_id, text, "custom")
    return { status: 200, body: { caption: text, caption_mode: "custom" } }
  }

  // Generate from content.
  const mediaItemIds = generation.selection?.map((s) => s.media_item_id) ?? []
  const [tripName, themeName, categories] = await Promise.all([
    deps.getTripName(generation.trip_id),
    deps.getThemeDisplayName(generation.theme_id),
    deps.getSelectionCategories(mediaItemIds),
  ])

  const caption = await deps.writeCaption({
    tripName: tripName ?? "our trip",
    themeName,
    categorySummary: summarizeCategories(categories),
    slideCount: mediaItemIds.length,
  })
  await deps.saveCaption(generation_id, caption, "generated")
  return { status: 200, body: { caption, caption_mode: "generated" } }
}
```

- [ ] **Step 9: Run to verify pass**

```bash
cd supabase/functions && deno test caption/handler.test.ts
```

Expected: 6 passing.

- [ ] **Step 10: Implement `index.ts`**

```ts
import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { handleCaption, type CaptionDeps, type CaptionRequest } from "./handler.ts"
import { writeCaption } from "./caption-writer.ts"

function buildDeps(authHeader: string): CaptionDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async getOwnedGeneration(generationId) {
      // RLS on generations scopes SELECT to the owner, so a hit means the caller owns it.
      const { data } = await userClient
        .from("generations")
        .select("trip_id, theme_id, selection")
        .eq("id", generationId)
        .maybeSingle()
      if (!data) return null
      return {
        trip_id: data.trip_id,
        theme_id: data.theme_id ?? null,
        selection: Array.isArray(data.selection) ? data.selection : [],
      }
    },
    async getTripName(tripId) {
      const { data } = await supabase.from("trips").select("name").eq("id", tripId).maybeSingle()
      return data?.name ?? null
    },
    async getThemeDisplayName(themeId) {
      if (!themeId) return null
      const { data } = await supabase.from("theme_fingerprints").select("display_name").eq("theme_id", themeId).maybeSingle()
      return data?.display_name ?? null
    },
    async getSelectionCategories(mediaItemIds) {
      if (mediaItemIds.length === 0) return []
      const { data } = await supabase.from("media_items").select("content_category").in("id", mediaItemIds)
      return (data ?? []).map((r) => r.content_category).filter((c): c is string => !!c)
    },
    writeCaption: (input) => writeCaption(input),
    async saveCaption(generationId, caption, mode) {
      await supabase.from("generations").update({ caption, caption_mode: mode }).eq("id", generationId)
    },
  }
}

serveJson<CaptionRequest>((body, req) => {
  const authHeader = req.headers.get("authorization") ?? ""
  return handleCaption(buildDeps(authHeader), body)
})
```

- [ ] **Step 11: Full functions suite + deploy**

```bash
cd supabase/functions && deno test
```

Expected: all pass, no regressions. Then deploy `caption` via Supabase MCP `deploy_edge_function` (bundle `_shared/{supabase-client,cors,serve-json,strip-markdown-fence}.ts`; rewrite import paths in deployed content only). Confirm ACTIVE. (Live caption generation needs the `ANTHROPIC_API_KEY` edge secret — user-set, exercised in `/run`.)

- [ ] **Step 12: Commit**

```bash
git add supabase/functions/caption/
git commit -m "feat: add caption edge function (generate-from-content + write-your-own)"
```

---

### Task 2: Mobile Reveal caption UI

**Files:**
- Modify: `apps/mobile/src/app/reveal/[generationId].tsx`

**Interfaces:**
- Consumes: the `caption` function (Task 1); the generation's stored `caption`/`caption_mode`.
- Produces: end of Day 6's flow.

- [ ] **Step 1: Add caption load + generate-on-empty + edit/regenerate UI**

Modify `apps/mobile/src/app/reveal/[generationId].tsx`:

- Add `TextInput` to the `react-native` import.
- Extend the `generations` select to `"trip_id, output_url, selection, caption, caption_mode"`.
- Add state: `const [caption, setCaption] = useState<string>("")`, `const [captionLoading, setCaptionLoading] = useState(false)`, `const [dirty, setDirty] = useState(false)`.
- After `setTripId(data.trip_id)` in `load()`, seed the caption and trigger generation if empty:

```tsx
      if (typeof data.caption === "string" && data.caption.length > 0) {
        setCaption(data.caption)
      } else {
        void generateCaption()
      }
```

- Add these handlers inside the component (above the render):

```tsx
  async function generateCaption() {
    setCaptionLoading(true)
    const { data, error } = await supabase.functions.invoke<{ caption: string }>("caption", {
      body: { generation_id: generationId },
    })
    setCaptionLoading(false)
    if (!error && data?.caption) {
      setCaption(data.caption)
      setDirty(false)
    }
  }

  async function saveCaption() {
    setCaptionLoading(true)
    const { error } = await supabase.functions.invoke("caption", {
      body: { generation_id: generationId, custom_text: caption },
    })
    setCaptionLoading(false)
    if (!error) setDirty(false)
  }
```

- In the rendered output, between the `counter`/`label` block and the "Back to pool" button, add the caption block:

```tsx
      <View style={styles.captionBlock}>
        <TextInput
          style={styles.captionInput}
          value={caption}
          onChangeText={(t) => { setCaption(t); setDirty(true) }}
          placeholder={captionLoading ? "Writing a caption…" : "Add a caption"}
          placeholderTextColor="#8892A6"
          multiline
          editable={!captionLoading}
        />
        <View style={styles.captionActions}>
          <Pressable onPress={generateCaption} disabled={captionLoading}>
            <Text style={styles.captionAction}>↻ Regenerate</Text>
          </Pressable>
          {dirty ? (
            <Pressable onPress={saveCaption} disabled={captionLoading}>
              <Text style={styles.captionAction}>Save</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
```

- Add to `styles`:

```tsx
  captionBlock: { width: "100%", paddingHorizontal: 24, gap: 6 },
  captionInput: { fontSize: 15, color: "#1A2233", minHeight: 44, textAlignVertical: "top" },
  captionActions: { flexDirection: "row", gap: 20 },
  captionAction: { color: "#1D4ED8", fontWeight: "700", fontSize: 14 },
```

(`generateCaption` is defined before the effect that may call it; if the linter flags use-before-define, wrap the call as `void generateCaption()` after declaring the functions, or move the functions above `useEffect` — either is fine since they close over stable setters.)

- [ ] **Step 2: Verify compile + render (Browser pane)**

Start `mobile-web` (`preview_start` name `mobile-web`); the Reveal route needs a completed generation to render fully, which requires the local `/run` setup — so at minimum confirm the app compiles with no console errors and the route mounts. The full generate→reveal→caption flow is exercised in `/run` (needs organizer session + `ANTHROPIC_API_KEY`). Note the deferral.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/reveal/[generationId].tsx"
git commit -m "feat: caption UI on Reveal (generate, edit, regenerate)"
```

---

## Day 6 Checkpoint (verify in `/run`)

- **Generate-from-content:** call `caption` for a real completed generation and confirm a plausible, on-theme caption comes back and is persisted (`caption`, `caption_mode='generated'` on the row).
- **Write-your-own:** call `caption` with `custom_text` and confirm it persists verbatim with `caption_mode='custom'` and does NOT call the model.
- **Ownership:** a `caption` call for a generation the caller doesn't own → 403.
- **Reveal:** the carousel shows the caption; regenerate produces a different caption; edit + Save persists custom text.

## Deferred (not this day)

- **Vision-enriched captions** (send the hero photo to Sonnet for a richer, image-aware caption) — MVP is text-from-category-mix.
- **The "also made from this trip" sibling-format strip** (Days 7-9) — separate feature.
- **Auto-caption at generation time** — captions are generated lazily on first Reveal + on demand; wiring it into `generate`'s background job is a later option.
