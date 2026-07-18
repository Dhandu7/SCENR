# Day 5: Theme Composition Engine + Theme-Fit + Color Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make theme choice genuinely change the output on three axes: (1) the photo **category mix** per the theme's `composition_template`, (2) *which* photo fills each category slot, chosen by **theme-fit** (how visually close the photo is to the theme's Pinterest exemplars, via embedding cosine similarity), and (3) a distinct **color grade** per theme in the render.

**Architecture:** Three seams. (1) **Embeddings** — a new `media_items.embedding vector(1024)` column caches each trip photo's Voyage multimodal embedding; `rank-media` computes it once per photo (alongside the existing Haiku quality/category pass). (2) **Selection** — `rank-media` loads the theme's `composition_template` + `centroid_vec`, computes each photo's theme-fit = cosine(photo embedding, theme centroid), allocates the non-reserved slots across categories per the template, and fills each category slot by a combined theme-fit + quality score. (3) **Grade** — a curated per-theme numeric grade lives in `generate`, sent to the generic, credential-free render-worker, which applies it via `sharp`. Everything degrades gracefully: no `theme_id`/fingerprint → Day 4 naive quality selection; embedding failure on a photo → that photo just has no theme-fit boost; unknown theme → no grade.

**Why embeddings (the purpose, in one paragraph):** A theme like "Coastal" isn't just a category mix — it's a *look* (turquoise water, warm sand, soft light). The theme-loader already distilled each theme's ~80 Pinterest exemplars into a single 1024-dimension `centroid_vec` — a point in "visual meaning" space. If we embed each trip photo into the *same* space (same Voyage model), the cosine similarity between a photo's vector and the theme's centroid is a direct, numeric "how on-theme does this photo look" score. That lets us pick, within each category slot, the trip photo that best matches the theme's aesthetic — not just the technically-sharpest one. Without embeddings, Coastal and Neon Nights (both scenery-heavy) would pick the *same* scenery photos; with them, Coastal pulls the bright beachy shots and Neon Nights the moody night ones.

**Tech Stack:** Deno (Supabase Edge Functions), pgvector, Voyage AI `voyage-multimodal-3`, plain Node + `sharp` (render-worker), Expo/React Native (mobile).

## Global Constraints

