# Theme Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (this project's established workflow — see the `scenr-feature-workflow` project memory. Do not use executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking. Work directly on `main`, no git worktree (explicit project-wide decision).

**Goal:** A one-time, re-runnable Node script that harvests ~60-80 Pinterest pins per theme (5 themes), extracts an embedding + content-category + palette tag per pin via hosted APIs, aggregates each theme into a fingerprint, and writes real rows into the already-existing `theme_fingerprints` table — unblocking every later day's theme-aware generation work.

**Architecture:** Four small, independently-testable modules (`harvest.js`, `extract-features.js`, `aggregate.js`, plus orchestration in `index.js`), each built around a pure core function that takes its I/O as injected dependencies — same DI-for-testability pattern used throughout this project's Edge Functions. Nothing downloads or stores Pinterest image bytes: both the embedding call and the vision-tagging call are given the pin's existing CDN image URL and fetch it themselves, so compliance with "never persist third-party source images" (PRD §4.1.5) is structural, not a cleanup step we have to remember.

**Tech Stack:** Plain Node.js (v24.18.0, already available) — no TypeScript, no build step, no test framework beyond Node's built-in `node:test`/`node:assert`. Only external dependency: `@supabase/supabase-js` for the final write.

## Global Constraints

- **Apify**: actor `epctex/pinterest-scraper`. Endpoint: `POST https://api.apify.com/v2/actors/epctex~pinterest-scraper/run-sync-get-dataset-items` (note the `~` between owner and actor name), header `Authorization: Bearer <APIFY_API_TOKEN>`. Body: `{"search": "<query>", "maxItems": <n>, "proxy": {"useApifyProxy": true}}`. Response: JSON array of pin objects with an `images` field keyed by size string (e.g. `"236x"`, `"736x"`) — pick the largest by numeric width prefix, don't hardcode one key.
- **Voyage AI**: `POST https://api.voyageai.com/v1/multimodalembeddings`, header `Authorization: Bearer <VOYAGE_API_KEY>`. Body: `{"inputs": [{"content": [{"type": "image_url", "image_url": "<url>"}]}], "model": "voyage-multimodal-3"}`. Model produces 1024-dimension embeddings (matches the existing `theme_fingerprints.centroid_vec vector(1024)` column exactly). Expected response shape `{data: [{embedding: number[], index}], ...}` is inferred from standard embedding-API convention, not 100% doc-confirmed — code must throw a clear error with the raw response body on a shape mismatch rather than silently producing garbage.
- **Anthropic**: `POST https://api.anthropic.com/v1/messages`, header `x-api-key: <ANTHROPIC_API_KEY>` + `anthropic-version: 2023-06-01`. Model: `claude-haiku-4-5-20251001`. Image content blocks support `{"type": "image", "source": {"type": "url", "url": "<url>"}}` — no download/base64 needed. URL-based fetching can fail for some domains (bot-control caveat) — tolerate per-pin failures, don't abort the run.
- **Content taxonomy** (fixed, do not change): `solo_portrait`, `group`, `scenery`, `food`, `action_fit`, `candid_funny`.
- **Five themes for this harvest**, capped at ~80 pins each: Golden Hour, Neon Nights, Film Grain, Coastal (the four named in the Figma prototype), plus **Aesthetic** — chosen as the 5th because it's the exact theme the user used as their own example when specifying the composition engine ("fit pics and potentially a suggested funny picture... last slide"), so this harvest can actually demonstrate that behavior later.
- **Idempotency**: writes are `upsert`s keyed on `theme_fingerprints.theme_id` (already the primary key) — a failed run for one theme never corrupts an already-completed theme, and re-running the whole script is always safe.
- **Cost/runtime expectation**: ~5 themes × ~80 pins × 2 API calls (embed + tag) run sequentially ≈ up to 800 calls; expect 15-30 minutes wall-clock and roughly $1-2 of Apify usage (pay-per-result, ~$30/10k pins) plus small Voyage/Anthropic usage for this volume — not a per-request-optimized hot path, simplicity over speed is the right tradeoff for a script that runs once.
- **Prerequisite the user must fill in before Task 4's live run**: `SUPABASE_SERVICE_ROLE_KEY` in the repo root `.env` is currently blank (Day 2 status) — the theme-loader needs it to bypass RLS and write into `theme_fingerprints`. If it's still blank when Task 4 starts, the implementer must stop and report BLOCKED with that specific reason, not guess or work around it.
- No git worktree; commit directly to `main` after each task.

