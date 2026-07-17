# Day 4: Naive Generate Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "naive generate" walking-skeleton slice from `docs/plan.md`'s Days 4-6 milestone — organizer taps Generate on a trip, SCENR picks the featured photo (their favourite by default, else the highest-quality shot from a Claude Haiku pass), lets them swap to a stronger shot *before* rendering, then renders a clean square Post and shows it on a Reveal screen. Spans Day 4 into early Day 5.

**Architecture:** Selection and rendering are split across two Edge Functions so the user can confirm/swap the pick *before* anything is rendered. `rank-media` scores any unscored trip photos via Claude Haiku (quality_score + content_category, cached onto `media_items`), then returns a favourite-first pick plus an optional "stronger shot" swap suggestion. The client shows a Preview/Swap step, then calls `generate` with the chosen `media_item_id`; `generate` creates a `generations` row, responds immediately with its id, and does the render in the background (`EdgeRuntime.waitUntil`) by calling a new standalone `render-worker` Node service (center-crop to a square, **no watermark**), uploading to the `renders` bucket, and flipping the row to `complete`/`failed`. The mobile app watches that row via Supabase Realtime (same pattern as the Media Pool screen) to drive Generating → Reveal.

**Tech Stack:** Deno (Supabase Edge Functions, existing convention), plain Node + `sharp` (render-worker, matching `docs/plan.md`'s render pipeline stack), Expo/React Native (mobile, existing convention).

## Global Constraints

- Day 4 builds **Post only**. Carousel/Story/Reel are out of scope (per `docs/plan.md`'s Days 4-6 milestone).
- **No watermark on outputs.** Product decision (grilling session 2026-07-16, memory `project_scenr_monetization_no_watermark`): a watermark makes the free output unusable and defeats the free-tier "taste." Free/premium differentiation is generation/theme/trip limits, built later (master-plan Days 10-12), NOT watermarking. This overrides the master plan's Day 4-6 line about a watermark placeholder and the Figma "Remove watermark with Pro" CTA.
- **Selection is favourite-first, organizer-scoped** (memory `project_scenr_generate_selection`): the organizer's `is_favourite` photo wins by default regardless of score; fall back to top `quality_score` when nothing is starred; multiple favourites → highest-scored among them. Ignore embeddings/theme composition entirely — the real theme-aware slot-fill is Days 7-9, do not build it now.
- **Swap happens BEFORE generation, on a Preview step — never a re-render on Reveal.** When the pick is a favourite but a strictly-higher-scored non-favourite exists, `rank-media` returns it as a swap suggestion; the client offers a single "swap to a stronger shot" toggle; `generate` renders whichever `media_item_id` the client finally sends. No double-render.
- **Per-user favourite precedence is explicitly OUT of scope** (post-MVP): `is_favourite` stays a single global boolean and only the organizer generates. Do not add per-user favourite tracking or contributor-generation here.
- **No caption generation, no color-grade/LUT.** Both are Days 7-9 per `docs/plan.md`. The render is a center-crop only; the Reveal screen has no caption UI.
- Render worker stack is plain Node + `sharp`, per `docs/plan.md` — not a Deno Edge Function (Deno can't reliably run `sharp`'s native binary). It is a **stateless compositor with zero Supabase credentials**: it receives a signed GET url (source) and signed PUT url (destination) and only calls `fetch`. All Storage/DB access stays in the Edge Functions, which hold the service-role key.
- **Deploying render-worker to a real host (Fly.io/Render.com) is OUT of scope** — it needs the user's own hosting-provider account (an account-level action, like the prior Apify/Voyage steps). This plan verifies end-to-end by running `render-worker` locally (`node server.js`) and the functions locally (`npx supabase functions serve`), with `generate`'s `RENDER_WORKER_URL` pointed at `http://localhost:8787`. `rank-media` needs no render worker and can deploy + run live immediately. Flag the render-worker host as a follow-up once the plan is done.
- Follow the codebase's established DI/handler pattern everywhere: a pure `handle*(deps, req)` function with injectable `deps`, a thin `index.ts`/`server.js` wiring real I/O, tests that inject fakes. Reference: `supabase/functions/confirm-upload/handler.ts` + `handler.test.ts`.
- Deno functions: `Deno.test` + `jsr:@std/assert@1`, run via `deno test`. Node services: `node:test` + `node:assert/strict`, run via `npm test`. Mobile: existing Jest setup — only add a Jest suite where there's real pure logic to extract; don't force it onto pure-JSX screens (the Day 2 precedent: `pool/[tripId].tsx`'s inline lookup table was never split out).
- Storage: source photos stay in `trip-media` (RLS already owner-scoped). Rendered output goes to `renders` (already provisioned, `supabase/migrations/0002_storage.sql`, owner-scoped RLS) at `${trip_id}/${generation_id}.jpg`.
- **Known risk for Task 3's live verification:** Claude's URL-based image fetch respected Pinterest's `robots.txt` and rejected 100% of pins during Theme Loader (`scripts/theme-loader/extract-features.js`'s `tagImage`), fixed by fetching bytes + sending base64. Supabase signed-URL domains are not Pinterest and this may not recur; but if `scorePhoto` fails with a "disallowed by robots.txt" error, apply the same fix (fetch bytes, send `{type:"image",source:{type:"base64",...}}`).
- Never enter secrets into files/commands. `.env` already has `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; reference via env vars only.

---

## File Structure

- `supabase/migrations/0005_generations_realtime.sql` — new migration, adds `generations` to the realtime publication (Task 1).
- `services/render-worker/{package.json,compose.js,compose.test.js,handler.js,handler.test.js,server.js}` — new Node compositing service, crop-only, no watermark (Task 2).
- `supabase/functions/_shared/strip-markdown-fence.ts` (+ `.test.ts`) — shared JSON-fence stripper for Haiku responses (Task 3).
- `supabase/functions/_shared/select-photo.ts` (+ `.test.ts`) — pure favourite-first pick + swap-suggestion logic, shared/testable (Task 3).
- `supabase/functions/rank-media/{score-photo.ts,handler.ts,handler.test.ts,index.ts}` — scoring + ranking function (Task 3).
- `supabase/functions/generate/{handler.ts,handler.test.ts,index.ts}` — render-a-chosen-photo function (Task 4).
- `apps/mobile/src/app/generate/[tripId].tsx` — Generate Setup + Preview/Swap screen (Task 5).
- `apps/mobile/src/app/pool/[tripId].tsx` — modify: add the "Generate ✦" CTA (Task 5).
- `apps/mobile/src/app/generating/[generationId].tsx`, `apps/mobile/src/app/reveal/[generationId].tsx` — Generating + Reveal Post screens (Task 6).

---

### Task 1: Realtime publication migration for `generations`

**Files:**
- Create: `supabase/migrations/0005_generations_realtime.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `generations` emits Postgres Changes over Realtime, filterable by `id`/`trip_id` — Task 6's Generating screen subscribes.

- [ ] **Step 1: Write the migration**

```sql
alter publication supabase_realtime add table generations;
```

Save as `supabase/migrations/0005_generations_realtime.sql`.

- [ ] **Step 2: Apply it to the live project** — Supabase MCP `apply_migration`: `project_id: alawnboscurigspqinlx`, `name: generations_realtime`, `query:` the SQL above.

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
- Consumes: nothing (self-contained; `generate` calls it over HTTP in Task 4).
- Produces: `POST /render` with body `{source_url: string, upload_url: string}` → `{success: true}` (status 200) or `{success: false, error: string}` (4xx/5xx). This exact contract is what Task 4's `index.ts` calls.

- [ ] **Step 1: Create the package**

```json
{
  "name": "render-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "node server.js"
  },
  "dependencies": {
    "sharp": "^0.33.5"
  }
}
```

Save as `services/render-worker/package.json`, then:

```bash
cd services/render-worker && npm install
```

- [ ] **Step 2: Write the failing compositing tests**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { composePost } from "./compose.js"

async function makeTestImage(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .toBuffer()
}

test("composePost crops a wide image to a 1080x1080 square", async () => {
  const output = await composePost(await makeTestImage(1600, 900))
  const meta = await sharp(output).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})

test("composePost crops a tall image to a 1080x1080 square", async () => {
  const output = await composePost(await makeTestImage(600, 1200))
  const meta = await sharp(output).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})

test("composePost outputs jpeg", async () => {
  const output = await composePost(await makeTestImage(500, 500))
  const meta = await sharp(output).metadata()
  assert.equal(meta.format, "jpeg")
})
```

Save as `services/render-worker/compose.test.js`.

- [ ] **Step 3: Run to verify failure**

```bash
cd services/render-worker && npm test
```

Expected: FAIL — "Cannot find module './compose.js'".

- [ ] **Step 4: Implement compose.js**

```js
import sharp from "sharp"

const OUTPUT_SIZE = 1080

// Day 4 render: center-crop to a 1080x1080 square, no watermark, no color grade.
// The theme LUT/palette transform is Days 7-9; there is deliberately no
// watermark (see plan Global Constraints / project_scenr_monetization_no_watermark).
export async function composePost(imageBuffer) {
  return sharp(imageBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90 })
    .toBuffer()
}
```

Save as `services/render-worker/compose.js`.

- [ ] **Step 5: Run to verify pass**

```bash
cd services/render-worker && npm test
```

Expected: 3 tests passing.

- [ ] **Step 6: Write the failing handler tests**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { handleRender } from "./handler.js"

function baseDeps(overrides = {}) {
  return {
    fetchImage: async () => Buffer.from("fake-image-bytes"),
    compose: async (buf) => Buffer.concat([buf, Buffer.from("-composed")]),
    uploadImage: async () => true,
    ...overrides,
  }
}

test("returns 400 when source_url or upload_url is missing", async () => {
  const result = await handleRender(baseDeps(), {})
  assert.equal(result.status, 400)
  assert.equal(result.body.success, false)
})

test("returns 502 when the source image fetch fails", async () => {
  const deps = baseDeps({ fetchImage: async () => { throw new Error("404") } })
  const result = await handleRender(deps, { source_url: "https://x/s.jpg", upload_url: "https://x/u" })
  assert.equal(result.status, 502)
})

test("returns 500 when compositing fails", async () => {
  const deps = baseDeps({ compose: async () => { throw new Error("bad image") } })
  const result = await handleRender(deps, { source_url: "https://x/s.jpg", upload_url: "https://x/u" })
  assert.equal(result.status, 500)
})

test("returns 502 when the upload fails", async () => {
  const deps = baseDeps({ uploadImage: async () => false })
  const result = await handleRender(deps, { source_url: "https://x/s.jpg", upload_url: "https://x/u" })
  assert.equal(result.status, 502)
})

test("returns 200 success on the full happy path", async () => {
  const result = await handleRender(baseDeps(), { source_url: "https://x/s.jpg", upload_url: "https://x/u" })
  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
})
```

Save as `services/render-worker/handler.test.js`.

- [ ] **Step 7: Run to verify failure**

```bash
cd services/render-worker && npm test
```

Expected: the 5 new tests FAIL ("Cannot find module './handler.js'"); the 3 compose tests still pass.

- [ ] **Step 8: Implement handler.js**

```js
export async function handleRender(deps, req) {
  const { source_url, upload_url } = req
  if (!source_url || !upload_url) {
    return { status: 400, body: { success: false, error: "missing_fields" } }
  }

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
  if (!uploaded) {
    return { status: 502, body: { success: false, error: "upload_failed" } }
  }

  return { status: 200, body: { success: true } }
}
```

Save as `services/render-worker/handler.js`.

- [ ] **Step 9: Run to verify pass**

```bash
cd services/render-worker && npm test
```

Expected: 8 tests passing (3 compose + 5 handler).

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
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: buffer,
  })
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
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf-8"))
  } catch {
    body = {}
  }

  const result = await handleRender(deps, body)
  res.writeHead(result.status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(result.body))
})

