# Day 4: Naive Carousel Generate Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "naive generate" walking-skeleton slice from `docs/plan.md`'s Days 4-6 milestone, leading with the **multi-photo carousel** (the hero format). The organizer picks a theme and a slide count (1–20, recommended 7–12), SCENR selects that many photos (up to 2 favourites reserved, the rest by Claude Haiku quality score), lets them swap any non-favourite slide to a stronger shot *before* rendering, then renders each slide to a clean square and shows a swipeable carousel on Reveal. A single-photo "Post" is just the slider at 1. Spans Day 4 into early Day 5.

**Architecture:** Selection and rendering are split so the slides can be confirmed/swapped *before* anything renders. `rank-media` scores any unscored trip photos via Claude Haiku (concurrent, rate-limit-capped; quality_score + content_category cached onto `media_items`), then returns an **ordered N-slot selection** (bounded-hybrid: reserve ≤2 favourites regardless of category, fill the rest by top quality_score) plus a `bench` of unused candidates for per-slide swaps. The client shows a Preview filmstrip with per-slide swap, then calls `generate` with the final ordered `media_item_id`s; `generate` creates a `generations` row, responds immediately, and in the background (`EdgeRuntime.waitUntil`) calls the single-image `render-worker` once per slide (center-crop to a square, **no watermark**) writing `${trip_id}/${generation_id}/${i}.jpg`, then flips the row to `complete`/`failed`. The mobile app watches that row via Realtime to drive Generating → Reveal.

**Tech Stack:** Deno (Supabase Edge Functions), plain Node + `sharp` (render-worker), Expo/React Native (mobile).

## Global Constraints

- **Carousel is the hero format**; Day 4 leads with it. A "Post" is the slider set to 1 (same pipeline, N=1). Reel/Story are out of scope. Slide slider range **1–20**, recommended band **7–12**, default **9**; show an honest note that fewer slides = weaker theming. No "let us choose" auto-count.
- **No watermark on outputs** (memory `project_scenr_monetization_no_watermark`): the render is a center-crop only. Free/premium differentiation is generation/theme/trip limits, built later (master-plan Days 10-12).
- **Selection = bounded-hybrid, naive fill for Day 4** (memory `project_scenr_generate_selection`): reserve up to **K=2** slots for the organizer's top-scored `is_favourite` photos *regardless of category* (guaranteed, never dropped); fill the remaining N−K slots by top `quality_score`. The real `composition_template` slot-fill + within-category tie-breakers is Days 7-9 — do NOT build category/embedding/theme-mix selection now. Ignore videos (Post/Carousel feature photos only).
- **Swap happens BEFORE generation, per slide, on a Preview step — never a re-render on Reveal.** `rank-media` returns the N slots + a `bench` of unused candidates; the client swaps a non-favourite slot by pulling from the bench (instant, no re-call). Favourite-reserved slots are marked ★ and are not swappable.
- **Per-user favourite precedence is OUT of scope** (post-MVP): `is_favourite` stays a single global boolean, only the organizer generates.
- **No caption generation, no color-grade/LUT** (both Days 7-9). Reveal has no caption UI.
- Render worker is plain Node + `sharp`, a **stateless single-image compositor with zero Supabase credentials**: it takes a signed GET url + signed PUT url and only calls `fetch`. All Storage/DB access stays in the Edge Functions (service-role key). `generate` calls it once per slide.
- **Deploying render-worker to a real host (Fly.io/Render.com) is OUT of scope** — needs the user's own hosting account (account-level action). Verify end-to-end by running render-worker + `npx supabase functions serve` locally with `generate`'s `RENDER_WORKER_URL=http://localhost:8787`. `rank-media` needs no render worker and deploys/runs live immediately.
- Follow the DI/handler pattern everywhere: pure `handle*(deps, req)` + injectable `deps` + thin `index.ts`/`server.js` + fake-injected tests. Reference: `supabase/functions/confirm-upload/handler.ts` + `handler.test.ts`.
- Deno: `Deno.test` + `jsr:@std/assert@1`. Node: `node:test` + `node:assert/strict`. Mobile: existing Jest — only extract a tested module where there's real pure logic; don't force it onto pure-JSX screens.
- Storage: sources in `trip-media` (RLS owner-scoped); outputs in `renders` (already provisioned, owner-scoped RLS) at `${trip_id}/${generation_id}/${i}.jpg`.
- **Known risk for live verification:** Claude's URL image fetch respected Pinterest's `robots.txt` and rejected 100% of pins in Theme Loader, fixed by fetching bytes + base64. Supabase signed-URL domains are not Pinterest; if `scorePhoto` hits a "disallowed by robots.txt" error, apply the same base64 fix.
- **Rate limits:** score photos concurrently but capped (`SCORE_CONCURRENCY = 5`) — firing 20 concurrent Haiku calls risks 429s (cf. Voyage 429s at 3 RPM during Theme Loader). Pre-warm the demo trip (run one generation before demoing) since first-generation cold-cache scoring is the slow path.
- Never enter secrets into files/commands; reference `.env` values via env vars only.

---

## File Structure

- `supabase/migrations/0005_generations_realtime.sql` — adds `generations` to the realtime publication (Task 1).
- `services/render-worker/{package.json,compose.js,compose.test.js,handler.js,handler.test.js,server.js}` — crop-only single-image compositor, no watermark (Task 2).
- `supabase/functions/_shared/strip-markdown-fence.ts` (+ `.test.ts`) — JSON-fence stripper for Haiku responses (Task 3).
- `supabase/functions/_shared/select-slides.ts` (+ `.test.ts`) — pure bounded-hybrid N-slot selection + bench (Task 3).
- `supabase/functions/rank-media/{score-photo.ts,handler.ts,handler.test.ts,index.ts}` — scoring + N-slot ranking (Task 3).
- `supabase/functions/generate/{handler.ts,handler.test.ts,index.ts}` — render N chosen photos (Task 4).
- `apps/mobile/src/app/generate/[tripId].tsx` — Generate Setup (theme + slide slider) + Preview/per-slide-swap (Task 5).
- `apps/mobile/src/app/pool/[tripId].tsx` — modify: add the "Generate ✦" CTA (Task 5).
- `apps/mobile/src/app/generating/[generationId].tsx`, `apps/mobile/src/app/reveal/[generationId].tsx` — Generating + swipeable Reveal carousel (Task 6).