- **Bounded-hybrid reservation is preserved** (`project_scenr_generate_selection`): reserve up to `FAVOURITE_RESERVE_CAP = 2` top-scored favourites *regardless of category* first; the composition template governs only the *remaining* N−K slots. Within a category slot, rank by the combined theme-fit+quality score, favourite breaking an exact tie.
- **Category allocation comes from `composition_template`**; **within-category pick comes from theme-fit + quality**. `composition_template` shape: `{ [content_category]: fraction }`, fractions ~sum to 1, absent categories omitted. The 6 categories: `solo_portrait, group, scenery, food, action_fit, candid_funny`.
- **Theme-fit weighting:** `combinedScore = 0.7 * clamp01(themeFit) + 0.3 * clamp01(quality/100)` — theme-fit dominates (pick the most on-theme photo), quality supports. A photo with no embedding gets `themeFit = 0` (neutral), so it ranks below embedded photos but still by its quality.
- **Graceful degradation everywhere:** `theme_id` optional on `rank-media`; absent theme_id / no fingerprint / no `composition_template` / zero category overlap → fall back to naive `selectSlides` (quality only). A photo whose Voyage embedding fails is still usable (theme-fit 0), not dropped. Missing `centroid_vec` → theme-fit is null for all (composition still works on category mix + quality). Unknown/absent theme grade → render with no grade. **Never 500 on a missing theme or a failed embedding.**
- **No watermark** (unchanged). **`theme_fit_scores` jsonb stays unused** (theme-fit is computed live, not persisted there this day).
- **Embeddings use Voyage `voyage-multimodal-3`** (1024-dim), image passed by URL (Voyage's URL fetch is unaffected by robots.txt — proven in the theme-loader). Concurrency-capped like scoring. Requires `VOYAGE_API_KEY`; as an edge secret it's user-set (deferred to `/run`, like `ANTHROPIC_API_KEY`).
- **Render-worker stays a generic, stateless, credential-free compositor** — receives numeric grade params, knows nothing about theme names.
- Test stacks: Deno `Deno.test` + `jsr:@std/assert@1` (`cd supabase/functions && deno test`); Node `node:test` + `node:assert/strict` (`cd services/render-worker && npm test`). Pure-JSX mobile screens get no Jest test.
- Deploy edge functions via Supabase MCP `deploy_edge_function` (project_id `alawnboscurigspqinlx`), bundling `_shared` per `supabase/functions/README.md` (rewrite `../_shared/…`→`./_shared/…` in deployed content only). Live scoring/embedding/e2e that needs an organizer JWT + the `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` edge secrets is deferred to `/run`.
- Never enter/print secrets; reference `.env` values via env vars only.

---

## File Structure

- `supabase/migrations/0006_media_embedding.sql` — **create**: add `media_items.embedding vector(1024)`.
- `supabase/functions/_shared/cosine.ts` (+ `.test.ts`) — **create**: `parseVector`, `cosineSimilarity`, `combinedScore`.
- `supabase/functions/_shared/select-slides.ts` (+ `.test.ts`) — **modify**: `ScoredMedia` gains `theme_fit`; add `allocateSlots` + `selectSlidesByComposition` (theme-fit-aware). Keep `selectSlides`.
- `supabase/functions/rank-media/embed-photo.ts` — **create**: Voyage embedding.
- `supabase/functions/rank-media/handler.ts` (+ `.test.ts`) — **modify**: `theme_id`, embed+cache, theme-fit, composition select.
- `supabase/functions/rank-media/index.ts` — **modify**: wire embedding, centroid, template deps.
- `services/render-worker/compose.js`, `compose.test.js`, `handler.js`, `handler.test.js` — **modify**: optional grade.
- `supabase/functions/_shared/theme-grades.ts` (+ `.test.ts`) — **create**: per-theme grade map.
- `supabase/functions/generate/handler.ts` (+ `.test.ts`), `index.ts` — **modify**: thread grade.
- `apps/mobile/src/app/generate/[tripId].tsx` — **modify**: send `theme_id` to `rank-media`.

---

### Task 1: Add the `embedding` column to `media_items`

**Files:**
- Create: `supabase/migrations/0006_media_embedding.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `media_items.embedding vector(1024)` (nullable) — `rank-media` reads/writes it. pgvector is already enabled (`0001_init.sql`).

- [ ] **Step 1: Write the migration**

```sql
-- Caches each trip photo's Voyage multimodal embedding (same 1024-dim space as
-- theme_fingerprints.centroid_vec) so rank-media can score theme-fit = cosine
-- similarity(photo, theme centroid) without re-embedding on every generation.
alter table media_items add column embedding vector (1024);
```

Save as `supabase/migrations/0006_media_embedding.sql`.

- [ ] **Step 2: Apply it** — Supabase MCP `apply_migration`: `project_id: alawnboscurigspqinlx`, `name: media_embedding`, `query:` the SQL above.

- [ ] **Step 3: Verify** — Supabase MCP `execute_sql` against `alawnboscurigspqinlx`:

```sql
select column_name, data_type, udt_name from information_schema.columns
where table_name = 'media_items' and column_name = 'embedding';
```

Expected: one row, `udt_name = vector`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_media_embedding.sql
git commit -m "feat: add embedding vector column to media_items for theme-fit"
```

---

### Task 2: Cosine / theme-fit math helpers (`_shared/cosine.ts`)

**Files:**
- Create: `supabase/functions/_shared/cosine.ts`
- Create: `supabase/functions/_shared/cosine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseVector(value: unknown): number[] | null` — normalizes a pgvector value (PostgREST returns it as the string `"[1,2,…]"`, or it may already be an array) to `number[]`.
  - `cosineSimilarity(a: number[], b: number[]): number` — cosine similarity; `0` for length mismatch or a zero vector.
  - `combinedScore(themeFit: number, quality: number): number` — `0.7*clamp01(themeFit) + 0.3*clamp01(quality/100)`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/cosine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/cosine.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `cosine.ts`**

```ts
// A pgvector column comes back from PostgREST as the string "[0.1,0.2,…]" (and may
// already be a number[] when we just computed it). Normalize both to number[].
export function parseVector(value: unknown): number[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value as number[]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as number[]) : null
    } catch {
      return null
    }
  }
  return null
}

// Cosine similarity of two equal-length vectors. Returns 0 for a length mismatch or
// a zero-norm vector (both meaningless rather than on-theme).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

// Rank a photo within a category slot: theme-fit (how close its look is to the
// theme's Pinterest centroid, ~[0,1]) dominates at 0.7; quality (0-100) supports at
// 0.3. A photo with no embedding passes themeFit = 0 and is ranked purely on quality,
// below any on-theme photo.
export function combinedScore(themeFit: number, quality: number): number {
  return 0.7 * clamp01(themeFit) + 0.3 * clamp01(quality / 100)
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd supabase/functions && deno test _shared/cosine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cosine.ts supabase/functions/_shared/cosine.test.ts
git commit -m "feat: add cosine/theme-fit math helpers"
```

---

### Task 3: Composition + theme-fit selection (`_shared/select-slides.ts`)

**Files:**
- Modify: `supabase/functions/_shared/select-slides.ts`
- Modify: `supabase/functions/_shared/select-slides.test.ts`