server.listen(PORT, () => {
  console.log(`render-worker listening on :${PORT}`)
})
```

Save as `services/render-worker/server.js`.

- [ ] **Step 11: Smoke-test the server**

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

### Task 3: `rank-media` Edge Function — score pool + favourite-first pick + swap suggestion

**Files:**
- Create: `supabase/functions/_shared/strip-markdown-fence.ts` (+ `.test.ts`)
- Create: `supabase/functions/_shared/select-photo.ts` (+ `.test.ts`)
- Create: `supabase/functions/rank-media/score-photo.ts`
- Create: `supabase/functions/rank-media/handler.ts` (+ `handler.test.ts`)
- Create: `supabase/functions/rank-media/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `POST /functions/v1/rank-media` with body `{trip_id: string}` (Authorization header = organizer's session JWT) → `{picked: {media_item_id, storage_path, quality_score, is_favourite}, reason: "favourite" | "top_score", swap_suggestion: {media_item_id, storage_path, quality_score} | null}` on success, or `{error}` (4xx/5xx). Task 5's Preview screen consumes this; Task 4's `generate` consumes the chosen `media_item_id`.

- [ ] **Step 1: Write the failing strip-markdown-fence tests**

```ts
import { assertEquals } from "jsr:@std/assert@1"
import { stripMarkdownFence } from "./strip-markdown-fence.ts"

Deno.test("removes a ```json fence", () => {
  assertEquals(stripMarkdownFence('```json\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("removes a bare fence with no language tag", () => {
  assertEquals(stripMarkdownFence('```\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("passes through unfenced text unchanged", () => {
  assertEquals(stripMarkdownFence('{"quality_score": 80}'), '{"quality_score": 80}')
})
```

Save as `supabase/functions/_shared/strip-markdown-fence.test.ts`.

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/strip-markdown-fence.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```ts
export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenceMatch ? fenceMatch[1] : trimmed
}
```

Save as `supabase/functions/_shared/strip-markdown-fence.ts`.

- [ ] **Step 4: Run to verify pass**

```bash
cd supabase/functions && deno test _shared/strip-markdown-fence.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Write the failing select-photo tests (this is the favourite-first + swap logic — the heart of the task)**

```ts
import { assertEquals } from "jsr:@std/assert@1"
import { selectPhoto, type ScoredMedia } from "./select-photo.ts"

const m = (id: string, score: number, fav: boolean): ScoredMedia => ({
  media_item_id: id,
  storage_path: `t1/${id}.jpg`,
  quality_score: score,
  is_favourite: fav,
})

Deno.test("returns null pick for an empty pool", () => {
  assertEquals(selectPhoto([]), null)
})

Deno.test("no favourites → picks top quality_score, reason top_score, no swap", () => {
  const result = selectPhoto([m("a", 60, false), m("b", 90, false), m("c", 75, false)])
  assertEquals(result?.picked.media_item_id, "b")
  assertEquals(result?.reason, "top_score")
  assertEquals(result?.swap_suggestion, null)
})

Deno.test("one favourite, a stronger non-favourite exists → picks favourite, suggests the stronger shot", () => {
  const result = selectPhoto([m("a", 70, true), m("b", 95, false)])
  assertEquals(result?.picked.media_item_id, "a")
  assertEquals(result?.reason, "favourite")
  assertEquals(result?.swap_suggestion?.media_item_id, "b")
})

Deno.test("favourite is already the highest score → no swap suggestion", () => {
  const result = selectPhoto([m("a", 95, true), m("b", 80, false)])
  assertEquals(result?.picked.media_item_id, "a")
  assertEquals(result?.reason, "favourite")
  assertEquals(result?.swap_suggestion, null)
})

Deno.test("multiple favourites → picks the highest-scored favourite", () => {
  const result = selectPhoto([m("a", 70, true), m("b", 88, true), m("c", 99, false)])
  assertEquals(result?.picked.media_item_id, "b")
  assertEquals(result?.reason, "favourite")
  assertEquals(result?.swap_suggestion?.media_item_id, "c")
})
```

Save as `supabase/functions/_shared/select-photo.test.ts`.

- [ ] **Step 6: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/select-photo.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement select-photo.ts**

```ts
export interface ScoredMedia {
  media_item_id: string
  storage_path: string
  quality_score: number
  is_favourite: boolean
}

export interface SelectionResult {
  picked: ScoredMedia
  reason: "favourite" | "top_score"
  swap_suggestion: ScoredMedia | null
}

// Favourite-first (organizer-scoped) selection with a pre-render swap
// suggestion. See project_scenr_generate_selection: the organizer's starred
// photo wins by default regardless of score; fall back to top quality_score;
// multiple favourites -> highest-scored favourite. When the pick is a
// favourite but a strictly-higher-scored photo exists, offer it as a swap.
export function selectPhoto(pool: ScoredMedia[]): SelectionResult | null {
  if (pool.length === 0) return null

  const topOverall = pool.reduce((a, b) => (b.quality_score > a.quality_score ? b : a))
  const favourites = pool.filter((p) => p.is_favourite)

  if (favourites.length === 0) {
    return { picked: topOverall, reason: "top_score", swap_suggestion: null }
  }

  const picked = favourites.reduce((a, b) => (b.quality_score > a.quality_score ? b : a))
  const swap_suggestion =
    topOverall.media_item_id !== picked.media_item_id && topOverall.quality_score > picked.quality_score
      ? topOverall
      : null
  return { picked, reason: "favourite", swap_suggestion }
}
```

Save as `supabase/functions/_shared/select-photo.ts`.

- [ ] **Step 8: Run to verify pass**

```bash
cd supabase/functions && deno test _shared/select-photo.test.ts
```

Expected: 6 passing.

- [ ] **Step 9: Implement score-photo.ts (no dedicated unit test — real Anthropic I/O, verified live in Step 15, matching how `scripts/theme-loader`'s `tagImage` isn't unit-tested either)**

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
  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) {
    throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 500)}`)
  }
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

Deno.test("returns 400 when trip_id is missing", async () => {
  const result = await handleRankMedia(baseDeps(), {})
  assertEquals(result.status, 400)
})

Deno.test("returns 403 when the caller does not own the trip", async () => {
  const result = await handleRankMedia(baseDeps({ verifyTripOwnership: async () => false }), { trip_id: "t1" })
  assertEquals(result.status, 403)
})

Deno.test("returns 422 when the trip has no usable media", async () => {
  const result = await handleRankMedia(baseDeps({ listTripMedia: async () => [] }), { trip_id: "t1" })
  assertEquals(result.status, 422)
  assertEquals(result.body.error, "no_media")
})

Deno.test("scores only uncached media and returns the favourite-first pick", async () => {
  const media: MediaItemRow[] = [
    { id: "m1", storage_path: "t1/a.jpg", quality_score: 95, content_category: "food", is_favourite: false },
    { id: "m2", storage_path: "t1/b.jpg", quality_score: null, content_category: null, is_favourite: true },
  ]
  let scoreCalls = 0
  const result = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      scoreMedia: async () => {
        scoreCalls++
        return { quality_score: 70, content_category: "group" }
      },
    }),
    { trip_id: "t1" },
  )
  assertEquals(scoreCalls, 1) // only m2 was uncached
  assertEquals(result.status, 200)
  assertEquals(result.body.picked.media_item_id, "m2") // favourite wins despite lower score
  assertEquals(result.body.reason, "favourite")
  assertEquals(result.body.swap_suggestion.media_item_id, "m1") // stronger non-favourite
})

Deno.test("returns 422 when every media item fails scoring", async () => {
  const media: MediaItemRow[] = [
    { id: "m1", storage_path: "t1/a.jpg", quality_score: null, content_category: null, is_favourite: false },
  ]
  const result = await handleRankMedia(
    baseDeps({
      listTripMedia: async () => media,
      scoreMedia: async () => { throw new Error("api down") },
    }),
    { trip_id: "t1" },
  )
  assertEquals(result.status, 422)
})
```