---

## Task 1: Scaffold + seed queries + harvest

**Files:**
- Create: `scripts/theme-loader/package.json`
- Create: `scripts/theme-loader/seed-queries.js`
- Create: `scripts/theme-loader/harvest.js`
- Create: `scripts/theme-loader/harvest.test.js`

**Interfaces:**
- Produces: `SEED_QUERIES` (a `{[themeId]: {displayName, query}}` map for all 5 themes), `pickLargestImageUrl(images)`, `harvestTheme(deps, query, maxItems)` where `deps = {runApifyActor(query, maxItems) => Promise<rawPin[]>}`, returning `Promise<{id, imageUrl, description}[]>` (deduped by id, dropped if no image). `runApifyActor` (the real fetch-based implementation) is also exported for Task 4 to wire in.

- [ ] **Step 1: Scaffold the package**

```json
// scripts/theme-loader/package.json
{
  "name": "theme-loader",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "node --env-file=../../.env index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

```bash
cd scripts/theme-loader && npm install
```

- [ ] **Step 2: Write the seed queries**

```js
// scripts/theme-loader/seed-queries.js
export const SEED_QUERIES = {
  golden_hour: {
    displayName: "Golden Hour",
    query: "golden hour portrait sunset travel photography",
  },
  neon_nights: {
    displayName: "Neon Nights",
    query: "neon nights city photography cyberpunk aesthetic",
  },
  film_grain: {
    displayName: "Film Grain",
    query: "film grain 35mm analog photography travel",
  },
  coastal: {
    displayName: "Coastal",
    query: "coastal beach travel photography ocean aesthetic",
  },
  aesthetic: {
    displayName: "Aesthetic",
    query: "aesthetic gym fit candid funny friends photography",
  },
}
```

- [ ] **Step 3: Write the failing tests**

```js
// scripts/theme-loader/harvest.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import { harvestTheme, pickLargestImageUrl } from "./harvest.js"

test("pickLargestImageUrl picks the largest width entry", () => {
  const url = pickLargestImageUrl({ "236x": { url: "small.jpg" }, "736x": { url: "big.jpg" } })
  assert.equal(url, "big.jpg")
})

test("pickLargestImageUrl returns null for missing images", () => {
  assert.equal(pickLargestImageUrl(undefined), null)
  assert.equal(pickLargestImageUrl({}), null)
})

test("harvestTheme dedupes by id and drops pins with no image", async () => {
  const deps = {
    runApifyActor: async () => [
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "2", images: {}, description: "no image" },
      { id: "3", images: { "236x": { url: "c.jpg" } }, description: "c" },
    ],
  }
  const pins = await harvestTheme(deps, "test query", 80)
  assert.deepEqual(pins.map((p) => p.id), ["1", "3"])
})