---

### Task 1: Realtime publication migration for `generations`

**Files:**
- Create: `supabase/migrations/0005_generations_realtime.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `generations` emits Postgres Changes over Realtime, filterable by `id` — Task 6's Generating screen subscribes.

- [ ] **Step 1: Write the migration**

```sql
alter publication supabase_realtime add table generations;
```

Save as `supabase/migrations/0005_generations_realtime.sql`.

- [ ] **Step 2: Apply it** — Supabase MCP `apply_migration`: `project_id: alawnboscurigspqinlx`, `name: generations_realtime`, `query:` the SQL above.

- [ ] **Step 3: Verify** — Supabase MCP `execute_sql` against `alawnboscurigspqinlx`:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
```

Expected: includes both `media_items` and `generations`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_generations_realtime.sql
git commit -m "feat: add generations to the realtime publication"
```

---

### Task 2: Render worker — crop-only compositing service (no watermark)

**Files:**
- Create: `services/render-worker/{package.json,compose.js,compose.test.js,handler.js,handler.test.js,server.js}`

**Interfaces:**
- Consumes: nothing.
- Produces: `POST /render` body `{source_url: string, upload_url: string}` → `{success: true}` (200) or `{success: false, error}` (4xx/5xx). Task 4's `generate` calls this once per slide.

- [ ] **Step 1: Create the package**

```json
{
  "name": "render-worker",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test", "start": "node server.js" },
  "dependencies": { "sharp": "^0.33.5" }
}
```

Save as `services/render-worker/package.json`, then `cd services/render-worker && npm install`.

- [ ] **Step 2: Write the failing compositing tests**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { composePost } from "./compose.js"

async function makeTestImage(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } }).jpeg().toBuffer()
}

test("composePost crops a wide image to 1080x1080", async () => {
  const meta = await sharp(await composePost(await makeTestImage(1600, 900))).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})
test("composePost crops a tall image to 1080x1080", async () => {
  const meta = await sharp(await composePost(await makeTestImage(600, 1200))).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})
test("composePost outputs jpeg", async () => {
  const meta = await sharp(await composePost(await makeTestImage(500, 500))).metadata()
  assert.equal(meta.format, "jpeg")
})
```

Save as `services/render-worker/compose.test.js`.

- [ ] **Step 3: Run to verify failure** — `cd services/render-worker && npm test` → FAIL ("Cannot find module './compose.js'").

- [ ] **Step 4: Implement compose.js**

```js
import sharp from "sharp"

const OUTPUT_SIZE = 1080

// Day 4 render: center-crop to a 1080x1080 square, no watermark, no color grade.
// The theme LUT/palette transform is Days 7-9; there is deliberately no watermark
// (plan Global Constraints / project_scenr_monetization_no_watermark).
export async function composePost(imageBuffer) {
  return sharp(imageBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90 })
    .toBuffer()
}
```

Save as `services/render-worker/compose.js`.

- [ ] **Step 5: Run to verify pass** — `npm test` → 3 passing.

- [ ] **Step 6: Write the failing handler tests**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { handleRender } from "./handler.js"

function baseDeps(overrides = {}) {
  return {
    fetchImage: async () => Buffer.from("fake"),
    compose: async (buf) => Buffer.concat([buf, Buffer.from("-c")]),
    uploadImage: async () => true,
    ...overrides,
  }
}

test("400 when source_url/upload_url missing", async () => {
  assert.equal((await handleRender(baseDeps(), {})).status, 400)
})
test("502 when source fetch fails", async () => {
  const d = baseDeps({ fetchImage: async () => { throw new Error("404") } })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 502)
})
test("500 when compositing fails", async () => {
  const d = baseDeps({ compose: async () => { throw new Error("bad") } })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 500)
})
test("502 when upload fails", async () => {
  const d = baseDeps({ uploadImage: async () => false })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 502)
})
test("200 on the happy path", async () => {
  const r = await handleRender(baseDeps(), { source_url: "a", upload_url: "b" })
  assert.equal(r.status, 200)
  assert.equal(r.body.success, true)
})
```

Save as `services/render-worker/handler.test.js`.

- [ ] **Step 7: Run to verify failure** — the 5 new tests fail; 3 compose tests pass.

- [ ] **Step 8: Implement handler.js**

```js
export async function handleRender(deps, req) {
  const { source_url, upload_url } = req
  if (!source_url || !upload_url) return { status: 400, body: { success: false, error: "missing_fields" } }

  let sourceBuffer
  try {
    sourceBuffer = await deps.fetchImage(source_url)
  } catch (error) {
    return { status: 502, body: { success: false, error: `source_fetch_failed: ${error.message}` } }
  }

  let outputBuffer
  try {
    outputBuffer = await deps.compose(sourceBuffer)
  } catch (error) {
    return { status: 500, body: { success: false, error: `compose_failed: ${error.message}` } }
  }

  const uploaded = await deps.uploadImage(upload_url, outputBuffer)
  if (!uploaded) return { status: 502, body: { success: false, error: "upload_failed" } }
  return { status: 200, body: { success: true } }
}
```

Save as `services/render-worker/handler.js`.

- [ ] **Step 9: Run to verify pass** — `npm test` → 8 passing.

- [ ] **Step 10: Implement the HTTP server**

```js
import { createServer } from "node:http"
import { handleRender } from "./handler.js"
import { composePost } from "./compose.js"

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787

async function fetchImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
async function uploadImage(url, buffer) {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: buffer })
  return response.ok
}