Save as `supabase/functions/rank-media/handler.test.ts`.

- [ ] **Step 11: Run to verify failure**

```bash
cd supabase/functions && deno test rank-media/handler.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 12: Implement handler.ts**

```ts
import { selectPhoto, type ScoredMedia } from "../_shared/select-photo.ts"

const CONTENT_CATEGORIES = ["solo_portrait", "group", "scenery", "food", "action_fit", "candid_funny"]

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
}

export interface RankMediaResult {
  status: number
  // deno-lint-ignore no-explicit-any
  body: any
}

export async function handleRankMedia(deps: RankMediaDeps, req: RankMediaRequest): Promise<RankMediaResult> {
  const { trip_id } = req
  if (!trip_id) return { status: 400, body: { error: "missing_trip_id" } }

  if (!(await deps.verifyTripOwnership(trip_id))) {
    return { status: 403, body: { error: "not_trip_owner" } }
  }

  const media = await deps.listTripMedia(trip_id)
  if (media.length === 0) return { status: 422, body: { error: "no_media" } }

  const scored: ScoredMedia[] = []
  for (const item of media) {
    let quality = item.quality_score
    let category = item.content_category
    if (quality == null || category == null) {
      const url = await deps.createSignedUrl(item.storage_path)
      if (!url) continue
      try {
        const result = await deps.scoreMedia(url)
        if (!CONTENT_CATEGORIES.includes(result.content_category)) continue
        quality = result.quality_score
        category = result.content_category
        await deps.updateMediaScore(item.id, quality, category)
      } catch {
        continue
      }
    }
    scored.push({
      media_item_id: item.id,
      storage_path: item.storage_path,
      quality_score: quality as number,
      is_favourite: item.is_favourite,
    })
  }

  const selection = selectPhoto(scored)
  if (!selection) return { status: 422, body: { error: "no_media" } }

  return { status: 200, body: selection }
}
```

Save as `supabase/functions/rank-media/handler.ts`.

- [ ] **Step 13: Run to verify pass**

```bash
cd supabase/functions && deno test rank-media/handler.test.ts
```

Expected: 5 passing.

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

Save as `supabase/functions/rank-media/index.ts`.

Note: `listTripMedia` filters `type = "photo"` — Day 4 features a single photo, and scoring a video's `storage_path` as an image would fail. Videos are out of the Post selection pool.

- [ ] **Step 15: Deploy + verify live**

Deploy via Supabase MCP `deploy_edge_function` for `rank-media`, following `supabase/functions/README.md`'s bundling convention (nest `_shared/{supabase-client,cors,strip-markdown-fence,select-photo}.ts` under `_shared/` in the `files` array and rewrite `../_shared/...` → `./_shared/...` in the deployed content only).

Confirm a trip with real photos exists (Supabase MCP `execute_sql`: `select trip_id, count(*) from media_items where type='photo' group by trip_id;` — the `checkpoint-verify-trip-bnb5` trip from Days 1-3 has real photos). Get the organizer's access token (sign in via the local mobile app and capture the session JWT). Then:

```bash
curl -s -X POST https://alawnboscurigspqinlx.supabase.co/functions/v1/rank-media \
  -H "Content-Type: application/json" -H "Authorization: Bearer <organizer JWT>" \
  -H "apikey: <anon key from .env>" \
  -d '{"trip_id":"<real trip id>"}'