**Interfaces:**
- Consumes: `combinedScore` (Task 2).
- Produces: `ScoredMedia` gains `theme_fit: number | null`; `allocateSlots(template, categoryCounts, count): Record<string,number>`; `selectSlidesByComposition(pool, slideCount, template): SlideSelection`. `selectSlides` (naive) unchanged in signature.

- [ ] **Step 1: Add `theme_fit` to `ScoredMedia`**

In `supabase/functions/_shared/select-slides.ts`:

```ts
export interface ScoredMedia {
  media_item_id: string
  storage_path: string
  quality_score: number
  is_favourite: boolean
  content_category: string
  theme_fit: number | null
}
```

- [ ] **Step 2: Write failing tests for `allocateSlots`**

Append to `supabase/functions/_shared/select-slides.test.ts` (also add `import { allocateSlots, selectSlidesByComposition } from "./select-slides.ts"` and `import { combinedScore } from "./cosine.ts"` at the top):

```ts
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
```

- [ ] **Step 3: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/select-slides.test.ts
```

Expected: FAIL — `allocateSlots` not exported.

- [ ] **Step 4: Implement `allocateSlots`**

Add to `supabase/functions/_shared/select-slides.ts`:

```ts
// Distribute `count` slots across categories proportional to `template`, restricted
// to categories present in the pool (`categoryCounts`) with their weights renormalized,
// never exceeding a category's available photos. Overflow from a capped category
// redistributes to categories that still have room. Largest-remainder rounding.
// Returns {} when the template and pool share no category (caller then falls back).
export function allocateSlots(
  template: Record<string, number>,
  categoryCounts: Record<string, number>,
  count: number,
): Record<string, number> {
  const present = Object.keys(template).filter((c) => (categoryCounts[c] ?? 0) > 0)
  const totalCapacity = present.reduce((sum, c) => sum + categoryCounts[c], 0)
  const target = Math.min(count, totalCapacity)
  if (present.length === 0 || target === 0) return {}

  const alloc: Record<string, number> = {}
  for (const c of present) alloc[c] = 0
  let remaining = target
  let eligible = [...present]

  while (remaining > 0 && eligible.length > 0) {
    const weightSum = eligible.reduce((s, c) => s + template[c], 0)
    const ideal = eligible.map((c) => ({ c, want: (template[c] / weightSum) * remaining }))
    let handed = 0
    for (const { c, want } of ideal) {
      const add = Math.min(Math.floor(want), categoryCounts[c] - alloc[c])
      alloc[c] += add
      handed += add
    }
    let leftover = remaining - handed
    const byFraction = ideal
      .map(({ c, want }) => ({ c, frac: want - Math.floor(want) }))
      .sort((a, b) => b.frac - a.frac)
    let progressed = true
    while (leftover > 0 && progressed) {
      progressed = false
      for (const { c } of byFraction) {
        if (leftover === 0) break
        if (alloc[c] < categoryCounts[c]) {
          alloc[c] += 1
          leftover -= 1
          progressed = true
        }
      }
    }
    remaining = leftover
    eligible = eligible.filter((c) => alloc[c] < categoryCounts[c])
    if (!progressed && remaining > 0 && eligible.length === 0) break
  }

  for (const c of Object.keys(alloc)) if (alloc[c] === 0) delete alloc[c]
  return alloc
}
```

- [ ] **Step 5: Run to verify the `allocateSlots` tests pass**

```bash
cd supabase/functions && deno test _shared/select-slides.test.ts
```

Expected: the 5 `allocateSlots` tests PASS (the `selectSlidesByComposition` import still fails — implement next).

- [ ] **Step 6: Write failing tests for `selectSlidesByComposition`**

Append to `supabase/functions/_shared/select-slides.test.ts`:

```ts
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
```

Also update the pre-existing naive `selectSlides` tests' `m(...)` factory in this file to include `content_category: "scenery", theme_fit: null` so `ScoredMedia` type-checks (mechanical; values irrelevant to those tests).

- [ ] **Step 7: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/select-slides.test.ts
```

Expected: `selectSlidesByComposition` tests FAIL (not exported).

- [ ] **Step 8: Implement `selectSlidesByComposition`**

Add to `supabase/functions/_shared/select-slides.ts` (import `combinedScore`):

```ts
import { combinedScore } from "./cosine.ts"
```