const deps = { fetchImage, uploadImage, compose: composePost }

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not_found" }))
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let body
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) } catch { body = {} }
  const result = await handleRender(deps, body)
  res.writeHead(result.status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(result.body))
})

server.listen(PORT, () => console.log(`render-worker listening on :${PORT}`))
```

Save as `services/render-worker/server.js`.

- [ ] **Step 11: Smoke-test**

```bash
cd services/render-worker && node server.js &
sleep 1
curl -s -X POST http://localhost:8787/render -H "Content-Type: application/json" -d '{}'
kill %1
```

Expected: `{"success":false,"error":"missing_fields"}`.

- [ ] **Step 12: Commit**

```bash
git add services/render-worker/
git commit -m "feat: add render-worker crop-only compositing service"
```

---

### Task 3: `rank-media` Edge Function — score pool + bounded-hybrid N-slot selection

**Files:**
- Create: `supabase/functions/_shared/strip-markdown-fence.ts` (+ `.test.ts`)
- Create: `supabase/functions/_shared/select-slides.ts` (+ `.test.ts`)
- Create: `supabase/functions/rank-media/{score-photo.ts,handler.ts,handler.test.ts,index.ts}`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `POST /functions/v1/rank-media` body `{trip_id: string, slide_count: number}` (Authorization = organizer JWT) → `{slots: Slot[], bench: ScoredMedia[], slide_count: number}` (200) or `{error}` (4xx/5xx). `Slot = {media_item_id, storage_path, quality_score, is_favourite, reserved}`; `ScoredMedia` = same minus `reserved`. Task 5's Preview consumes this; Task 4's `generate` consumes the final ordered `media_item_id`s.

- [ ] **Step 1: Write the failing strip-markdown-fence tests**

```ts
import { assertEquals } from "jsr:@std/assert@1"
import { stripMarkdownFence } from "./strip-markdown-fence.ts"

Deno.test("removes a ```json fence", () => {
  assertEquals(stripMarkdownFence('```json\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("removes a bare fence", () => {
  assertEquals(stripMarkdownFence('```\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("passes through unfenced text", () => {
  assertEquals(stripMarkdownFence('{"quality_score": 80}'), '{"quality_score": 80}')
})
```

Save as `supabase/functions/_shared/strip-markdown-fence.test.ts`.

- [ ] **Step 2: Run to verify failure** — `cd supabase/functions && deno test _shared/strip-markdown-fence.test.ts` → FAIL.

- [ ] **Step 3: Implement it**

```ts
export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenceMatch ? fenceMatch[1] : trimmed
}
```

Save as `supabase/functions/_shared/strip-markdown-fence.ts`.

- [ ] **Step 4: Run to verify pass** — 3 passing.

- [ ] **Step 5: Write the failing select-slides tests (the bounded-hybrid heart of the task)**

```ts
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
```

Save as `supabase/functions/_shared/select-slides.test.ts`.

- [ ] **Step 6: Run to verify failure** — FAIL (module not found).

- [ ] **Step 7: Implement select-slides.ts**

```ts
export interface ScoredMedia {
  media_item_id: string
  storage_path: string
  quality_score: number
  is_favourite: boolean
}

export interface Slot extends ScoredMedia {
  reserved: boolean
}

export interface SlideSelection {
  slots: Slot[]
  bench: ScoredMedia[]
  slide_count: number
}

export const FAVOURITE_RESERVE_CAP = 2

// Bounded-hybrid selection (Day 4 naive fill). See project_scenr_generate_selection:
// reserve up to 2 of the organizer's top-scored favourites regardless of category
// (guaranteed inclusions), then fill the remaining slots by top quality_score. The
// real composition_template slot-fill replaces the naive fill in Days 7-9. `bench`
// holds unused candidates (quality desc) so the client can swap non-reserved slots
// without another round-trip. Reserved (favourite) slots are not swappable.
export function selectSlides(pool: ScoredMedia[], slideCount: number): SlideSelection {
  if (pool.length === 0) return { slots: [], bench: [], slide_count: 0 }

  const n = Math.max(1, Math.min(slideCount, pool.length))
  const byQuality = [...pool].sort((a, b) => b.quality_score - a.quality_score)

  const reserved = byQuality.filter((p) => p.is_favourite).slice(0, Math.min(FAVOURITE_RESERVE_CAP, n))
  const reservedIds = new Set(reserved.map((p) => p.media_item_id))

  const fill = byQuality.filter((p) => !reservedIds.has(p.media_item_id)).slice(0, n - reserved.length)
  const selectedIds = new Set([...reservedIds, ...fill.map((p) => p.media_item_id)])

  const slots: Slot[] = [
    ...reserved.map((p) => ({ ...p, reserved: true })),
    ...fill.map((p) => ({ ...p, reserved: false })),
  ]
  const bench = byQuality.filter((p) => !selectedIds.has(p.media_item_id))

  return { slots, bench, slide_count: slots.length }
}
```

Save as `supabase/functions/_shared/select-slides.ts`.

- [ ] **Step 8: Run to verify pass** — 6 passing.

- [ ] **Step 9: Implement score-photo.ts (no dedicated unit test — real Anthropic I/O, verified live in Step 15)**

```ts
import { stripMarkdownFence } from "../_shared/strip-markdown-fence.ts"

export interface PhotoScore {
  quality_score: number
  content_category: string
}

export async function scorePhoto(imageUrl: string): Promise<PhotoScore> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text:
                "Rate this photo's quality as a shareable social media photo on a 0-100 scale " +
                "(sharpness, framing, lighting, subject appeal). Then classify its main subject " +
                "into exactly one category: solo_portrait, group, scenery, food, action_fit, or " +
                'candid_funny. Respond with ONLY a JSON object: {"quality_score": <integer 0-100>, ' +
                '"category": "..."}. No other text.',
            },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 500)}`)
  const parsed = JSON.parse(stripMarkdownFence(text))
  return { quality_score: Number(parsed.quality_score), content_category: parsed.category }
}
```