```

Expected: a JSON body with `picked.media_item_id`, `reason`, and `swap_suggestion`. Confirm caching worked: re-run `select id, quality_score, content_category from media_items where trip_id='<id>';` via `execute_sql` — scores are now populated. A second curl should return near-instantly (all cached). If `scorePhoto` hits a robots.txt error, apply the base64 fix from Global Constraints.

- [ ] **Step 16: Full functions test suite + commit**

```bash
cd supabase/functions && deno test
```

Expected: all functions' tests pass. Then:

```bash
git add supabase/functions/_shared/strip-markdown-fence.ts supabase/functions/_shared/strip-markdown-fence.test.ts supabase/functions/_shared/select-photo.ts supabase/functions/_shared/select-photo.test.ts supabase/functions/rank-media/
git commit -m "feat: add rank-media edge function (score + favourite-first pick + swap suggestion)"
```

---

### Task 4: `generate` Edge Function — render a chosen photo

**Files:**
- Create: `supabase/functions/generate/{handler.ts,handler.test.ts,index.ts}`

**Interfaces:**
- Consumes: the chosen `media_item_id` (from Task 3's `rank-media` output, via the client); render-worker's `POST /render` contract (Task 2).
- Produces: `POST /functions/v1/generate` with body `{trip_id: string, type: "post", theme_id?: string, media_item_id: string}` (Authorization = organizer JWT) → `{generation_id}` immediately; background render flips the `generations` row to `complete` (with `output_url = <trip_id>/<generation_id>.jpg`, `selection = [{media_item_id}]`) or `failed`. Tasks 5/6 consume `generation_id` and the row's `status`/`output_url`.

- [ ] **Step 1: Write the failing handler tests**

```ts
import { assertEquals } from "jsr:@std/assert@1"
import { handleGenerate, processGeneration, type GenerateDeps } from "./handler.ts"