test("harvestTheme passes query and maxItems through to runApifyActor", async () => {
  let capturedArgs
  const deps = {
    runApifyActor: async (query, maxItems) => {
      capturedArgs = { query, maxItems }
      return []
    },
  }
  await harvestTheme(deps, "golden hour", 80)
  assert.deepEqual(capturedArgs, { query: "golden hour", maxItems: 80 })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd scripts/theme-loader && npm test
```
Expected: FAIL — `harvest.js` does not exist yet.

- [ ] **Step 5: Write the implementation**

```js
// scripts/theme-loader/harvest.js
const APIFY_RUN_URL =
  "https://api.apify.com/v2/actors/epctex~pinterest-scraper/run-sync-get-dataset-items"

export function pickLargestImageUrl(images) {
  if (!images || typeof images !== "object") return null
  const entries = Object.entries(images)
  if (entries.length === 0) return null
  entries.sort((a, b) => (parseInt(b[0], 10) || 0) - (parseInt(a[0], 10) || 0))
  return entries[0][1]?.url ?? null
}

export async function harvestTheme(deps, query, maxItems) {
  const rawPins = await deps.runApifyActor(query, maxItems)
  const seen = new Set()
  const pins = []
  for (const raw of rawPins) {
    if (!raw.id || seen.has(raw.id)) continue
    const imageUrl = pickLargestImageUrl(raw.images)
    if (!imageUrl) continue
    seen.add(raw.id)
    pins.push({ id: raw.id, imageUrl, description: raw.description ?? "" })
  }
  return pins
}

export async function runApifyActor(query, maxItems) {
  const response = await fetch(APIFY_RUN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ search: query, maxItems, proxy: { useApifyProxy: true } }),
  })
  if (!response.ok) {
    throw new Error(`Apify request failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd scripts/theme-loader && npm test
```
Expected: PASS — 4 tests passed.

- [ ] **Step 7: Commit**

```bash
git add scripts/theme-loader/package.json scripts/theme-loader/package-lock.json scripts/theme-loader/seed-queries.js scripts/theme-loader/harvest.js scripts/theme-loader/harvest.test.js
git commit -m "feat: scaffold theme-loader with seed queries and Apify harvest"
```

---

## Task 2: Feature extraction (embedding + vision tagging)

**Files:**
- Create: `scripts/theme-loader/extract-features.js`
- Create: `scripts/theme-loader/extract-features.test.js`

**Interfaces:**
- Consumes: a pin `{id, imageUrl, description}` (Task 1's shape).
- Produces: `CONTENT_CATEGORIES` (the fixed 6-value taxonomy array), `extractFeatures(deps, pin)` where `deps = {embedImage(url) => Promise<number[]>, tagImage(url) => Promise<{category, palette, description}>}`, returning `Promise<{id, embedding, category, palette, description} | null>` (null on any failure — embedding error, tagging error, or an unrecognized category). `embedImage`/`tagImage` (the real fetch-based implementations) are also exported for Task 4 to wire in.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/theme-loader/extract-features.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import { extractFeatures, CONTENT_CATEGORIES } from "./extract-features.js"

const pin = { id: "1", imageUrl: "https://example.com/a.jpg", description: "" }

test("extractFeatures combines embedding and tag on success", async () => {
  const deps = {
    embedImage: async () => [0.1, 0.2, 0.3],
    tagImage: async () => ({ category: "scenery", palette: ["warm amber"], description: "warm golden light" }),
  }
  const result = await extractFeatures(deps, pin)
  assert.deepEqual(result, {
    id: "1",
    embedding: [0.1, 0.2, 0.3],
    category: "scenery",
    palette: ["warm amber"],
    description: "warm golden light",
  })
})

test("extractFeatures returns null when embedding fails", async () => {
  const deps = {
    embedImage: async () => {
      throw new Error("network error")
    },
    tagImage: async () => ({ category: "scenery", palette: [], description: "x" }),
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("extractFeatures returns null when tagging fails", async () => {
  const deps = {
    embedImage: async () => [0.1],
    tagImage: async () => {
      throw new Error("network error")
    },
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("extractFeatures returns null for an unrecognized category", async () => {
  const deps = {
    embedImage: async () => [0.1],
    tagImage: async () => ({ category: "bogus_category", palette: [], description: "x" }),
  }
  assert.equal(await extractFeatures(deps, pin), null)
})

test("CONTENT_CATEGORIES matches the fixed taxonomy", () => {
  assert.deepEqual(CONTENT_CATEGORIES, [
    "solo_portrait",
    "group",
    "scenery",
    "food",
    "action_fit",
    "candid_funny",
  ])
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scripts/theme-loader && npm test
```
Expected: FAIL — `extract-features.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// scripts/theme-loader/extract-features.js
export const CONTENT_CATEGORIES = [
  "solo_portrait",
  "group",
  "scenery",
  "food",
  "action_fit",
  "candid_funny",
]

export async function extractFeatures(deps, pin) {
  let embedding
  try {
    embedding = await deps.embedImage(pin.imageUrl)
  } catch (error) {
    console.warn(`skipping pin ${pin.id}: embedding failed: ${error.message}`)
    return null
  }

  let tag
  try {
    tag = await deps.tagImage(pin.imageUrl)
  } catch (error) {
    console.warn(`skipping pin ${pin.id}: tagging failed: ${error.message}`)
    return null
  }

  if (!CONTENT_CATEGORIES.includes(tag.category)) {
    console.warn(`skipping pin ${pin.id}: unrecognized category "${tag.category}"`)
    return null
  }

  return {
    id: pin.id,
    embedding,
    category: tag.category,
    palette: tag.palette ?? [],
    description: tag.description ?? "",
  }
}

export async function embedImage(imageUrl) {
  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }],
      model: "voyage-multimodal-3",
    }),
  })
  if (!response.ok) {
    throw new Error(`Voyage request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const embedding = body.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error(`Unexpected Voyage response shape: ${JSON.stringify(body).slice(0, 500)}`)
  }
  return embedding
}

export async function tagImage(imageUrl) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text:
                'Classify the main subject of this photo into exactly one category: solo_portrait, group, scenery, food, action_fit, or candid_funny. Then provide up to 3 short palette/tone descriptors (e.g. "warm amber", "soft pastel blue") and a note (under 20 words) on lighting and composition. Respond with ONLY a JSON object: {"category": "...", "palette": ["...", "..."], "description": "..."}. No other text.',
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
  return JSON.parse(text)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scripts/theme-loader && npm test
```
Expected: PASS — 9 tests passed (4 from Task 1 + 5 here).

- [ ] **Step 5: Commit**

```bash
git add scripts/theme-loader/extract-features.js scripts/theme-loader/extract-features.test.js
git commit -m "feat: add per-pin feature extraction (embedding + vision tagging)"
```

---

## Task 3: Aggregation

**Files:**
- Create: `scripts/theme-loader/aggregate.js`
- Create: `scripts/theme-loader/aggregate.test.js`

**Interfaces:**
- Consumes: an array of Task 2's `{id, embedding, category, palette, description}` results.
- Produces: `normalizeVector(vector)`, `computeCentroid(embeddings)`, `computeCompositionTemplate(categories)`, `computePalette(paletteArrays)`, `aggregateFingerprint(themeId, displayName, features)` returning `{theme_id, display_name, centroid_vec, palette, notes, composition_template, sample_count}` — this exact shape (minus `refreshed_at`, added at write time) is what Task 4's Supabase upsert consumes.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/theme-loader/aggregate.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeVector,
  computeCentroid,
  computeCompositionTemplate,
  computePalette,
  aggregateFingerprint,
} from "./aggregate.js"

test("normalizeVector produces a unit vector", () => {
  const normalized = normalizeVector([3, 4])
  assert.equal(normalized[0], 0.6)
  assert.equal(normalized[1], 0.8)
})

test("normalizeVector handles an all-zero vector without dividing by zero", () => {
  assert.deepEqual(normalizeVector([0, 0]), [0, 0])
})

test("computeCentroid averages and re-normalizes multiple embeddings", () => {
  const centroid = computeCentroid([
    [1, 0],
    [0, 1],
  ])
  const magnitude = Math.sqrt(centroid[0] ** 2 + centroid[1] ** 2)
  assert.ok(Math.abs(magnitude - 1) < 1e-9)
  assert.ok(Math.abs(centroid[0] - centroid[1]) < 1e-9)
})

test("computeCompositionTemplate returns a normalized frequency distribution", () => {
  const distribution = computeCompositionTemplate(["scenery", "scenery", "group", "food"])
  assert.equal(distribution.scenery, 0.5)
  assert.equal(distribution.group, 0.25)
  assert.equal(distribution.food, 0.25)
})

test("computePalette returns the most frequent terms, most common first", () => {
  const palette = computePalette([["warm amber", "soft gold"], ["warm amber"], ["deep orange"]])
  assert.deepEqual(palette.slice(0, 1), ["warm amber"])
})

test("aggregateFingerprint throws for zero features", () => {
  assert.throws(() => aggregateFingerprint("golden_hour", "Golden Hour", []))
})

test("aggregateFingerprint produces the full fingerprint shape", () => {
  const features = [
    { id: "1", embedding: [1, 0], category: "scenery", palette: ["warm amber"], description: "a" },
    { id: "2", embedding: [0, 1], category: "group", palette: ["warm amber"], description: "b" },
  ]
  const fingerprint = aggregateFingerprint("golden_hour", "Golden Hour", features)
  assert.equal(fingerprint.theme_id, "golden_hour")
  assert.equal(fingerprint.display_name, "Golden Hour")
  assert.equal(fingerprint.sample_count, 2)
  assert.equal(fingerprint.centroid_vec.length, 2)
  assert.deepEqual(fingerprint.composition_template, { scenery: 0.5, group: 0.5 })
  assert.deepEqual(fingerprint.palette.slice(0, 1), ["warm amber"])
  assert.equal(fingerprint.notes, "a | b")
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scripts/theme-loader && npm test
```
Expected: FAIL — `aggregate.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// scripts/theme-loader/aggregate.js
export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude === 0) return vector.map(() => 0)
  return vector.map((v) => v / magnitude)
}

export function computeCentroid(embeddings) {
  const dimension = embeddings[0].length
  const sum = new Array(dimension).fill(0)
  for (const embedding of embeddings) {
    const normalized = normalizeVector(embedding)
    for (let i = 0; i < dimension; i++) {
      sum[i] += normalized[i]
    }
  }
  return normalizeVector(sum.map((v) => v / embeddings.length))
}

export function computeCompositionTemplate(categories) {
  const counts = {}
  for (const category of categories) {
    counts[category] = (counts[category] ?? 0) + 1
  }
  const total = categories.length
  const distribution = {}
  for (const [category, count] of Object.entries(counts)) {
    distribution[category] = Math.round((count / total) * 1000) / 1000
  }
  return distribution
}

export function computePalette(paletteArrays) {
  const counts = new Map()
  for (const terms of paletteArrays) {
    for (const term of terms) {
      const key = term.toLowerCase().trim()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term)
}

export function aggregateFingerprint(themeId, displayName, features) {
  if (features.length === 0) {
    throw new Error(`cannot aggregate fingerprint for "${themeId}" with zero features`)
  }
  const centroidVec = computeCentroid(features.map((f) => f.embedding))
  const compositionTemplate = computeCompositionTemplate(features.map((f) => f.category))
  const palette = computePalette(features.map((f) => f.palette)).slice(0, 5)
  const notes = features
    .map((f) => f.description)
    .filter(Boolean)
    .slice(0, 10)
    .join(" | ")

  return {
    theme_id: themeId,
    display_name: displayName,
    centroid_vec: centroidVec,
    palette,
    notes,
    composition_template: compositionTemplate,
    sample_count: features.length,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scripts/theme-loader && npm test
```
Expected: PASS — 16 tests passed (9 from Tasks 1-2 + 7 here).

- [ ] **Step 5: Commit**

```bash
git add scripts/theme-loader/aggregate.js scripts/theme-loader/aggregate.test.js
git commit -m "feat: add theme fingerprint aggregation"
```

---

## Task 4: Orchestration, real run, and verification

**Files:**
- Create: `scripts/theme-loader/index.js`

**Interfaces:**
- Consumes: `SEED_QUERIES` (Task 1), `harvestTheme`/`runApifyActor` (Task 1), `extractFeatures`/`embedImage`/`tagImage` (Task 2), `aggregateFingerprint` (Task 3).
- Produces: 5 real rows in the live `theme_fingerprints` table.

- [ ] **Step 1: Check the prerequisite before starting**

```bash
grep -q '^SUPABASE_SERVICE_ROLE_KEY=.\+' /Users/aaryandhand/Documents/Projects/SCENR/.env && echo "present" || echo "missing"
```
Use `-q` (quiet) — this must never print the actual key value into your own output/transcript, only report presence. If this prints "missing", **stop here and report BLOCKED** — `SUPABASE_SERVICE_ROLE_KEY` is required to bypass RLS and write into `theme_fingerprints`, and per this project's rules, an agent must never write credential values into `.env` itself; the user has to fill it in themselves (Supabase dashboard → Project Settings → API → reveal the `service_role` secret key). Do not proceed to Step 2 until this passes.

- [ ] **Step 2: Write the orchestration script**

```js
// scripts/theme-loader/index.js
import { createClient } from "@supabase/supabase-js"
import { SEED_QUERIES } from "./seed-queries.js"
import { harvestTheme, runApifyActor } from "./harvest.js"
import { extractFeatures, embedImage, tagImage } from "./extract-features.js"
import { aggregateFingerprint } from "./aggregate.js"

const MAX_ITEMS_PER_THEME = 80

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function processTheme(themeId, config) {
  console.log(`[${themeId}] harvesting up to ${MAX_ITEMS_PER_THEME} pins for "${config.query}"...`)
  const pins = await harvestTheme({ runApifyActor }, config.query, MAX_ITEMS_PER_THEME)
  console.log(`[${themeId}] harvested ${pins.length} unique pins with images`)

  const features = []
  for (const pin of pins) {
    const feature = await extractFeatures({ embedImage, tagImage }, pin)
    if (feature) features.push(feature)
  }
  console.log(`[${themeId}] extracted features for ${features.length}/${pins.length} pins`)

  if (features.length === 0) {
    console.warn(`[${themeId}] no usable features extracted, skipping upsert`)
    return
  }

  const fingerprint = aggregateFingerprint(themeId, config.displayName, features)
  const { error } = await supabase
    .from("theme_fingerprints")
    .upsert({ ...fingerprint, refreshed_at: new Date().toISOString() }, { onConflict: "theme_id" })

  if (error) {
    console.error(`[${themeId}] failed to upsert fingerprint: ${error.message}`)
    return
  }
  console.log(`[${themeId}] fingerprint saved (${fingerprint.sample_count} samples)`)
}

async function main() {
  for (const [themeId, config] of Object.entries(SEED_QUERIES)) {
    try {
      await processTheme(themeId, config)
    } catch (error) {
      console.error(`[${themeId}] failed: ${error.message}`)
    }
  }
}

main()
```

- [ ] **Step 3: Run it for real**

```bash
cd scripts/theme-loader && npm run start
```
Expected: per-theme log lines ending in `fingerprint saved (N samples)` for most or all of the 5 themes (`golden_hour`, `neon_nights`, `film_grain`, `coastal`, `aesthetic`). This calls real, billed APIs and takes roughly 15-30 minutes — let it run to completion. If the very first Voyage or Anthropic call throws an "Unexpected response shape" error, stop, read the logged raw response body, and adjust `embedImage`/`tagImage` in `extract-features.js` to match the actual field names before re-running (the retry is safe — upserts are idempotent). A handful of individual pin failures (logged as `skipping pin ...`) are expected and fine; a theme should only be treated as failed if `[themeId] no usable features extracted` or `[themeId] failed:` appears for it.

- [ ] **Step 4: Verify in the database**

Use the Supabase `execute_sql` MCP tool with `project_id="alawnboscurigspqinlx"`:
```sql
select theme_id, display_name, sample_count, array_length(centroid_vec::real[], 1) as vec_dim,
       composition_template, palette, refreshed_at
from theme_fingerprints
order by theme_id;
```
Expected: up to 5 rows, each with `vec_dim = 1024`, a non-null `composition_template` (a JSON object of category → fraction summing to ~1.0), a non-empty `palette` array, and a recent `refreshed_at`. If fewer than 5 rows exist, check the run's console output for which theme(s) failed and why — do not silently accept a partial result without noting exactly which themes are missing and why in your task report.

- [ ] **Step 5: Commit**

```bash
git add scripts/theme-loader/index.js
git commit -m "feat: add theme-loader orchestration and run the real harvest"
```

---

## Self-Review Notes (for the plan author, not a task)

**Spec coverage:** docs/plan.md's "Theme Intelligence Engine — Offline Script" — seed queries ✅, Apify harvest ✅, hosted-API feature extraction (no local GPU/CLIP) ✅, fingerprint storage in `theme_fingerprints` ✅, composition_template derivation ✅, idempotent/re-runnable ✅, no live Pinterest dependency in the running app (this is a standalone script, never called by the deployed app) ✅. PRD §4.1.5 compliance ("never persist or redistribute third-party source images") is satisfied structurally — the script never downloads a pin's image bytes at all, only ever passes the CDN URL to Voyage/Anthropic, which is a stronger posture than the PRD's own "download → analyze → delete" design.

**Placeholder scan:** no TBD/TODO markers; every code step is complete, runnable code. The two "response shape not 100% confirmed" notes (Voyage, Task 4 Step 3) are legitimate first-time-integration guidance, not placeholders — they tell the implementer exactly what to do if the assumption is wrong, which is different from leaving something unspecified.

**Type consistency:** `harvestTheme`'s output shape (`{id, imageUrl, description}`) matches what `extractFeatures` consumes (`pin.imageUrl`, `pin.id`) exactly. `extractFeatures`'s output shape (`{id, embedding, category, palette, description}`) matches what `aggregateFingerprint` consumes (`f.embedding`, `f.category`, `f.palette`, `f.description`) exactly. `aggregateFingerprint`'s output field names (`theme_id`, `display_name`, `centroid_vec`, `palette`, `notes`, `composition_template`, `sample_count`) match the live `theme_fingerprints` table's actual column names from `supabase/migrations/0001_init.sql`.