Save as `supabase/functions/rank-media/score-photo.ts`.

- [ ] **Step 10: Write the failing rank-media handler tests**

```ts
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
```

Save as `supabase/functions/rank-media/handler.test.ts`.

- [ ] **Step 11: Run to verify failure** — FAIL.

- [ ] **Step 12: Implement handler.ts**

```ts
import { selectSlides, type ScoredMedia } from "../_shared/select-slides.ts"

const CONTENT_CATEGORIES = ["solo_portrait", "group", "scenery", "food", "action_fit", "candid_funny"]
const SCORE_CONCURRENCY = 5
const MIN_SLIDES = 1
const MAX_SLIDES = 20

export interface MediaItemRow {
  id: string
  storage_path: string
  quality_score: number | null
  content_category: string | null
  is_favourite: boolean
}

export interface RankMediaDeps {
  verifyTripOwnership(tripId: string): Promise<boolean>
  listTripMedia(tripId: string): Promise<MediaItemRow[]>
  createSignedUrl(path: string): Promise<string | null>
  scoreMedia(imageUrl: string): Promise<{ quality_score: number; content_category: string }>
  updateMediaScore(mediaItemId: string, qualityScore: number, contentCategory: string): Promise<void>
}

export interface RankMediaRequest {
  trip_id?: string
  slide_count?: number
}

export interface RankMediaResult {
  status: number
  // deno-lint-ignore no-explicit-any
  body: any
}

// Run async tasks with a concurrency cap (rate-limit-aware — see SCORE_CONCURRENCY).
async function mapCapped<T, R>(items: T[], cap: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, items.length) }, worker))
  return results
}

export async function handleRankMedia(deps: RankMediaDeps, req: RankMediaRequest): Promise<RankMediaResult> {
  const { trip_id, slide_count } = req
  if (!trip_id) return { status: 400, body: { error: "missing_trip_id" } }
  if (typeof slide_count !== "number" || slide_count < MIN_SLIDES || slide_count > MAX_SLIDES) {
    return { status: 400, body: { error: "invalid_slide_count" } }
  }
  if (!(await deps.verifyTripOwnership(trip_id))) return { status: 403, body: { error: "not_trip_owner" } }

  const media = await deps.listTripMedia(trip_id)
  if (media.length === 0) return { status: 422, body: { error: "no_media" } }

  // Score uncached items concurrently (capped); cached ones pass straight through.
  const scoredOrNull = await mapCapped(media, SCORE_CONCURRENCY, async (item): Promise<ScoredMedia | null> => {
    if (item.quality_score != null && item.content_category != null) {
      return {
        media_item_id: item.id,
        storage_path: item.storage_path,
        quality_score: item.quality_score,
        is_favourite: item.is_favourite,
      }
    }
    const url = await deps.createSignedUrl(item.storage_path)
    if (!url) return null
    try {
      const result = await deps.scoreMedia(url)
      if (!CONTENT_CATEGORIES.includes(result.content_category)) return null
      await deps.updateMediaScore(item.id, result.quality_score, result.content_category)
      return {
        media_item_id: item.id,
        storage_path: item.storage_path,
        quality_score: result.quality_score,
        is_favourite: item.is_favourite,
      }
    } catch {
      return null
    }
  })

  const scored = scoredOrNull.filter((s): s is ScoredMedia => s !== null)
  if (scored.length === 0) return { status: 422, body: { error: "no_media" } }

  return { status: 200, body: selectSlides(scored, slide_count) }
}
```

Save as `supabase/functions/rank-media/handler.ts`.

- [ ] **Step 13: Run to verify pass** — 6 passing.

- [ ] **Step 14: Implement index.ts**

```ts
import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { handleRankMedia, type RankMediaDeps, type RankMediaRequest } from "./handler.ts"
import { scorePhoto } from "./score-photo.ts"

function buildDeps(authHeader: string): RankMediaDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async verifyTripOwnership(tripId) {
      const { data } = await userClient.from("trips").select("id").eq("id", tripId).maybeSingle()
      return !!data
    },
    async listTripMedia(tripId) {
      const { data } = await supabase
        .from("media_items")
        .select("id, storage_path, quality_score, content_category, is_favourite")
        .eq("trip_id", tripId)
        .eq("type", "photo")
      return data ?? []
    },
    async createSignedUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },
    scoreMedia: (imageUrl) => scorePhoto(imageUrl),
    async updateMediaScore(mediaItemId, qualityScore, contentCategory) {
      await supabase
        .from("media_items")
        .update({ quality_score: qualityScore, content_category: contentCategory })
        .eq("id", mediaItemId)
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  const body = (await req.json().catch(() => ({}))) as RankMediaRequest
  const result = await handleRankMedia(buildDeps(authHeader), body)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
```

Save as `supabase/functions/rank-media/index.ts`. Note `listTripMedia` filters `type = "photo"` — carousels feature photos; scoring a video path as an image would fail.

- [ ] **Step 15: Deploy + verify live**

Deploy via Supabase MCP `deploy_edge_function` for `rank-media`, following `supabase/functions/README.md` (nest `_shared/{supabase-client,cors,strip-markdown-fence,select-slides}.ts` under `_shared/` and rewrite `../_shared/...` → `./_shared/...` in the deployed content only). Confirm a trip with real photos exists (`checkpoint-verify-trip-bnb5` from Days 1-3). Get the organizer's JWT (sign in via the local mobile app). Then:

```bash
curl -s -X POST https://alawnboscurigspqinlx.supabase.co/functions/v1/rank-media \
  -H "Content-Type: application/json" -H "Authorization: Bearer <organizer JWT>" \
  -H "apikey: <anon key>" -d '{"trip_id":"<real trip id>","slide_count":5}'
```