function baseDeps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return {
    verifyMediaBelongsToTrip: async () => true,
    createGeneration: async () => ({ id: "gen1" }),
    updateGeneration: async () => {},
    getMediaStoragePath: async () => "t1/a.jpg",
    createSignedUrl: async () => "https://x/get",
    createSignedUploadUrl: async () => "https://x/put",
    renderPost: async () => true,
    waitUntil: () => {},
    ...overrides,
  }
}

Deno.test("returns 400 for an unsupported type", async () => {
  const r = await handleGenerate(baseDeps(), { trip_id: "t1", type: "carousel", media_item_id: "m1" })
  assertEquals(r.status, 400)
})

Deno.test("returns 400 when media_item_id is missing", async () => {
  const r = await handleGenerate(baseDeps(), { trip_id: "t1", type: "post" })
  assertEquals(r.status, 400)
})

Deno.test("returns 403 when the media does not belong to a trip the caller owns", async () => {
  const r = await handleGenerate(baseDeps({ verifyMediaBelongsToTrip: async () => false }), {
    trip_id: "t1", type: "post", media_item_id: "m1",
  })
  assertEquals(r.status, 403)
})

Deno.test("returns 500 when generation creation fails", async () => {
  const r = await handleGenerate(baseDeps({ createGeneration: async () => null }), {
    trip_id: "t1", type: "post", media_item_id: "m1",
  })
  assertEquals(r.status, 500)
})

Deno.test("returns 200 with generation id and schedules background work", async () => {
  let scheduled: Promise<void> | null = null
  const r = await handleGenerate(baseDeps({ waitUntil: (p) => { scheduled = p } }), {
    trip_id: "t1", type: "post", media_item_id: "m1",
  })
  assertEquals(r.status, 200)
  assertEquals(r.body, { generation_id: "gen1" })
  assertEquals(scheduled !== null, true)
})

Deno.test("processGeneration renders and completes the generation", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({ updateGeneration: async (_id, patch) => { updates.push(patch) } })
  await processGeneration(deps, "gen1", "t1", "m1")
  assertEquals(updates[0], { status: "processing" })
  const final = updates[updates.length - 1]
  assertEquals(final.status, "complete")
  assertEquals(final.output_url, "t1/gen1.jpg")
  assertEquals(final.selection, [{ media_item_id: "m1" }])
})

Deno.test("processGeneration fails when the media has no storage path", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    getMediaStoragePath: async () => null,
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", "m1")
  assertEquals(updates[updates.length - 1].status, "failed")
})

Deno.test("processGeneration fails when render-worker reports failure", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    renderPost: async () => false,
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", "m1")
  assertEquals(updates[updates.length - 1].status, "failed")
})