```ts
// Theme-aware selection: reserve up to K favourites (any category), then allocate the
// remaining slots across categories per the theme's composition_template, filling each
// category's slots by combinedScore(theme_fit, quality) — the most on-theme photo wins,
// quality supports, favourite breaks an exact tie. Falls back to a quality top-up for
// leftover slots when the template and pool share no category. `bench` = everything
// unused (quality desc) for client-side swaps.
export function selectSlidesByComposition(
  pool: ScoredMedia[],
  slideCount: number,
  template: Record<string, number>,
): SlideSelection {
  if (pool.length === 0) return { slots: [], bench: [], slide_count: 0 }

  const n = Math.max(1, Math.min(slideCount, pool.length))
  const byQuality = [...pool].sort((a, b) => b.quality_score - a.quality_score)

  const reserved = byQuality.filter((p) => p.is_favourite).slice(0, Math.min(FAVOURITE_RESERVE_CAP, n))
  const reservedIds = new Set(reserved.map((p) => p.media_item_id))
  const rest = byQuality.filter((p) => !reservedIds.has(p.media_item_id))
  const remaining = n - reserved.length

  const scoreOf = (p: ScoredMedia) => combinedScore(p.theme_fit ?? 0, p.quality_score)
  const rank = (a: ScoredMedia, b: ScoredMedia) =>
    scoreOf(b) - scoreOf(a) || Number(b.is_favourite) - Number(a.is_favourite)

  const categoryCounts: Record<string, number> = {}
  for (const p of rest) categoryCounts[p.content_category] = (categoryCounts[p.content_category] ?? 0) + 1

  const alloc = allocateSlots(template, categoryCounts, remaining)

  const fillIds = new Set<string>()
  const fill: ScoredMedia[] = []
  for (const [cat, count] of Object.entries(alloc)) {
    for (const p of rest.filter((p) => p.content_category === cat).sort(rank).slice(0, count)) {
      fill.push(p)
      fillIds.add(p.media_item_id)
    }
  }
  // Top up any shortfall (no template overlap, or rounding) with the best remaining by score.
  if (fill.length < remaining) {
    for (const p of [...rest].sort(rank)) {
      if (fill.length >= remaining) break
      if (!fillIds.has(p.media_item_id)) {
        fill.push(p)
        fillIds.add(p.media_item_id)
      }
    }
  }

  const slots: Slot[] = [
    ...reserved.map((p) => ({ ...p, reserved: true })),
    ...fill.map((p) => ({ ...p, reserved: false })),
  ]
  const selectedIds = new Set(slots.map((s) => s.media_item_id))
  const bench = byQuality.filter((p) => !selectedIds.has(p.media_item_id))

  return { slots, bench, slide_count: slots.length }
}
```

- [ ] **Step 9: Run the shared suite**

```bash
cd supabase/functions && deno test _shared/select-slides.test.ts
```