Expected: `{slots:[...], bench:[...], slide_count:...}`, favourites (if any) flagged `reserved:true`. Re-run `select id, quality_score, content_category from media_items where trip_id='<id>';` — scores now populated; a second curl returns near-instantly (cached). Apply the base64 fix if `scorePhoto` hits a robots.txt error.

- [ ] **Step 16: Full functions test suite + commit**

```bash
cd supabase/functions && deno test
```

All pass. Then:

```bash
git add supabase/functions/_shared/strip-markdown-fence.ts supabase/functions/_shared/strip-markdown-fence.test.ts supabase/functions/_shared/select-slides.ts supabase/functions/_shared/select-slides.test.ts supabase/functions/rank-media/
git commit -m "feat: add rank-media edge function (score + bounded-hybrid N-slot selection)"
```

---

### Task 4: `generate` Edge Function — render N chosen photos into a carousel

**Files:**
- Create: `supabase/functions/generate/{handler.ts,handler.test.ts,index.ts}`

**Interfaces:**
- Consumes: the final ordered `media_item_id`s (from Task 3 via the client); render-worker's `POST /render` (Task 2).
- Produces: `POST /functions/v1/generate` body `{trip_id: string, theme_id?: string, media_item_ids: string[]}` (Authorization = organizer JWT) → `{generation_id}` immediately; background renders each slide, flips the row to `complete` (`output_url = <trip_id>/<generation_id>/`, `selection = [{media_item_id}, ...]` in slide order) or `failed`. Type is derived: `media_item_ids.length === 1 ? "post" : "carousel"`. Tasks 5/6 consume `generation_id` + the row's `status`/`output_url`/`selection`.

- [ ] **Step 1: Write the failing handler tests**

```ts
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
    renderPost: async () => true,
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
  await processGeneration(deps, "gen1", "t1", ["mA", "mB", "mC"])
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
  await processGeneration(deps, "gen1", "t1", ["ok", "bad"])
  assertEquals(updates[updates.length - 1].status, "failed")
})
Deno.test("processGeneration fails when a render fails", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    renderPost: async () => false,
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["m1"])
  assertEquals(updates[updates.length - 1].status, "failed")
})
Deno.test("processGeneration fails gracefully on an unexpected exception", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    getMediaStoragePath: async () => { throw new Error("db down") },
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", ["m1"])
  assertEquals(updates[updates.length - 1].status, "failed")
})
```

Save as `supabase/functions/generate/handler.test.ts`.

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement handler.ts**

```ts
const MAX_SLIDES = 20

export interface GenerateDeps {
  verifyMediaBelongToTrip(mediaItemIds: string[], tripId: string): Promise<boolean>
  createGeneration(tripId: string, themeId: string | null, type: "post" | "carousel"): Promise<{ id: string } | null>
  updateGeneration(id: string, patch: Record<string, unknown>): Promise<void>
  getMediaStoragePath(mediaItemId: string): Promise<string | null>
  createSignedUrl(path: string): Promise<string | null>
  createSignedUploadUrl(path: string): Promise<string | null>
  renderPost(sourceUrl: string, uploadUrl: string): Promise<boolean>
  waitUntil(promise: Promise<void>): void
}

export interface GenerateRequest {
  trip_id?: string
  theme_id?: string
  media_item_ids?: string[]
}

export interface GenerateResult {
  status: number
  body: Record<string, unknown>
}

export async function handleGenerate(deps: GenerateDeps, req: GenerateRequest): Promise<GenerateResult> {
  const { trip_id, theme_id, media_item_ids } = req
  if (!trip_id || !Array.isArray(media_item_ids) || media_item_ids.length < 1 || media_item_ids.length > MAX_SLIDES) {
    return { status: 400, body: { error: "invalid_request" } }
  }

  // Runs against the caller's RLS-scoped client, so this confirms both "all these
  // media are in this trip" and "the caller owns the trip".
  if (!(await deps.verifyMediaBelongToTrip(media_item_ids, trip_id))) {
    return { status: 403, body: { error: "not_trip_owner" } }
  }

  const type = media_item_ids.length === 1 ? "post" : "carousel"
  const generation = await deps.createGeneration(trip_id, theme_id ?? null, type)
  if (!generation) return { status: 500, body: { error: "generation_create_failed" } }

  deps.waitUntil(processGeneration(deps, generation.id, trip_id, media_item_ids))
  return { status: 200, body: { generation_id: generation.id } }
}

export async function processGeneration(
  deps: GenerateDeps,
  generationId: string,
  tripId: string,
  mediaItemIds: string[],
): Promise<void> {
  try {
    await deps.updateGeneration(generationId, { status: "processing" })

    for (let i = 0; i < mediaItemIds.length; i++) {
      const storagePath = await deps.getMediaStoragePath(mediaItemIds[i])
      if (!storagePath) {
        await deps.updateGeneration(generationId, { status: "failed" })
        return
      }
      const sourceUrl = await deps.createSignedUrl(storagePath)
      const uploadUrl = await deps.createSignedUploadUrl(`${tripId}/${generationId}/${i}.jpg`)
      if (!sourceUrl || !uploadUrl) {
        await deps.updateGeneration(generationId, { status: "failed" })
        return
      }
      const rendered = await deps.renderPost(sourceUrl, uploadUrl)
      if (!rendered) {
        await deps.updateGeneration(generationId, { status: "failed" })
        return
      }
    }

    await deps.updateGeneration(generationId, {
      status: "complete",
      output_url: `${tripId}/${generationId}/`,
      selection: mediaItemIds.map((id) => ({ media_item_id: id })),
      completed_at: new Date().toISOString(),
    })
  } catch {
    await deps.updateGeneration(generationId, { status: "failed" })
  }
}
```

Save as `supabase/functions/generate/handler.ts`.

- [ ] **Step 4: Run to verify pass** — 9 passing.

- [ ] **Step 5: Implement index.ts**