Deno.test("processGeneration fails gracefully on an unexpected exception", async () => {
  const updates: Record<string, unknown>[] = []
  const deps = baseDeps({
    getMediaStoragePath: async () => { throw new Error("db down") },
    updateGeneration: async (_id, patch) => { updates.push(patch) },
  })
  await processGeneration(deps, "gen1", "t1", "m1")
  assertEquals(updates[updates.length - 1].status, "failed")
})
```

Save as `supabase/functions/generate/handler.test.ts`.

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test generate/handler.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement handler.ts**

```ts
export interface GenerateDeps {
  verifyMediaBelongsToTrip(mediaItemId: string, tripId: string): Promise<boolean>
  createGeneration(tripId: string, themeId: string | null): Promise<{ id: string } | null>
  updateGeneration(id: string, patch: Record<string, unknown>): Promise<void>
  getMediaStoragePath(mediaItemId: string): Promise<string | null>
  createSignedUrl(path: string): Promise<string | null>
  createSignedUploadUrl(path: string): Promise<string | null>
  renderPost(sourceUrl: string, uploadUrl: string): Promise<boolean>
  waitUntil(promise: Promise<void>): void
}

export interface GenerateRequest {
  trip_id?: string
  type?: string
  theme_id?: string
  media_item_id?: string
}

export interface GenerateResult {
  status: number
  body: Record<string, unknown>
}

export async function handleGenerate(deps: GenerateDeps, req: GenerateRequest): Promise<GenerateResult> {
  const { trip_id, type, theme_id, media_item_id } = req
  if (!trip_id || type !== "post" || !media_item_id) {
    return { status: 400, body: { error: "invalid_request" } }
  }

  // verifyMediaBelongsToTrip runs against the caller's own RLS-scoped client, so
  // this both confirms the media is in this trip AND that the caller owns the trip.
  if (!(await deps.verifyMediaBelongsToTrip(media_item_id, trip_id))) {
    return { status: 403, body: { error: "not_trip_owner" } }
  }

  const generation = await deps.createGeneration(trip_id, theme_id ?? null)
  if (!generation) return { status: 500, body: { error: "generation_create_failed" } }

  deps.waitUntil(processGeneration(deps, generation.id, trip_id, media_item_id))
  return { status: 200, body: { generation_id: generation.id } }
}

export async function processGeneration(
  deps: GenerateDeps,
  generationId: string,
  tripId: string,
  mediaItemId: string,
): Promise<void> {
  try {
    await deps.updateGeneration(generationId, { status: "processing" })

    const storagePath = await deps.getMediaStoragePath(mediaItemId)
    if (!storagePath) {
      await deps.updateGeneration(generationId, { status: "failed" })
      return
    }

    const sourceUrl = await deps.createSignedUrl(storagePath)
    const outputPath = `${tripId}/${generationId}.jpg`
    const uploadUrl = await deps.createSignedUploadUrl(outputPath)
    if (!sourceUrl || !uploadUrl) {
      await deps.updateGeneration(generationId, { status: "failed" })
      return
    }

    const rendered = await deps.renderPost(sourceUrl, uploadUrl)
    if (!rendered) {
      await deps.updateGeneration(generationId, { status: "failed" })
      return
    }

    await deps.updateGeneration(generationId, {
      status: "complete",
      output_url: outputPath,
      selection: [{ media_item_id: mediaItemId }],
      completed_at: new Date().toISOString(),
    })
  } catch {
    await deps.updateGeneration(generationId, { status: "failed" })
  }
}
```

Save as `supabase/functions/generate/handler.ts`.

- [ ] **Step 4: Run to verify pass**

```bash
cd supabase/functions && deno test generate/handler.test.ts
```

Expected: 9 passing.

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
    async verifyMediaBelongsToTrip(mediaItemId, tripId) {
      // RLS on media_items already scopes SELECT to trips the caller owns, so a
      // hit here means both "exists in this trip" and "caller owns the trip".
      const { data } = await userClient
        .from("media_items")
        .select("id")
        .eq("id", mediaItemId)
        .eq("trip_id", tripId)
        .maybeSingle()
      return !!data
    },
    async createGeneration(tripId, themeId) {
      const { data } = await supabase
        .from("generations")
        .insert({ trip_id: tripId, type: "post", theme_id: themeId })
        .select("id")
        .single()
      return data ?? null
    },
    async updateGeneration(id, patch) {
      await supabase.from("generations").update(patch).eq("id", id)
    },
    async getMediaStoragePath(mediaItemId) {
      const { data } = await supabase
        .from("media_items")
        .select("storage_path")
        .eq("id", mediaItemId)
        .maybeSingle()
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
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<void>): void } })
        .EdgeRuntime
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

- [ ] **Step 6: Full functions test suite**

```bash
cd supabase/functions && deno test
```

Expected: all pass.

- [ ] **Step 7: Deploy `generate`** via Supabase MCP `deploy_edge_function` (same `_shared` bundling convention; `generate` needs `_shared/{supabase-client,cors}.ts`). Set `RENDER_WORKER_URL` later once render-worker is hosted; unset in production for now (renders will fail at the render step in prod until then — acceptable, verified locally below).

- [ ] **Step 8: Verify end-to-end locally**

In three terminals: (1) `cd services/render-worker && node server.js`; (2) `cd supabase && RENDER_WORKER_URL=http://localhost:8787 npx supabase functions serve --env-file ../.env`; (3) run the flow. First call `rank-media` (from Task 3 Step 15) against a real trip to get a `picked.media_item_id`, then:

```bash
curl -s -X POST http://localhost:54321/functions/v1/generate \
  -H "Content-Type: application/json" -H "Authorization: Bearer <organizer JWT>" \
  -H "apikey: <anon key>" \
  -d '{"trip_id":"<real trip id>","type":"post","media_item_id":"<picked id>","theme_id":"golden_hour"}'
```