Expected: all `allocateSlots`, `selectSlidesByComposition`, and existing `selectSlides` tests PASS.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/select-slides.ts supabase/functions/_shared/select-slides.test.ts
git commit -m "feat: composition_template + theme-fit slot-fill selection"
```

---

### Task 4: `rank-media` embeds photos, computes theme-fit, selects by composition

**Files:**
- Create: `supabase/functions/rank-media/embed-photo.ts`
- Modify: `supabase/functions/rank-media/handler.ts`
- Modify: `supabase/functions/rank-media/handler.test.ts`
- Modify: `supabase/functions/rank-media/index.ts`

**Interfaces:**
- Consumes: `selectSlides`, `selectSlidesByComposition`, `ScoredMedia` (Task 3); `cosineSimilarity`, `parseVector` (Task 2).
- Produces: `POST /functions/v1/rank-media` body accepts optional `theme_id`; `RankMediaDeps` gains `embedMedia(imageUrl)`, `updateMediaCache(id, patch)` (replaces `updateMediaScore`), `getTheme(themeId)` (returns `{ composition_template, centroid_vec } | null`); `MediaItemRow` gains `embedding`.

- [ ] **Step 1: Implement `embed-photo.ts` (no dedicated unit test — real Voyage I/O, verified live in `/run`, matching `score-photo.ts` / theme-loader precedent)**

Create `supabase/functions/rank-media/embed-photo.ts`:

```ts
// Voyage multimodal embedding of a photo — the SAME model the theme-loader used to
// build theme_fingerprints.centroid_vec, so a photo's vector and a theme's centroid
// live in one space and their cosine similarity is a meaningful "how on-theme" score.
// Voyage fetches the image by URL (unaffected by robots.txt, unlike Anthropic).
export async function embedPhoto(imageUrl: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("VOYAGE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }],
      model: "voyage-multimodal-3",
    }),
  })
  if (!response.ok) throw new Error(`Voyage request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const embedding = body.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error(`Unexpected Voyage response shape: ${JSON.stringify(body).slice(0, 300)}`)
  }
  return embedding as number[]
}
```

- [ ] **Step 2: Write failing handler tests**

Rewrite the `baseDeps` helper in `supabase/functions/rank-media/handler.test.ts` to include the new deps, and add tests. Full `baseDeps` (replace the existing one):

```ts
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
```

Add these tests (keep the existing 400/403/422 and cached-vs-uncached tests; their `MediaItemRow` fixtures gain an `embedding: null` field):

```ts
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
```

Add `import { assert } from "jsr:@std/assert@1"` if not already imported.

- [ ] **Step 3: Run to verify failure**

```bash
cd supabase/functions && deno test rank-media/handler.test.ts
```

Expected: FAIL — new deps / theme_id not supported.

- [ ] **Step 4: Implement the handler**

Rewrite `supabase/functions/rank-media/handler.ts`:

```ts
import { selectSlides, selectSlidesByComposition, type ScoredMedia } from "../_shared/select-slides.ts"
import { cosineSimilarity, parseVector } from "../_shared/cosine.ts"

const CONTENT_CATEGORIES = ["solo_portrait", "group", "scenery", "food", "action_fit", "candid_funny"]
const PROCESS_CONCURRENCY = 5
const MIN_SLIDES = 1
const MAX_SLIDES = 20

export interface MediaItemRow {
  id: string
  storage_path: string
  quality_score: number | null
  content_category: string | null
  is_favourite: boolean
  embedding: string | number[] | null
}

export interface ThemeRow {
  composition_template: Record<string, number> | null
  centroid_vec: string | number[] | null
}

export interface RankMediaDeps {
  verifyTripOwnership(tripId: string): Promise<boolean>
  listTripMedia(tripId: string): Promise<MediaItemRow[]>
  createSignedUrl(path: string): Promise<string | null>
  scoreMedia(imageUrl: string): Promise<{ quality_score: number; content_category: string }>
  embedMedia(imageUrl: string): Promise<number[]>
  updateMediaCache(mediaItemId: string, patch: Record<string, unknown>): Promise<void>
  getTheme(themeId: string): Promise<ThemeRow | null>
}

export interface RankMediaRequest {
  trip_id?: string
  slide_count?: number
  theme_id?: string
}

export interface RankMediaResult {
  status: number
  // deno-lint-ignore no-explicit-any
  body: any
}

// Run async tasks with a concurrency cap (rate-limit-aware for Haiku + Voyage).
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
  const { trip_id, slide_count, theme_id } = req
  if (!trip_id) return { status: 400, body: { error: "missing_trip_id" } }
  if (typeof slide_count !== "number" || slide_count < MIN_SLIDES || slide_count > MAX_SLIDES) {
    return { status: 400, body: { error: "invalid_slide_count" } }
  }
  if (!(await deps.verifyTripOwnership(trip_id))) return { status: 403, body: { error: "not_trip_owner" } }

  const media = await deps.listTripMedia(trip_id)
  if (media.length === 0) return { status: 422, body: { error: "no_media" } }

  // Load the theme fingerprint once (if a theme was chosen): the category-mix template
  // and the visual centroid the trip photos are scored against.
  const theme = theme_id ? await deps.getTheme(theme_id) : null
  const centroid = theme ? parseVector(theme.centroid_vec) : null

  // For each photo, ensure quality_score/content_category (Haiku) and embedding (Voyage)
  // are cached, then compute theme_fit = cosine(embedding, centroid). Each API call is
  // independent and failure-isolated: a scoring failure drops the photo; an embedding
  // failure just leaves theme_fit null (neutral) — the photo stays selectable.
  const scoredOrNull = await mapCapped(media, PROCESS_CONCURRENCY, async (item): Promise<ScoredMedia | null> => {
    let quality = item.quality_score
    let category = item.content_category
    let embedding = parseVector(item.embedding)
    const patch: Record<string, unknown> = {}

    let signedUrl: string | null = null
    const needsScore = quality == null || category == null
    // Only embed when a theme centroid exists to compare against — a no-theme
    // generation skips Voyage entirely. The embedding is cached for future themed runs.
    const needsEmbed = centroid != null && embedding == null
    if (needsScore || needsEmbed) {
      signedUrl = await deps.createSignedUrl(item.storage_path)
      if (!signedUrl) return null
    }

    if (needsScore && signedUrl) {
      try {
        const result = await deps.scoreMedia(signedUrl)
        if (!CONTENT_CATEGORIES.includes(result.content_category)) return null
        quality = result.quality_score
        category = result.content_category
        patch.quality_score = quality
        patch.content_category = category
      } catch {
        return null // no usable score -> drop the photo
      }
    }

    if (needsEmbed && signedUrl) {
      try {
        embedding = await deps.embedMedia(signedUrl)
        patch.embedding = JSON.stringify(embedding)
      } catch {
        embedding = null // embedding is optional — keep the photo, theme_fit stays null
      }
    }

    if (Object.keys(patch).length > 0) await deps.updateMediaCache(item.id, patch)

    const theme_fit = centroid && embedding ? cosineSimilarity(embedding, centroid) : null
    return {
      media_item_id: item.id,
      storage_path: item.storage_path,
      quality_score: quality as number,
      is_favourite: item.is_favourite,
      content_category: category as string,
      theme_fit,
    }
  })

  const scored = scoredOrNull.filter((s): s is ScoredMedia => s !== null)
  if (scored.length === 0) return { status: 422, body: { error: "no_media" } }

  const template = theme?.composition_template
  if (template && Object.keys(template).length > 0) {
    return { status: 200, body: selectSlidesByComposition(scored, slide_count, template) }
  }
  return { status: 200, body: selectSlides(scored, slide_count) }
}
```

- [ ] **Step 5: Run to verify pass**

```bash
cd supabase/functions && deno test rank-media/handler.test.ts
```

Expected: all rank-media handler tests PASS.

- [ ] **Step 6: Wire the new deps in `index.ts`**

In `supabase/functions/rank-media/index.ts`: import `embedPhoto` (`import { embedPhoto } from "./embed-photo.ts"`); `listTripMedia`'s select gains `embedding`; replace `updateMediaScore` with `updateMediaCache`; add `embedMedia` and `getTheme`. The relevant dep entries:

```ts
    async listTripMedia(tripId) {
      const { data } = await supabase
        .from("media_items")
        .select("id, storage_path, quality_score, content_category, is_favourite, embedding")
        .eq("trip_id", tripId)
        .eq("type", "photo")
      return data ?? []
    },
    scoreMedia: (imageUrl) => scorePhoto(imageUrl),
    embedMedia: (imageUrl) => embedPhoto(imageUrl),
    async updateMediaCache(mediaItemId, patch) {
      await supabase.from("media_items").update(patch).eq("id", mediaItemId)
    },
    async getTheme(themeId) {
      const { data } = await supabase
        .from("theme_fingerprints")
        .select("composition_template, centroid_vec")
        .eq("theme_id", themeId)
        .maybeSingle()
      return data ?? null
    },
```

(Remove the old `updateMediaScore` entry.)

- [ ] **Step 7: Full functions suite**

```bash
cd supabase/functions && deno test
```

Expected: all pass, no regressions.

- [ ] **Step 8: Deploy `rank-media`**

Deploy via Supabase MCP `deploy_edge_function` (project_id `alawnboscurigspqinlx`), bundling `_shared/{supabase-client,cors,serve-json,strip-markdown-fence,select-slides,cosine}.ts` (rewrite import paths in deployed content only). Confirm ACTIVE. (Live scoring/embedding needs the `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY` edge secrets — user-set, exercised in `/run`.)

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/rank-media/
git commit -m "feat: rank-media embeds photos and selects by theme composition + theme-fit"
```

---

### Task 5: Generic color grade in render-worker

**Files:**
- Modify: `services/render-worker/compose.js`, `compose.test.js`, `handler.js`, `handler.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `composePost(imageBuffer, grade?)` where `grade` = `{ brightness: number, saturation: number, overlay?: { r, g, b, alpha } }`; `/render` body accepts optional `grade`.

- [ ] **Step 1: Write failing compose grade tests**

Add to `services/render-worker/compose.test.js`:

```js
test("composePost applies a grade and shifts the image toward the overlay color", async () => {
  const src = await makeTestImage(1200, 1200)
  const plain = await composePost(src)
  const graded = await composePost(src, { brightness: 1.0, saturation: 1.0, overlay: { r: 0, g: 0, b: 255, alpha: 0.5 } })
  const p = await sharp(plain).stats()
  const g = await sharp(graded).stats()
  assert.ok(g.channels[2].mean > p.channels[2].mean) // blue rises under a blue overlay
  const meta = await sharp(graded).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
})

test("composePost without a grade is unchanged (no-op path)", async () => {
  const src = await makeTestImage(1080, 1080)
  assert.equal(Buffer.compare(await composePost(src), await composePost(src, undefined)), 0)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd services/render-worker && npm test
```

Expected: FAIL — second arg ignored.

- [ ] **Step 3: Implement the grade in `compose.js`**

Replace `services/render-worker/compose.js`:

```js
import sharp from "sharp"

const OUTPUT_SIZE = 1080

// Crop to a 1080x1080 square (content-aware "attention" crop), then optionally apply a
// theme color grade: a brightness/saturation modulate plus a low-alpha solid-color
// overlay (the "wash" that gives a theme its tone). No watermark. `grade` is supplied
// by the caller — render-worker stays generic and knows nothing about theme names.
export async function composePost(imageBuffer, grade) {
  let img = sharp(imageBuffer).resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })

  if (grade) {
    img = img.modulate({ brightness: grade.brightness, saturation: grade.saturation })
    if (grade.overlay) {
      const { r, g, b, alpha } = grade.overlay
      img = img.composite([
        {
          input: { create: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4, background: { r, g, b, alpha } } },
          blend: "over",
        },
      ])
    }
  }

  return img.jpeg({ quality: 90 }).toBuffer()
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd services/render-worker && npm test
```

Expected: compose tests PASS.

- [ ] **Step 5: Write failing handler test**

Add to `services/render-worker/handler.test.js`:

```js
test("forwards the grade from the request to compose", async () => {
  let received
  const deps = baseDeps({ compose: async (buf, grade) => { received = grade; return buf } })
  await handleRender(deps, { source_url: "a", upload_url: "b", grade: { brightness: 1.1, saturation: 1.2 } })
  assert.deepEqual(received, { brightness: 1.1, saturation: 1.2 })
})
```

- [ ] **Step 6: Run to verify failure, then implement**

```bash
cd services/render-worker && npm test
```

Expected: FAIL. Then in `services/render-worker/handler.js`, destructure and forward `grade`:

```js
  const { source_url, upload_url, grade } = req
  if (!source_url || !upload_url) return { status: 400, body: { success: false, error: "missing_fields" } }
```

```js
  let outputBuffer
  try {
    outputBuffer = await deps.compose(sourceBuffer, grade)
  } catch (error) {
    return { status: 500, body: { success: false, error: `compose_failed: ${error.message}` } }
  }
```

(`server.js` binds `compose: composePost` directly, which already accepts the 2nd arg — read it to confirm no change is needed.)

- [ ] **Step 7: Run to verify pass**

```bash
cd services/render-worker && npm test
```

Expected: all render-worker tests PASS.

- [ ] **Step 8: Commit**

```bash
git add services/render-worker/
git commit -m "feat: render-worker applies an optional theme color grade"
```

---

### Task 6: Per-theme grade map + `generate` threads it

**Files:**
- Create: `supabase/functions/_shared/theme-grades.ts` (+ `.test.ts`)
- Modify: `supabase/functions/generate/handler.ts`, `handler.test.ts`, `index.ts`

**Interfaces:**
- Consumes: render-worker `grade` contract (Task 5).
- Produces: `gradeForTheme(themeId): ThemeGrade | null`; `GenerateDeps.renderPost` gains a 3rd arg `grade: ThemeGrade | null`; `processGeneration` gains a `themeId` param.

- [ ] **Step 1: Write failing grade-map tests**

Create `supabase/functions/_shared/theme-grades.test.ts`:

```ts
import { assert, assertEquals } from "jsr:@std/assert@1"
import { gradeForTheme } from "./theme-grades.ts"

Deno.test("null for no/unknown theme", () => {
  assertEquals(gradeForTheme(null), null)
  assertEquals(gradeForTheme(undefined), null)
  assertEquals(gradeForTheme("nope"), null)
})

Deno.test("a distinct grade for each of the 5 seeded themes", () => {
  const grades = ["golden_hour", "neon_nights", "film_grain", "coastal", "aesthetic"].map(gradeForTheme)
  for (const g of grades) {
    assert(g !== null)
    assert(typeof g!.brightness === "number" && typeof g!.saturation === "number")
  }
  assertEquals(new Set(grades.map((g) => JSON.stringify(g))).size, 5)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/theme-grades.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `theme-grades.ts`**

```ts
export interface ThemeGrade {
  brightness: number
  saturation: number
  overlay?: { r: number; g: number; b: number; alpha: number }
}

// Curated per-theme color grades (hand-tuned sharp params keyed by theme_id). Deriving
// these from theme_fingerprints.palette — which holds textual descriptors like "warm
// amber", not RGB — is a later refinement; a small curated map is the demoable MVP.
const GRADES: Record<string, ThemeGrade> = {
  golden_hour: { brightness: 1.06, saturation: 1.12, overlay: { r: 255, g: 196, b: 120, alpha: 0.1 } },
  neon_nights: { brightness: 0.97, saturation: 1.3, overlay: { r: 150, g: 80, b: 220, alpha: 0.12 } },
  film_grain: { brightness: 1.02, saturation: 0.82, overlay: { r: 120, g: 110, b: 90, alpha: 0.08 } },
  coastal: { brightness: 1.05, saturation: 1.1, overlay: { r: 120, g: 190, b: 220, alpha: 0.1 } },
  aesthetic: { brightness: 1.04, saturation: 1.08, overlay: { r: 230, g: 225, b: 235, alpha: 0.05 } },
}

export function gradeForTheme(themeId: string | null | undefined): ThemeGrade | null {
  if (!themeId) return null
  return GRADES[themeId] ?? null
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd supabase/functions && deno test _shared/theme-grades.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing generate tests**

In `supabase/functions/generate/handler.test.ts`: update `baseDeps` so `renderPost` accepts a 3rd arg; update the existing direct `processGeneration(...)` calls (the "renders every slide", "fails if media has no storage path", "fails when render fails", "fails gracefully on exception" tests) to pass a 5th `themeId` argument of `null`. Then add:

```ts
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
```

- [ ] **Step 6: Run to verify failure**

```bash
cd supabase/functions && deno test generate/handler.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement grade threading in `handler.ts`**

In `supabase/functions/generate/handler.ts`: `import { gradeForTheme, type ThemeGrade } from "../_shared/theme-grades.ts"`. Change `renderPost` in `GenerateDeps` to `renderPost(sourceUrl: string, uploadUrl: string, grade: ThemeGrade | null): Promise<boolean>`. In `handleGenerate`, pass the theme through:

```ts
  deps.waitUntil(processGeneration(deps, generation.id, trip_id, media_item_ids, theme_id ?? null))
```

Change `processGeneration`'s signature to add `themeId: string | null`, resolve `const grade = gradeForTheme(themeId)` at the top of the function, and pass `grade` as the 3rd arg to `deps.renderPost(sourceUrl, uploadUrl, grade)`.

- [ ] **Step 8: Run to verify pass**

```bash
cd supabase/functions && deno test generate/handler.test.ts
```

Expected: PASS.

- [ ] **Step 9: Update `renderPost` in `index.ts`**

In `supabase/functions/generate/index.ts`, replace the `renderPost` dep body to send the grade:

```ts
    async renderPost(sourceUrl, uploadUrl, grade) {
      const response = await fetch(`${RENDER_WORKER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, upload_url: uploadUrl, ...(grade ? { grade } : {}) }),
      })
      if (!response.ok) return false
      const body = await response.json().catch(() => ({ success: false }))
      return body.success === true
    },
```

- [ ] **Step 10: Full suite + deploy `generate`**

```bash
cd supabase/functions && deno test
```

Expected: all pass. Deploy `generate` via Supabase MCP (bundle `_shared/{supabase-client,cors,serve-json,theme-grades}.ts`; rewrite paths in deployed content only). Confirm ACTIVE.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/_shared/theme-grades.ts supabase/functions/_shared/theme-grades.test.ts supabase/functions/generate/
git commit -m "feat: apply a curated per-theme color grade in generate/render-worker"
```

---

### Task 7: Mobile sends `theme_id` to `rank-media`

**Files:**
- Modify: `apps/mobile/src/app/generate/[tripId].tsx`

**Interfaces:**
- Consumes: `rank-media`'s optional `theme_id` (Task 4).
- Produces: the Preview selection reflects the chosen theme's mix + fit.

- [ ] **Step 1: Include `theme_id` in the invoke**

In `apps/mobile/src/app/generate/[tripId].tsx`, in `handleFindShots`, change the body to:

```tsx
      body: { trip_id: tripId, slide_count: slideCount, theme_id: selectedThemeId },
```

(`selectedThemeId` is already in state; `null` is safe — `rank-media` treats it as the naive path.)

- [ ] **Step 2: Verify compile + render**

Start `mobile-web` (`preview_start` name `mobile-web`), open Generate Setup, confirm no console errors and the theme chips + slider render. The full theme→Preview flow is exercised in `/run` (needs organizer session + the `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` edge secrets).

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/generate/[tripId].tsx"
git commit -m "feat: pass the selected theme_id to rank-media for composition selection"
```

---

## Day 5 Checkpoint (verify in `/run`)

Per `docs/plan.md`'s Days 7-9 theme-awareness checkpoint (pulled forward), verified locally by driving the real services against real infra (keys from `--env-file`):

- **Different photo MIX by theme:** on a category-diverse trip, `rank-media` with `theme_id=golden_hour` (95% solo_portrait) vs `aesthetic` (group/action/candid) returns different `content_category` distributions in `slots`.
- **Different photo CHOICE by theme-fit:** on a scenery-heavy trip, `coastal` vs `neon_nights` (same category mix) pick *different* scenery photos — the ones whose embeddings are closest to each theme's centroid. Confirm the two `slots` sets differ and that `theme_fit` values are populated.
- **Different GRADE by theme:** `generate` (render-worker up locally) for the same photos under `coastal` vs `neon_nights` produces rendered JPEGs with different channel-mean tints (`sharp(...).stats()`).
- **Graceful fallback:** no `theme_id`, unknown `theme_id`, and a forced embedding failure all still return a valid selection (no 500); a photo that fails embedding still appears.

## Deferred (not this day)

- **Deriving the color grade from `theme_fingerprints.palette`** (textual → numeric/LUT) — Day 5 uses a curated grade map.
- **Special-slot narrative rules** ("Aesthetic closes on a candid/funny shot") and **pgvector ANN index** (brute-force cosine in JS is fine at ≤50 photos/trip).
- **Captions** and the **"also made from this trip" sibling strip** — remain later.