```ts
import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { handleGenerate, type GenerateDeps, type GenerateRequest } from "./handler.ts"

const RENDER_WORKER_URL = Deno.env.get("RENDER_WORKER_URL") ?? "http://localhost:8787"

function buildDeps(authHeader: string): GenerateDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async verifyMediaBelongToTrip(mediaItemIds, tripId) {
      // RLS scopes media_items SELECT to trips the caller owns. A row count equal
      // to the id count means every id exists AND is in a trip the caller owns.
      const { data } = await userClient
        .from("media_items")
        .select("id")
        .eq("trip_id", tripId)
        .in("id", mediaItemIds)
      return (data?.length ?? 0) === mediaItemIds.length
    },
    async createGeneration(tripId, themeId, type) {
      const { data } = await supabase
        .from("generations")
        .insert({ trip_id: tripId, type, theme_id: themeId })
        .select("id")
        .single()
      return data ?? null
    },
    async updateGeneration(id, patch) {
      await supabase.from("generations").update(patch).eq("id", id)
    },
    async getMediaStoragePath(mediaItemId) {
      const { data } = await supabase.from("media_items").select("storage_path").eq("id", mediaItemId).maybeSingle()
      return data?.storage_path ?? null
    },
    async createSignedUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },
    async createSignedUploadUrl(path) {
      const { data } = await supabase.storage.from("renders").createSignedUploadUrl(path)
      return data?.signedUrl ?? null
    },
    async renderPost(sourceUrl, uploadUrl) {
      const response = await fetch(`${RENDER_WORKER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, upload_url: uploadUrl }),
      })
      if (!response.ok) return false
      const body = await response.json().catch(() => ({ success: false }))
      return body.success === true
    },
    waitUntil(promise) {
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<void>): void } }).EdgeRuntime
      if (runtime) runtime.waitUntil(promise)
      else promise.catch(() => {})
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  const body = (await req.json().catch(() => ({}))) as GenerateRequest
  const result = await handleGenerate(buildDeps(authHeader), body)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
```

Save as `supabase/functions/generate/index.ts`.

- [ ] **Step 6: Full functions test suite** — `cd supabase/functions && deno test` → all pass.

- [ ] **Step 7: Deploy `generate`** via Supabase MCP `deploy_edge_function` (bundle `_shared/{supabase-client,cors}.ts`). Leave `RENDER_WORKER_URL` unset in prod until render-worker is hosted (renders fail there until then — acceptable; verified locally next).

- [ ] **Step 8: Verify end-to-end locally**

Three terminals: (1) `cd services/render-worker && node server.js`; (2) `cd supabase && RENDER_WORKER_URL=http://localhost:8787 npx supabase functions serve --env-file ../.env`; (3) run the flow. Call `rank-media` (Task 3 Step 15) with `slide_count: 3` against a real trip, take three `slots[].media_item_id`, then:

```bash
curl -s -X POST http://localhost:54321/functions/v1/generate \
  -H "Content-Type: application/json" -H "Authorization: Bearer <organizer JWT>" -H "apikey: <anon key>" \
  -d '{"trip_id":"<real trip id>","theme_id":"golden_hour","media_item_ids":["<id0>","<id1>","<id2>"]}'
```