Expected: `{"generation_id":"..."}`. Poll via `execute_sql`: `select status, output_url, selection from generations where id='<gen id>';` → `complete`, `output_url = <trip>/<gen>.jpg`. Confirm the file: `select name, metadata->>'size' as size from storage.objects where name='<trip>/<gen>.jpg';`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/generate/
git commit -m "feat: add generate edge function (render a chosen photo)"
```

---

### Task 5: Mobile — Generate Setup + Preview/Swap screen

**Files:**
- Create: `apps/mobile/src/app/generate/[tripId].tsx`
- Modify: `apps/mobile/src/app/pool/[tripId].tsx`

**Interfaces:**
- Consumes: `theme_fingerprints` (`theme_id`, `display_name`); `rank-media` (Task 3) → pick + swap; `generate` (Task 4) → `{generation_id}`.
- Produces: navigates to `/generating/[generationId]` (Task 6).

- [ ] **Step 1: Create the Generate Setup + Preview/Swap screen**

This screen has two phases in one file: **setup** (choose theme, tap "Find my best shot" → calls `rank-media`) and **preview** (show the picked photo, optional swap toggle, tap "Generate Post ✦" → calls `generate`).

```tsx
import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

interface ThemeOption {
  theme_id: string
  display_name: string
}
interface Candidate {
  media_item_id: string
  storage_path: string
  quality_score: number
}
interface RankResult {
  picked: Candidate & { is_favourite: boolean }
  reason: "favourite" | "top_score"
  swap_suggestion: Candidate | null
}

const DISABLED_TYPES = ["Reel", "Carousel", "Story"]