Expected: `{"generation_id":"..."}`. Poll `select status, output_url, selection from generations where id='<gen>';` → `complete`, `output_url = <trip>/<gen>/`, `selection` a 3-element array. Confirm the files: `select name from storage.objects where name like '<trip>/<gen>/%' order by name;` → `0.jpg, 1.jpg, 2.jpg`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/generate/
git commit -m "feat: add generate edge function (render N chosen photos into a carousel)"
```

---

### Task 5: Mobile — Generate Setup (theme + slide slider) + Preview/per-slide-swap

**Files:**
- Create: `apps/mobile/src/app/generate/[tripId].tsx`
- Modify: `apps/mobile/src/app/pool/[tripId].tsx`

**Interfaces:**
- Consumes: `theme_fingerprints` (`theme_id`, `display_name`); `rank-media` → `{slots, bench, slide_count}`; `generate` → `{generation_id}`.
- Produces: navigates to `/generating/[generationId]` (Task 6).

Install the slider component (Expo-managed):

```bash
cd apps/mobile && npx expo install @react-native-community/slider
```

- [ ] **Step 1: Create the Generate Setup + Preview/Swap screen**

Two phases in one file: **setup** (theme chips + slide slider 1–20, recommended-band hint, honesty note → calls `rank-media`) and **preview** (filmstrip of slots; non-reserved slides show a swap button that pulls from `bench`; reserved slides show ★; → calls `generate`).

```tsx
import { useEffect, useMemo, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import Slider from "@react-native-community/slider"
import { supabase } from "../../lib/supabase"

interface ThemeOption { theme_id: string; display_name: string }
interface ScoredMedia { media_item_id: string; storage_path: string; quality_score: number; is_favourite: boolean }
interface Slot extends ScoredMedia { reserved: boolean }
interface RankResult { slots: Slot[]; bench: ScoredMedia[]; slide_count: number }

const MIN_SLIDES = 1
const MAX_SLIDES = 20
const DEFAULT_SLIDES = 9

export default function GenerateScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const router = useRouter()
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [bench, setBench] = useState<ScoredMedia[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.from("theme_fingerprints").select("theme_id, display_name").order("theme_id").then(({ data }) => {
      if (mounted && data) setThemes(data as ThemeOption[])
    })
    return () => { mounted = false }
  }, [])

  // Lazily resolve signed thumbnail URLs for whatever storage paths are on screen.
  async function ensureUrls(items: { media_item_id: string; storage_path: string }[]) {
    const missing = items.filter((i) => !urls[i.media_item_id])
    if (missing.length === 0) return
    const { data } = await supabase.storage.from("trip-media").createSignedUrls(missing.map((i) => i.storage_path), 3600)
    if (!data) return
    const pathToId = new Map(missing.map((i) => [i.storage_path, i.media_item_id]))
    setUrls((cur) => {
      const next = { ...cur }
      for (const entry of data) {
        const id = pathToId.get(entry.path ?? "")
        if (id && entry.signedUrl) next[id] = entry.signedUrl
      }
      return next
    })
  }

  useEffect(() => {
    if (slots) ensureUrls([...slots, ...bench])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bench])

  const recommended = slideCount >= 7 && slideCount <= 12

  async function handleFindShots() {
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<RankResult>("rank-media", {
      body: { trip_id: tripId, slide_count: slideCount },
    })
    setBusy(false)
    if (error || !data) { setErrorMessage(error?.message ?? "Couldn't build a selection."); return }
    setSlots(data.slots)
    setBench(data.bench)
  }

  function handleSwap(index: number) {
    if (!slots || bench.length === 0) return
    const incoming = bench[0]
    const outgoing = slots[index]
    const nextSlots = [...slots]
    nextSlots[index] = { ...incoming, reserved: false }
    setSlots(nextSlots)
    // Cycle the swapped-out photo to the back of the bench so it stays reachable.
    setBench([...bench.slice(1), { ...outgoing }])
  }

  async function handleGenerate() {
    if (!slots) return
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<{ generation_id: string }>("generate", {
      body: { trip_id: tripId, theme_id: selectedThemeId, media_item_ids: slots.map((s) => s.media_item_id) },
    })
    if (error || !data) { setErrorMessage(error?.message ?? "Could not start generation."); setBusy(false); return }
    router.replace(`/generating/${data.generation_id}`)
  }

  // Preview phase
  if (slots) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your {slots.length === 1 ? "post" : "carousel"}</Text>
        <Text style={styles.hint}>{slots.length} slide{slots.length === 1 ? "" : "s"} · tap a slide to swap it</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstrip}>
          {slots.map((slot, index) => (
            <View key={`${slot.media_item_id}-${index}`} style={styles.slideWrap}>
              {urls[slot.media_item_id] ? (
                <Image source={{ uri: urls[slot.media_item_id] }} style={styles.slide} />
              ) : (
                <View style={[styles.slide, styles.slidePlaceholder]}><ActivityIndicator /></View>
              )}
              {slot.reserved ? (
                <Text style={styles.reservedBadge}>★</Text>
              ) : (
                <Pressable style={styles.swapBadge} onPress={() => handleSwap(index)} disabled={bench.length === 0}>
                  <Text style={styles.swapBadgeText}>{bench.length === 0 ? "—" : "swap"}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={handleGenerate} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Generate ✦</Text>}
        </Pressable>
      </View>
    )
  }

  // Setup phase
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create something</Text>

      <Text style={styles.sectionLabel}>Theme</Text>
      <View style={styles.row}>
        {themes.map((theme) => (
          <Pressable
            key={theme.theme_id}
            style={[styles.chip, selectedThemeId === theme.theme_id && styles.chipActive]}
            onPress={() => setSelectedThemeId(theme.theme_id)}
          >
            <Text style={[styles.chipText, selectedThemeId === theme.theme_id && styles.chipTextActive]}>
              {theme.display_name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Slides: {slideCount}{recommended ? "  ✓ recommended" : ""}</Text>
      <Slider
        minimumValue={MIN_SLIDES}
        maximumValue={MAX_SLIDES}
        step={1}
        value={slideCount}
        onValueChange={setSlideCount}
        minimumTrackTintColor="#1D4ED8"
      />
      <Text style={styles.note}>
        {slideCount <= 2
          ? "Fewer slides means the theme has less to work with — 7–12 shows it off best."
          : "7–12 slides gives the theme the most to work with."}
      </Text>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleFindShots} disabled={busy}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Find my best shots →</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  hint: { fontSize: 13, color: "#51596A" },
  sectionLabel: { fontSize: 12, color: "#8892A6", fontWeight: "700", textTransform: "uppercase", marginTop: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: "#C3D0E8" },
  chipActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  chipText: { color: "#1D4ED8", fontWeight: "600" },
  chipTextActive: { color: "white" },
  note: { fontSize: 12, color: "#8892A6" },
  filmstrip: { gap: 10, paddingVertical: 8 },
  slideWrap: { width: 160, height: 160, borderRadius: 12, overflow: "hidden", backgroundColor: "#EEF2FB" },
  slide: { width: "100%", height: "100%" },
  slidePlaceholder: { alignItems: "center", justifyContent: "center" },
  reservedBadge: { position: "absolute", top: 6, right: 8, fontSize: 20, color: "#FBBF24" },
  swapBadge: { position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(29,78,216,0.9)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  swapBadgeText: { color: "white", fontSize: 11, fontWeight: "700" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 16, borderRadius: 999, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
```

Save as `apps/mobile/src/app/generate/[tripId].tsx`.

- [ ] **Step 2: Wire the Pool screen's "Generate ✦" CTA**

In `apps/mobile/src/app/pool/[tripId].tsx`: change the import to `import { useLocalSearchParams, useRouter } from "expo-router"`, add `const router = useRouter()` after the `tripId` param line, and just before the final `</View>` closing `styles.container` add:

```tsx
{items.length > 0 ? (
  <Pressable style={styles.generateButton} onPress={() => router.push(`/generate/${tripId}`)}>
    <Text style={styles.generateButtonText}>Generate ✦</Text>
  </Pressable>
) : null}
```

Add to `styles`:

```tsx
generateButton: { position: "absolute", bottom: 24, alignSelf: "center", backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999 },
generateButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
```

- [ ] **Step 3: Manual verification (Browser pane)**

Start `mobile-web`, open a trip pool with several photos, confirm "Generate ✦" appears → tap → Generate Setup shows the 5 real theme chips + a working slider (default 9, "✓ recommended" in the 7–12 band, honesty note flips at ≤2). Pick a theme, set slides to 3, tap "Find my best shots" (needs `rank-media` live from Task 3 or functions served locally). Confirm the Preview filmstrip shows 3 real photos, any favourite marked ★ and not swappable, non-favourites show "swap" and swapping replaces the image.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/generate/ "apps/mobile/src/app/pool/[tripId].tsx" apps/mobile/package.json
git commit -m "feat: add Generate Setup (theme + slide slider) + Preview/per-slide-swap"
```

---

### Task 6: Mobile — Generating and swipeable Reveal carousel (bleeds into Day 5)

**Files:**
- Create: `apps/mobile/src/app/generating/[generationId].tsx`
- Create: `apps/mobile/src/app/reveal/[generationId].tsx`

**Interfaces:**
- Consumes: `generations` row (`id`, `trip_id`, `status`, `output_url`, `selection`) via Realtime (Task 1) + direct `select`; `renders` bucket signed URLs for `${output_url}${i}.jpg`, `i` in `0..selection.length-1`.
- Produces: end of Day 4's flow.

- [ ] **Step 1: Create the Generating screen**

```tsx
import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

type GenerationStatus = "pending" | "processing" | "complete" | "failed"

export default function GeneratingScreen() {
  const { generationId } = useLocalSearchParams<{ generationId: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<GenerationStatus>("pending")

  useEffect(() => {
    let mounted = true
    supabase.from("generations").select("status").eq("id", generationId).single().then(({ data }) => {
      if (mounted && data) setStatus(data.status as GenerationStatus)
    })
    const channel = supabase
      .channel(`generations:id=eq.${generationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generations", filter: `id=eq.${generationId}` },
        (payload) => setStatus(payload.new.status as GenerationStatus),
      )
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [generationId])

  useEffect(() => {
    if (status === "complete") router.replace(`/reveal/${generationId}`)
  }, [status, generationId, router])

  if (status === "failed") {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Couldn&apos;t make this one</Text>
        <Text style={styles.subtitle}>Try again from the pool.</Text>
      </View>
    )
  }
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.title}>Creating your carousel…</Text>
      <Text style={styles.subtitle}>Styling your best shots.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", marginTop: 16 },
  subtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
  errorTitle: { fontSize: 18, fontWeight: "700" },
})
```

Save as `apps/mobile/src/app/generating/[generationId].tsx`.

- [ ] **Step 2: Create the swipeable Reveal carousel**

```tsx
import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

const { width } = Dimensions.get("window")

export default function RevealScreen() {
  const { generationId } = useLocalSearchParams<{ generationId: string }>()
  const router = useRouter()
  const [urls, setUrls] = useState<string[]>([])
  const [tripId, setTripId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data, error } = await supabase
        .from("generations")
        .select("trip_id, output_url, selection")
        .eq("id", generationId)
        .single()
      if (!mounted) return
      if (error || !data?.output_url || !Array.isArray(data.selection)) {
        setErrorMessage(error?.message ?? "This carousel isn't ready.")
        return
      }
      setTripId(data.trip_id)
      const paths = data.selection.map((_: unknown, i: number) => `${data.output_url}${i}.jpg`)
      const { data: signed } = await supabase.storage.from("renders").createSignedUrls(paths, 3600)
      if (!mounted || !signed) return
      setUrls(signed.map((s) => s.signedUrl).filter((u): u is string => !!u))
    }
    load()
    return () => { mounted = false }
  }, [generationId])

  if (errorMessage) {
    return <View style={styles.centered}><Text style={styles.error}>{errorMessage}</Text></View>
  }
  if (urls.length === 0) {
    return <View style={styles.centered}><ActivityIndicator /></View>
  }
  return (
    <View style={styles.container}>
      <FlatList
        data={urls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${i}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height: width }} />}
      />
      <Text style={styles.counter}>{index + 1} / {urls.length}</Text>
      <Text style={styles.label}>Your {urls.length === 1 ? "Post" : "Carousel"}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => tripId && router.replace(`/pool/${tripId}`)}>
        <Text style={styles.secondaryButtonText}>Back to pool</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  counter: { fontSize: 13, color: "#51596A", fontWeight: "600" },
  label: { fontSize: 18, fontWeight: "800" },
  secondaryButton: { borderWidth: 1, borderColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999 },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