export default function GenerateScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const router = useRouter()
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [rank, setRank] = useState<RankResult | null>(null)
  const [useSwap, setUseSwap] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase
      .from("theme_fingerprints")
      .select("theme_id, display_name")
      .order("theme_id")
      .then(({ data }) => {
        if (mounted && data) setThemes(data as ThemeOption[])
      })
    return () => {
      mounted = false
    }
  }, [])

  const activeCandidate: Candidate | null =
    rank == null ? null : useSwap && rank.swap_suggestion ? rank.swap_suggestion : rank.picked

  useEffect(() => {
    let mounted = true
    if (!activeCandidate) {
      setPreviewUrl(null)
      return
    }
    supabase.storage
      .from("trip-media")
      .createSignedUrl(activeCandidate.storage_path, 3600)
      .then(({ data }) => {
        if (mounted && data?.signedUrl) setPreviewUrl(data.signedUrl)
      })
    return () => {
      mounted = false
    }
  }, [activeCandidate])

  async function handleFindBestShot() {
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<RankResult>("rank-media", {
      body: { trip_id: tripId },
    })
    setBusy(false)
    if (error || !data) {
      setErrorMessage(error?.message ?? "Couldn't find a photo to feature.")
      return
    }
    setRank(data)
  }

  async function handleGenerate() {
    if (!activeCandidate) return
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<{ generation_id: string }>("generate", {
      body: {
        trip_id: tripId,
        type: "post",
        theme_id: selectedThemeId,
        media_item_id: activeCandidate.media_item_id,
      },
    })
    if (error || !data) {
      setErrorMessage(error?.message ?? "Could not start generation.")
      setBusy(false)
      return
    }
    router.replace(`/generating/${data.generation_id}`)
  }

  // Preview phase
  if (rank) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your best shot</Text>
        {previewUrl ? (
          <Image source={{ uri: previewUrl }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewPlaceholder]}>
            <ActivityIndicator />
          </View>
        )}
        <Text style={styles.reason}>
          {rank.reason === "favourite" ? "★ Your favourite" : "Top-rated shot"}
        </Text>
        {rank.swap_suggestion ? (
          <Pressable style={styles.swapButton} onPress={() => setUseSwap((v) => !v)}>
            <Text style={styles.swapButtonText}>
              {useSwap ? "↩ Back to your favourite" : "Swap to a stronger shot"}
            </Text>
          </Pressable>
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={handleGenerate} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Generate Post ✦</Text>}
        </Pressable>
      </View>
    )
  }

  // Setup phase
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create something</Text>

      <Text style={styles.sectionLabel}>Type</Text>
      <View style={styles.row}>
        <View style={[styles.chip, styles.chipActive]}>
          <Text style={styles.chipTextActive}>Post</Text>
        </View>
        {DISABLED_TYPES.map((t) => (
          <View key={t} style={[styles.chip, styles.chipDisabled]}>
            <Text style={styles.chipTextDisabled}>{t}</Text>
            <Text style={styles.soon}>Soon</Text>
          </View>
        ))}
      </View>

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

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleFindBestShot} disabled={busy}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Find my best shot →</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  sectionLabel: { fontSize: 12, color: "#8892A6", fontWeight: "700", textTransform: "uppercase", marginTop: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: "#C3D0E8", flexDirection: "row", alignItems: "center", gap: 6,
  },
  chipActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: "#1D4ED8", fontWeight: "600" },
  chipTextActive: { color: "white", fontWeight: "700" },
  chipTextDisabled: { color: "#51596A" },
  soon: { fontSize: 9, color: "#51596A", fontWeight: "700" },
  preview: { width: "100%", aspectRatio: 1, borderRadius: 12, marginTop: 8 },
  previewPlaceholder: { backgroundColor: "#EEF2FB", alignItems: "center", justifyContent: "center" },
  reason: { fontSize: 14, color: "#51596A", fontWeight: "600", marginTop: 4 },
  swapButton: {
    borderWidth: 1, borderColor: "#1D4ED8", paddingVertical: 12,
    paddingHorizontal: 20, borderRadius: 999, alignSelf: "flex-start", marginTop: 4,
  },
  swapButtonText: { color: "#1D4ED8", fontWeight: "700" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 16, borderRadius: 999, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
```

Save as `apps/mobile/src/app/generate/[tripId].tsx`.

- [ ] **Step 2: Wire the Pool screen's "Generate ✦" CTA**

In `apps/mobile/src/app/pool/[tripId].tsx`:

Change the import:
```tsx
import { useLocalSearchParams, useRouter } from "expo-router"
```
Add after `const { tripId } = useLocalSearchParams<{ tripId: string }>()`:
```tsx
const router = useRouter()
```
Just before the final `</View>` closing `styles.container`, add:
```tsx
{items.length > 0 ? (
  <Pressable style={styles.generateButton} onPress={() => router.push(`/generate/${tripId}`)}>
    <Text style={styles.generateButtonText}>Generate ✦</Text>
  </Pressable>
) : null}
```
Add to `styles`:
```tsx
generateButton: {
  position: "absolute", bottom: 24, alignSelf: "center",
  backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999,
},
generateButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
```

- [ ] **Step 3: Manual verification (Browser pane)**

Start `mobile-web` (`preview_start` name `mobile-web`), open a trip's pool with ≥1 photo, confirm "Generate ✦" appears, tap it → Generate Setup shows the 5 real theme chips + Post-only. Pick a theme, tap "Find my best shot" (needs `rank-media` deployed live from Task 3, or functions served locally). Confirm the Preview shows a real photo + the correct reason label, and the swap toggle appears only when `rank-media` returned a suggestion.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/generate/ "apps/mobile/src/app/pool/[tripId].tsx"
git commit -m "feat: add Generate Setup + Preview/Swap screen and the pool Generate CTA"
```

---

### Task 6: Mobile — Generating and Reveal Post screens (bleeds into Day 5)

**Files:**
- Create: `apps/mobile/src/app/generating/[generationId].tsx`
- Create: `apps/mobile/src/app/reveal/[generationId].tsx`

**Interfaces:**
- Consumes: `generations` row (`id`, `trip_id`, `status`, `output_url`) via Realtime (Task 1) + direct `select`, mirroring `pool/[tripId].tsx`'s subscription; `renders` bucket signed URL.
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
    supabase
      .from("generations")
      .select("status")
      .eq("id", generationId)
      .single()
      .then(({ data }) => {
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

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
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
      <Text style={styles.title}>Creating your post…</Text>
      <Text style={styles.subtitle}>Styling your best shot.</Text>
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

- [ ] **Step 2: Create the Reveal Post screen**

```tsx
import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

export default function RevealPostScreen() {
  const { generationId } = useLocalSearchParams<{ generationId: string }>()
  const router = useRouter()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [tripId, setTripId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data, error } = await supabase
        .from("generations")
        .select("trip_id, output_url")
        .eq("id", generationId)
        .single()
      if (!mounted) return
      if (error || !data?.output_url) {
        setErrorMessage(error?.message ?? "This post isn't ready.")
        return
      }
      setTripId(data.trip_id)
      const { data: signed } = await supabase.storage.from("renders").createSignedUrl(data.output_url, 3600)
      if (mounted && signed?.signedUrl) setImageUrl(signed.signedUrl)
    }
    load()
    return () => {
      mounted = false
    }
  }, [generationId])

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    )
  }
  if (!imageUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <View style={styles.container}>
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <Text style={styles.label}>Your Post</Text>
      <Text style={styles.sublabel}>1:1</Text>
      <Pressable style={styles.secondaryButton} onPress={() => tripId && router.replace(`/pool/${tripId}`)}>
        <Text style={styles.secondaryButtonText}>Back to pool</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", padding: 24, gap: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", aspectRatio: 1, borderRadius: 12, marginTop: 24 },
  label: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  sublabel: { fontSize: 13, color: "#51596A" },
  secondaryButton: {
    borderWidth: 1, borderColor: "#1D4ED8", paddingVertical: 14,
    paddingHorizontal: 32, borderRadius: 999, marginTop: 24,
  },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
```

Save as `apps/mobile/src/app/reveal/[generationId].tsx`.

- [ ] **Step 3: Manual verification (Browser pane) — the full checkpoint**

With render-worker + `npx supabase functions serve` running locally and `mobile-web` up: from a trip pool, tap Generate ✦ → pick a theme → "Find my best shot" → Preview shows the pick (try the swap if offered) → "Generate Post ✦" → Generating spinner → auto-navigates to Reveal within a few seconds showing the **real rendered square photo, no watermark** → "Back to pool" returns to the pool. Screenshot the Reveal as proof.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/generating/ apps/mobile/src/app/reveal/
git commit -m "feat: add Generating and Reveal Post screens"
```

---

## Day 4 Checkpoint

Full walking skeleton per `docs/plan.md`'s Days 4-6 milestone (Post only): create trip → invite → appless upload → live pool → **pick best shot (favourite-first, swap-before-render) → real rendered Post on Reveal**. Verified end-to-end in the Browser pane with a real trip and a real Claude Haiku scoring pass over real photos — no mocks, no watermark.

**Deferred gaps to flag to the user once the plan is done:**
- **render-worker has no real host yet** (Fly.io/Render.com) — the deployed `generate`'s `RENDER_WORKER_URL` points nowhere until that's set up (an account-level action, like the prior Apify/Voyage steps). Everything else (rank-media, scoring, selection, the mobile flow) is fully live.
- **Per-user favourite precedence** (each registered user's own favourite wins when they generate) is post-MVP, tied to inviting other registered users to a trip (memory `project_scenr_generate_selection`).
- **Free-tier limits** (generation/theme/trip caps — the actual monetization model now that the watermark is gone) are master-plan Days 10-12, not built here.