```

Save as `apps/mobile/src/app/reveal/[generationId].tsx`.

- [ ] **Step 3: Manual verification (Browser pane) — the full checkpoint**

With render-worker + `npx supabase functions serve` running locally and `mobile-web` up: from a trip pool → Generate ✦ → pick a theme, set slides to ~5 → "Find my best shots" → Preview filmstrip (try a swap) → "Generate ✦" → Generating spinner → auto-navigates to Reveal showing a **swipeable carousel of real rendered square photos, no watermark**, with a working "1 / 5" counter → "Back to pool" returns. Screenshot the Reveal as proof.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/generating/ apps/mobile/src/app/reveal/
git commit -m "feat: add Generating and swipeable Reveal carousel screens"
```

---

## Day 4 Checkpoint

Full walking skeleton per `docs/plan.md`'s Days 4-6 milestone, led by the carousel: create trip → invite → appless upload → live pool → **pick slides (favourite-reserved, per-slide swap before render) → real rendered multi-photo carousel on Reveal**. Verified end-to-end in the Browser pane with a real trip and a real Claude Haiku scoring pass — no mocks, no watermark.

**Deferred gaps to flag to the user once the plan is done:**
- **render-worker has no real host yet** (Fly.io/Render.com) — deployed `generate`'s `RENDER_WORKER_URL` points nowhere until that's set up (an account-level action, like the prior Apify/Voyage steps). `rank-media`, scoring, selection, and the mobile flow are fully live.
- **Naive fill** — Day 4 carousels differ by *which* photos, not yet by a theme-correct *mix* or color grade; the real `composition_template` slot-fill + LUT are Days 7-9 (theme choice looks weakly differentiated until then, especially at low slide counts — which the UI says honestly).
- **Per-user favourite precedence** and **free-tier limits** (the actual monetization) remain post-MVP / Days 10-12 respectively.
