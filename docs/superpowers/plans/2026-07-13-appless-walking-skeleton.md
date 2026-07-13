# Appless Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (this project's established workflow — see the `scenr-feature-workflow` project memory. Do not use executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking. Work directly on `main`, no git worktree (explicit project-wide decision).

**Goal:** An organizer can sign up, create a trip, and get a real invite link/QR code; a contributor can open that link in a browser (no app/login) and upload a photo or video that lands in Supabase Storage with a matching `media_items` row.

**Architecture:** Two Supabase Edge Functions (`join-trip`, `contributor-upload`) front the write path for anonymous contributors, using injectable-dependency handlers so the request-validation logic is unit-testable with plain Deno tests, independent of the Supabase client. The Expo mobile app (organizer) and a Next.js web app (contributor) are both new, minimal scaffolds — screens are functionally complete but not pixel-matched to Figma (visual polish is Days 10-12 per `docs/plan.md`).

**Tech Stack:** Supabase (Postgres/Storage/Auth/Edge Functions, project `alawnboscurigspqinlx`), Expo + Expo Router + TypeScript (mobile), Next.js App Router + TypeScript + Tailwind (contributor-web), Deno (Edge Function runtime, not yet installed locally).

## Global Constraints

- Supabase project ref: `alawnboscurigspqinlx`, URL: `https://alawnboscurigspqinlx.supabase.co`.
- Publishable/anon key (safe, public): `sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T` (also in repo root `.env.example`).
- Per-trip upload cap for this slice: hardcoded `MAX_UPLOADS_PER_TRIP = 50` (stub QuotaLedger, per `docs/plan.md`).
- Per-file size cap: `MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024` (50MB).
- Allowed upload content types: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `video/mp4`, `video/quicktime`.
- Auth uses email **OTP code** entry (`supabase.auth.signInWithOtp` + `verifyOtp`), not a clickable magic link — avoids Expo deep-link/redirect-URL config for this slice.
- No git worktree; commit directly to `main` after each task (per project's established workflow).
- Deno is not installed on this machine; Task 2 installs it via the official installer (no Homebrew available).
- Node v24.18.0 / npm 11.16.0 are available.
- **Out of scope for this plan** (later days per `docs/plan.md`): render-worker, theme-loader, Realtime-wired media pool UI, Generate/Reveal screens, trips archive, paywall, drag-and-drop upload (tap-to-choose only), contributor display-name capture, and any real deployment (contributor-web runs on localhost for this slice; Vercel deploy + multi-device testing is Days 13-14).

---

## Task 1: Storage buckets + RLS policies

**Files:**
- Create: `supabase/migrations/0002_storage.sql`

**Interfaces:**
- Produces: `trip-media` and `renders` Storage buckets (both private), with a `select` policy on `storage.objects` restricting reads to the trip's `owner_id`. Later tasks' Edge Functions write to `trip-media` using the service-role key (bypasses these policies).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_storage.sql
insert into storage.buckets (id, name, public)
values ('trip-media', 'trip-media', false),
       ('renders', 'renders', false)
on conflict (id) do nothing;

create policy "trip_media_owner_select" on storage.objects for select
using (
  bucket_id = 'trip-media'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(name))[1]
    and trips.owner_id = auth.uid()
  )
);

create policy "renders_owner_select" on storage.objects for select
using (
  bucket_id = 'renders'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(name))[1]
    and trips.owner_id = auth.uid()
  )
);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase `apply_migration` MCP tool with `project_id="alawnboscurigspqinlx"`, `name="0002_storage"`, and the SQL above as `query`.

- [ ] **Step 3: Verify**

Use the Supabase `execute_sql` MCP tool with `project_id="alawnboscurigspqinlx"` to run:
```sql
select id, public from storage.buckets order by id;
select policyname from pg_policies where tablename = 'objects' order by policyname;
```
Expected: two buckets (`renders`, `trip-media`), both `public = false`; two policies (`renders_owner_select`, `trip_media_owner_select`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_storage.sql
git commit -m "feat: add trip-media and renders storage buckets with owner-scoped RLS"
```

---

## Task 2: `join-trip` Edge Function

**Files:**
- Create: `supabase/functions/join-trip/handler.ts`
- Create: `supabase/functions/join-trip/handler.test.ts`
- Create: `supabase/functions/join-trip/index.ts`

**Interfaces:**
- Produces: `handleJoinTrip(deps: JoinTripDeps, slug: string | undefined, sessionToken: string): Promise<JoinTripResult>` — pure, injectable-deps handler. `JoinTripDeps.findTripBySlug(slug)` and `JoinTripDeps.createContributor(tripId, sessionToken)` are the two seams later tasks' deploy step wires to the real Supabase client. Deployed function is reachable at `https://alawnboscurigspqinlx.supabase.co/functions/v1/join-trip`, called with `{slug}`, returns `{trip: {id, name, cover_image_url}, session_token, contributor_id}`.

- [ ] **Step 1: Install Deno**

```bash
curl -fsSL https://deno.land/install.sh | sh
```
Then add `export PATH="$HOME/.deno/bin:$PATH"` to `~/.zshrc` (or `~/.bashrc`) and export it in the current shell too. Verify:
```bash
export PATH="$HOME/.deno/bin:$PATH"
deno --version
```
Expected: prints a Deno version (2.x).

- [ ] **Step 2: Write the failing tests**

```ts
// supabase/functions/join-trip/handler.test.ts
import { assertEquals } from "jsr:@std/assert@1"
import { handleJoinTrip, type JoinTripDeps, type TripSummary } from "./handler.ts"

Deno.test("returns 400 when slug is missing", async () => {
  const deps: JoinTripDeps = {
    findTripBySlug: () => { throw new Error("should not be called") },
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, undefined, "token-1")
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "missing_slug")
})

Deno.test("returns 404 when trip does not exist", async () => {
  const deps: JoinTripDeps = {
    findTripBySlug: async () => null,
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 404)
  assertEquals(result.body.error, "trip_not_found")
})

Deno.test("returns 404 when trip is archived", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: null, archived_at: "2026-01-01T00:00:00Z" }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 404)
})

Deno.test("creates a contributor and returns trip info on success", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: "https://x/y.jpg", archived_at: null }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: async (_tripId, token) => ({ id: "c1", session_token: token }),
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 200)
  assertEquals(result.body, {
    trip: { id: "t1", name: "Bali", cover_image_url: "https://x/y.jpg" },
    session_token: "token-1",
    contributor_id: "c1",
  })
})

Deno.test("returns 500 when contributor insert fails", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: null, archived_at: null }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: async () => null,
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 500)
  assertEquals(result.body.error, "contributor_create_failed")
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd supabase/functions/join-trip && deno test
```
Expected: FAIL — `handler.ts` does not exist yet (module not found).

- [ ] **Step 4: Write the handler**

```ts
// supabase/functions/join-trip/handler.ts
export interface TripSummary {
  id: string
  name: string
  cover_image_url: string | null
  archived_at: string | null
}

export interface JoinTripDeps {
  findTripBySlug(slug: string): Promise<TripSummary | null>
  createContributor(
    tripId: string,
    sessionToken: string,
  ): Promise<{ id: string; session_token: string } | null>
}

export interface JoinTripResult {
  status: number
  body: Record<string, unknown>
}

export async function handleJoinTrip(
  deps: JoinTripDeps,
  slug: string | undefined,
  sessionToken: string,
): Promise<JoinTripResult> {
  if (!slug || slug.trim() === "") {
    return { status: 400, body: { error: "missing_slug" } }
  }

  const trip = await deps.findTripBySlug(slug)
  if (!trip || trip.archived_at) {
    return { status: 404, body: { error: "trip_not_found" } }
  }

  const contributor = await deps.createContributor(trip.id, sessionToken)
  if (!contributor) {
    return { status: 500, body: { error: "contributor_create_failed" } }
  }

  return {
    status: 200,
    body: {
      trip: { id: trip.id, name: trip.name, cover_image_url: trip.cover_image_url },
      session_token: contributor.session_token,
      contributor_id: contributor.id,
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd supabase/functions/join-trip && deno test
```
Expected: PASS — 5 tests passed.

- [ ] **Step 6: Write the serve wrapper**

```ts
// supabase/functions/join-trip/index.ts
import { createClient } from "npm:@supabase/supabase-js@2"
import { handleJoinTrip, type JoinTripDeps, type TripSummary } from "./handler.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function buildDeps(): JoinTripDeps {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  return {
    async findTripBySlug(slug) {
      const { data } = await supabase
        .from("trips")
        .select("id, name, cover_image_url, archived_at")
        .eq("slug", slug)
        .maybeSingle()
      return (data as TripSummary) ?? null
    },
    async createContributor(tripId, sessionToken) {
      const { data } = await supabase
        .from("contributors")
        .insert({ trip_id: tripId, session_token: sessionToken })
        .select("id, session_token")
        .single()
      return data ?? null
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const body = await req.json().catch(() => ({}))
  const sessionToken = crypto.randomUUID()
  const result = await handleJoinTrip(buildDeps(), body.slug, sessionToken)

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
```

- [ ] **Step 7: Deploy**

Read `index.ts` and `handler.ts`, then call the Supabase `deploy_edge_function` MCP tool with `project_id="alawnboscurigspqinlx"`, `name="join-trip"`, `entrypoint_path="index.ts"`, `verify_jwt=true`, and `files=[{name:"index.ts", content: <index.ts contents>}, {name:"handler.ts", content: <handler.ts contents>}]`.

- [ ] **Step 8: Smoke-test the deployed function**

```bash
curl -s -X POST "https://alawnboscurigspqinlx.supabase.co/functions/v1/join-trip" \
  -H "Authorization: Bearer sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T" \
  -H "apikey: sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T" \
  -H "Content-Type: application/json" \
  -d '{"slug":"does-not-exist"}'
```
Expected: `{"error":"trip_not_found"}` with a 404 status (a nonexistent-slug is the only case testable without a real trip row — Task 6 will produce a real trip to retest against end-to-end).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/join-trip
git commit -m "feat: add join-trip edge function"
```

---

## Task 3: `contributor-upload` Edge Function

**Files:**
- Create: `supabase/functions/contributor-upload/handler.ts`
- Create: `supabase/functions/contributor-upload/handler.test.ts`
- Create: `supabase/functions/contributor-upload/index.ts`

**Interfaces:**
- Consumes: nothing from Task 2 (independent function), but relies on the `trip-media` bucket from Task 1.
- Produces: `handleContributorUpload(deps: ContributorUploadDeps, req: UploadRequest, generateId: () => string): Promise<UploadResult>`. Deployed at `https://alawnboscurigspqinlx.supabase.co/functions/v1/contributor-upload`, called with `{session_token, file_name, content_type, file_size}`, returns `{upload_url, upload_token, storage_path, media_item_id}` — `upload_url`/`upload_token` are consumed by Task 8's contributor-web via `supabase.storage.from('trip-media').uploadToSignedUrl(storage_path, upload_token, file)`.

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/contributor-upload/handler.test.ts
import { assertEquals } from "jsr:@std/assert@1"
import {
  handleContributorUpload,
  MAX_UPLOADS_PER_TRIP,
  type ContributorUploadDeps,
} from "./handler.ts"

function baseDeps(overrides: Partial<ContributorUploadDeps> = {}): ContributorUploadDeps {
  return {
    findContributorByToken: async () => ({ id: "c1", trip_id: "t1" }),
    countMediaItems: async () => 0,
    createSignedUploadUrl: async (path) => ({ signedUrl: `https://signed/${path}`, token: "tok" }),
    createMediaItem: async () => ({ id: "m1" }),
    ...overrides,
  }
}

Deno.test("returns 400 when required fields are missing", async () => {
  const result = await handleContributorUpload(baseDeps(), {}, () => "id1")
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "missing_fields")
})

Deno.test("returns 400 for an unsupported content type", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.gif", content_type: "image/gif", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "unsupported_content_type")
})

Deno.test("returns 400 when the file exceeds the size cap", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 51 * 1024 * 1024 },
    () => "id1",
  )
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "file_too_large")
})

Deno.test("returns 401 for an invalid session token", async () => {
  const result = await handleContributorUpload(
    baseDeps({ findContributorByToken: async () => null }),
    { session_token: "bad", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 401)
  assertEquals(result.body.error, "invalid_session_token")
})

Deno.test("returns 403 when the trip has reached its upload cap", async () => {
  const result = await handleContributorUpload(
    baseDeps({ countMediaItems: async () => MAX_UPLOADS_PER_TRIP }),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 403)
  assertEquals(result.body.error, "upload_cap_reached")
})

Deno.test("returns a signed upload URL and creates a media item on success", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "generated-id",
  )
  assertEquals(result.status, 200)
  assertEquals(result.body, {
    upload_url: "https://signed/t1/generated-id-a.jpg",
    upload_token: "tok",
    storage_path: "t1/generated-id-a.jpg",
    media_item_id: "m1",
  })
})

Deno.test("returns 500 when signing the upload URL fails", async () => {
  const result = await handleContributorUpload(
    baseDeps({ createSignedUploadUrl: async () => null }),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 500)
  assertEquals(result.body.error, "storage_signing_failed")
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd supabase/functions/contributor-upload && deno test
```
Expected: FAIL — `handler.ts` does not exist yet.

- [ ] **Step 3: Write the handler**

```ts
// supabase/functions/contributor-upload/handler.ts
export const MAX_UPLOADS_PER_TRIP = 50
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export const ALLOWED_CONTENT_TYPES: Record<string, "photo" | "video"> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/heic": "photo",
  "image/webp": "photo",
  "video/mp4": "video",
  "video/quicktime": "video",
}

export interface ContributorSummary {
  id: string
  trip_id: string
}

export interface SignedUpload {
  signedUrl: string
  token: string
}

export interface ContributorUploadDeps {
  findContributorByToken(sessionToken: string): Promise<ContributorSummary | null>
  countMediaItems(tripId: string): Promise<number>
  createSignedUploadUrl(path: string): Promise<SignedUpload | null>
  createMediaItem(row: {
    trip_id: string
    contributor_id: string
    type: "photo" | "video"
    storage_path: string
  }): Promise<{ id: string } | null>
}

export interface UploadRequest {
  session_token?: string
  file_name?: string
  content_type?: string
  file_size?: number
}

export interface UploadResult {
  status: number
  body: Record<string, unknown>
}

export async function handleContributorUpload(
  deps: ContributorUploadDeps,
  req: UploadRequest,
  generateId: () => string,
): Promise<UploadResult> {
  const { session_token, file_name, content_type, file_size } = req

  if (!session_token || !file_name || !content_type || typeof file_size !== "number") {
    return { status: 400, body: { error: "missing_fields" } }
  }

  const mediaType = ALLOWED_CONTENT_TYPES[content_type]
  if (!mediaType) {
    return { status: 400, body: { error: "unsupported_content_type" } }
  }
  if (file_size > MAX_FILE_SIZE_BYTES) {
    return { status: 400, body: { error: "file_too_large" } }
  }

  const contributor = await deps.findContributorByToken(session_token)
  if (!contributor) {
    return { status: 401, body: { error: "invalid_session_token" } }
  }

  const existingCount = await deps.countMediaItems(contributor.trip_id)
  if (existingCount >= MAX_UPLOADS_PER_TRIP) {
    return { status: 403, body: { error: "upload_cap_reached" } }
  }

  const storagePath = `${contributor.trip_id}/${generateId()}-${file_name}`
  const signedUpload = await deps.createSignedUploadUrl(storagePath)
  if (!signedUpload) {
    return { status: 500, body: { error: "storage_signing_failed" } }
  }

  const mediaItem = await deps.createMediaItem({
    trip_id: contributor.trip_id,
    contributor_id: contributor.id,
    type: mediaType,
    storage_path: storagePath,
  })
  if (!mediaItem) {
    return { status: 500, body: { error: "media_item_create_failed" } }
  }

  return {
    status: 200,
    body: {
      upload_url: signedUpload.signedUrl,
      upload_token: signedUpload.token,
      storage_path: storagePath,
      media_item_id: mediaItem.id,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/contributor-upload && deno test
```
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Write the serve wrapper**

```ts
// supabase/functions/contributor-upload/index.ts
import { createClient } from "npm:@supabase/supabase-js@2"
import { handleContributorUpload, type ContributorUploadDeps } from "./handler.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function buildDeps(): ContributorUploadDeps {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  return {
    async findContributorByToken(sessionToken) {
      const { data } = await supabase
        .from("contributors")
        .select("id, trip_id")
        .eq("session_token", sessionToken)
        .maybeSingle()
      return data ?? null
    },
    async countMediaItems(tripId) {
      const { count } = await supabase
        .from("media_items")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
      return count ?? 0
    },
    async createSignedUploadUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUploadUrl(path)
      return data ? { signedUrl: data.signedUrl, token: data.token } : null
    },
    async createMediaItem(row) {
      const { data } = await supabase.from("media_items").insert(row).select("id").single()
      return data ?? null
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const body = await req.json().catch(() => ({}))
  const result = await handleContributorUpload(buildDeps(), body, () => crypto.randomUUID())

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
```

- [ ] **Step 6: Deploy**

Read `index.ts` and `handler.ts`, then call the Supabase `deploy_edge_function` MCP tool with `project_id="alawnboscurigspqinlx"`, `name="contributor-upload"`, `entrypoint_path="index.ts"`, `verify_jwt=true`, and both files' contents.

- [ ] **Step 7: Smoke-test the deployed function**

```bash
curl -s -X POST "https://alawnboscurigspqinlx.supabase.co/functions/v1/contributor-upload" \
  -H "Authorization: Bearer sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T" \
  -H "apikey: sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T" \
  -H "Content-Type: application/json" \
  -d '{"session_token":"does-not-exist","file_name":"a.jpg","content_type":"image/jpeg","file_size":100}'
```
Expected: `{"error":"invalid_session_token"}` with a 401 status (full end-to-end retest happens manually after Task 8).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/contributor-upload
git commit -m "feat: add contributor-upload edge function"
```

---

## Task 4: Expo mobile app scaffold + Supabase client + auth context + slug util

**Files:**
- Create: `apps/mobile/` (via `create-expo-app`)
- Create: `apps/mobile/lib/supabase.ts`
- Create: `apps/mobile/lib/auth-context.tsx`
- Create: `apps/mobile/lib/slug.ts`
- Create: `apps/mobile/lib/slug.test.ts`
- Create: `apps/mobile/.env` (gitignored) and `apps/mobile/.env.example`

**Interfaces:**
- Produces: `supabase` client singleton (`apps/mobile/lib/supabase.ts`), `AuthProvider`/`useAuth()` (`apps/mobile/lib/auth-context.tsx`, exposes `{session, isLoading}`), `makeTripSlug(name: string): string` (`apps/mobile/lib/slug.ts`) — all consumed by Tasks 5-7's screens.

- [ ] **Step 1: Scaffold the Expo app**

```bash
cd /Users/aaryandhand/Documents/Projects/SCENR
npx create-expo-app@latest apps/mobile
```
Accept TypeScript defaults. This ships with Expo Router pre-wired and an example `app/(tabs)` directory — later steps replace it.

- [ ] **Step 2: Install dependencies**

```bash
cd apps/mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill react-native-svg react-native-qrcode-svg
```

- [ ] **Step 3: Remove the example router content**

```bash
rm -rf app/\(tabs\) app/+not-found.tsx components hooks constants
```
(Run `ls app/` first — if the generated template's example files differ from this list, remove whatever example screens/components it shipped so only your own `app/` files from later steps remain.)

- [ ] **Step 4: Write the Supabase client**

```ts
// apps/mobile/lib/supabase.ts
import "react-native-url-polyfill/auto"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 5: Write the auth context**

```tsx
// apps/mobile/lib/auth-context.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

interface AuthContextValue {
  session: Session | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue>({ session: null, isLoading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 6: Write the failing slug test**

```ts
// apps/mobile/lib/slug.test.ts
import { makeTripSlug } from "./slug"

describe("makeTripSlug", () => {
  it("slugifies the trip name and appends a random suffix", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.123456)
    const slug = makeTripSlug("Bali Trip!!")
    expect(slug).toMatch(/^bali-trip-[a-z0-9]{4}$/)
  })

  it("falls back to 'trip' for a name with no alphanumeric characters", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.123456)
    const slug = makeTripSlug("!!!")
    expect(slug).toMatch(/^trip-[a-z0-9]{4}$/)
  })
})
```

- [ ] **Step 7: Ensure Jest is configured, then run the test to verify it fails**

```bash
cat package.json | grep -A2 '"jest"'
```
If no `jest` config/script is present, run `npx expo install jest-expo jest @types/jest --dev` and create:
```js
// apps/mobile/jest.config.js
module.exports = { preset: "jest-expo" }
```
and add `"test": "jest"` to `package.json`'s `scripts`. Then:
```bash
npx jest lib/slug.test.ts
```
Expected: FAIL — `slug.ts` does not exist yet (module not found).

- [ ] **Step 8: Write the slug utility**

```ts
// apps/mobile/lib/slug.ts
export function makeTripSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "trip"

  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
npx jest lib/slug.test.ts
```
Expected: PASS — 2 tests passed.

- [ ] **Step 10: Write env files**

```bash
# apps/mobile/.env.example
EXPO_PUBLIC_SUPABASE_URL=https://alawnboscurigspqinlx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T
EXPO_PUBLIC_CONTRIBUTOR_WEB_URL=http://localhost:3000
```
Copy this to `apps/mobile/.env` (gitignored by the repo root `.gitignore`'s `.env` rule) with the same values.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile
git commit -m "feat: scaffold Expo mobile app with Supabase client, auth context, and slug util"
```

---

## Task 5: Landing + Sign-up screens

**Files:**
- Create: `apps/mobile/src/app/_layout.tsx`
- Create: `apps/mobile/src/app/index.tsx`
- Create: `apps/mobile/src/app/sign-up.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth`, `supabase` from Task 4.
- Produces: root navigation stack; `index.tsx` routes to `/sign-up` (no session) or `/create-trip` (session exists) — `/create-trip` is built in Task 6, referencing it here is forward-safe since Expo Router resolves routes lazily by file path.

- [ ] **Step 1: Write the root layout**

```tsx
// apps/mobile/src/app/_layout.tsx
import { Stack } from "expo-router"
import { AuthProvider } from "../lib/auth-context"

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  )
}
```

- [ ] **Step 2: Write the landing screen**

```tsx
// apps/mobile/src/app/index.tsx
import { useRouter } from "expo-router"
import { StyleSheet, Text, View, Pressable } from "react-native"
import { useAuth } from "../lib/auth-context"

export default function LandingScreen() {
  const router = useRouter()
  const { session, isLoading } = useAuth()

  function handleStartTrip() {
    router.push(session ? "/create-trip" : "/sign-up")
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.brand}>SCENR</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>SCENR</Text>
      <Text style={styles.tagline}>Made in 2 minutes. By AI. From group photos.</Text>
      <Pressable style={styles.primaryButton} onPress={handleStartTrip}>
        <Text style={styles.primaryButtonText}>Start a Trip</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  brand: { fontSize: 40, fontWeight: "800" },
  tagline: { fontSize: 16, textAlign: "center", color: "#51596A" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999, marginTop: 16 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
})
```

- [ ] **Step 3: Write the sign-up screen (email OTP code flow)**

```tsx
// apps/mobile/src/app/sign-up.tsx
import { useState } from "react"
import { useRouter } from "expo-router"
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native"
import { supabase } from "../lib/supabase"

type Stage = "email" | "code"

export default function SignUpScreen() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSendCode() {
    setErrorMessage(null)
    setIsSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setIsSubmitting(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }
    setStage("code")
  }

  async function handleVerifyCode() {
    setErrorMessage(null)
    setIsSubmitting(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    })
    setIsSubmitting(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }
    router.replace("/create-trip")
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up</Text>
      {stage === "email" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.primaryButton} onPress={handleSendCode} disabled={isSubmitting || !email.trim()}>
            {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Send code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter the 6-digit code we sent to {email}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.primaryButton} onPress={handleVerifyCode} disabled={isSubmitting || code.trim().length < 6}>
            {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Verify</Text>}
          </Pressable>
        </>
      )}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#51596A", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#C3D0E8", borderRadius: 10, padding: 14, fontSize: 16 },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", marginTop: 8 },
})
```

- [ ] **Step 4: Manual verification**

```bash
npx expo start --web
```
Open the printed `localhost` URL. Expected: landing screen shows "SCENR" + tagline + "Start a Trip" button; tapping it (no session yet) navigates to `/sign-up`; entering a real email and tapping "Send code" shows the code-entry screen with no error.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/_layout.tsx apps/mobile/src/app/index.tsx apps/mobile/src/app/sign-up.tsx
git commit -m "feat: add landing and sign-up screens"
```

---

## Task 6: Create Trip screen

**Files:**
- Create: `apps/mobile/src/app/create-trip.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 4), `makeTripSlug` (Task 4).
- Produces: on success, navigates to `/invite/[id]` (built in Task 7) with the new trip's `id`.

- [ ] **Step 1: Write the create-trip screen**

```tsx
// apps/mobile/src/app/create-trip.tsx
import { useState } from "react"
import { useRouter } from "expo-router"
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native"
import { supabase } from "../lib/supabase"
import { makeTripSlug } from "../lib/slug"

export default function CreateTripScreen() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [destination, setDestination] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleCreateTrip() {
    setErrorMessage(null)
    setIsSubmitting(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setIsSubmitting(false)
      setErrorMessage("You must be signed in to create a trip.")
      return
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = makeTripSlug(name)
      const { data, error } = await supabase
        .from("trips")
        .insert({
          owner_id: userData.user.id,
          name: name.trim(),
          destination: destination.trim() || null,
          slug,
        })
        .select("id")
        .single()

      if (!error && data) {
        setIsSubmitting(false)
        router.replace(`/invite/${data.id}`)
        return
      }

      lastError = error?.message ?? "Unknown error"
      if (error?.code !== "23505") {
        break
      }
    }

    setIsSubmitting(false)
    setErrorMessage(lastError ?? "Could not create trip.")
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create trip</Text>
      <TextInput style={styles.input} placeholder="Trip name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="+ Add destination" value={destination} onChangeText={setDestination} />
      <Pressable style={styles.primaryButton} onPress={handleCreateTrip} disabled={isSubmitting || !name.trim()}>
        {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Create trip</Text>}
      </Pressable>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#C3D0E8", borderRadius: 10, padding: 14, fontSize: 16 },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", marginTop: 8 },
})
```

- [ ] **Step 2: Manual verification**

With `npx expo start --web` running and a signed-in session (from Task 5's flow), navigate to `/create-trip`, enter a trip name, tap "Create trip". Expected: no error shown, screen navigates to `/invite/<uuid>` (404 is fine/expected until Task 7 exists — a route-not-found page confirms navigation fired with a real id in the URL).

- [ ] **Step 3: Verify the row landed in Postgres**

Use the Supabase `execute_sql` MCP tool with `project_id="alawnboscurigspqinlx"`:
```sql
select id, name, slug, destination, owner_id from trips order by created_at desc limit 1;
```
Expected: one row matching what was just entered, with a non-null `slug` like `<trip-name>-xxxx`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/create-trip.tsx
git commit -m "feat: add create-trip screen"
```

---

## Task 7: Invite screen (QR + share)

**Files:**
- Create: `apps/mobile/src/app/invite/[id].tsx`

**Interfaces:**
- Consumes: `supabase` (Task 4), `react-native-qrcode-svg` (Task 4 install).
- Produces: the invite URL pattern `${EXPO_PUBLIC_CONTRIBUTOR_WEB_URL}/join/${slug}` that Task 8's contributor-web page must resolve.

- [ ] **Step 1: Write the invite screen**

```tsx
// apps/mobile/src/app/invite/[id].tsx
import { useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { StyleSheet, Text, View, Pressable, Share, ActivityIndicator } from "react-native"
import QRCode from "react-native-qrcode-svg"
import { supabase } from "../../lib/supabase"

const CONTRIBUTOR_WEB_URL = process.env.EXPO_PUBLIC_CONTRIBUTOR_WEB_URL ?? "http://localhost:3000"

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [tripName, setTripName] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    supabase
      .from("trips")
      .select("name, slug")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (!isMounted || !data) return
        setTripName(data.name)
        setSlug(data.slug)
        setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [id])

  if (isLoading || !slug) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    )
  }

  const inviteUrl = `${CONTRIBUTOR_WEB_URL}/join/${slug}`

  async function handleShare() {
    await Share.share({ message: `Join "${tripName}" on SCENR: ${inviteUrl}` })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite your group</Text>
      <Text style={styles.subtitle}>They can upload photos and videos — no app needed.</Text>
      <View style={styles.qrWrapper}>
        <QRCode value={inviteUrl} size={200} />
      </View>
      <Text style={styles.link}>{inviteUrl}</Text>
      <Pressable style={styles.primaryButton} onPress={handleShare}>
        <Text style={styles.primaryButtonText}>Share invite</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
  qrWrapper: { marginVertical: 16, padding: 16, backgroundColor: "white", borderRadius: 16 },
  link: { fontSize: 14, color: "#1D4ED8" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999, marginTop: 16 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
})
```

- [ ] **Step 2: Manual verification**

Re-run the Task 6 flow (create a trip) end to end. Expected: lands on `/invite/<id>`, shows the trip's QR code and a `http://localhost:3000/join/<slug>` link matching the slug from Task 6's SQL check.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/invite
git commit -m "feat: add invite screen with QR code and share"
```

---

## Task 8: Contributor-web — Next.js scaffold + `/join/[slug]` page + upload flow

**Files:**
- Create: `apps/contributor-web/` (via `create-next-app`)
- Create: `apps/contributor-web/lib/supabase.ts`
- Create: `apps/contributor-web/lib/api.ts`
- Create: `apps/contributor-web/app/join/[slug]/page.tsx`
- Create: `apps/contributor-web/.env.local` (gitignored) and `apps/contributor-web/.env.example`

**Interfaces:**
- Consumes: the deployed `join-trip` and `contributor-upload` functions (Tasks 2-3) and the `trip-media` bucket (Task 1).
- Produces: a working `/join/<slug>` page that, given a real trip's slug (from Task 6/7), lets a browser upload a photo/video that lands in Storage + `media_items` — this is the plan's end-to-end checkpoint.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd /Users/aaryandhand/Documents/Projects/SCENR
npx create-next-app@latest apps/contributor-web --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

- [ ] **Step 2: Install the Supabase client**

```bash
cd apps/contributor-web
npm install @supabase/supabase-js
```

- [ ] **Step 3: Write env files**

```bash
# apps/contributor-web/.env.example
NEXT_PUBLIC_SUPABASE_URL=https://alawnboscurigspqinlx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Al0yuk_D7hDlaJV4_8fJKQ_j3-qcS9T
```
Copy this to `apps/contributor-web/.env.local` with the same values (Next.js reads `.env.local` automatically; it's already covered by the repo root `.gitignore`'s `.env*` local-file conventions — verify with `git check-ignore apps/contributor-web/.env.local`, and if it isn't ignored, add `.env.local` to the root `.gitignore`).

- [ ] **Step 4: Write the Supabase client**

```ts
// apps/contributor-web/lib/supabase.ts
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

- [ ] **Step 5: Write the API helper**

```ts
// apps/contributor-web/lib/api.ts
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error ?? "request_failed")
  }
  return data as T
}

export interface JoinTripResponse {
  trip: { id: string; name: string; cover_image_url: string | null }
  session_token: string
  contributor_id: string
}

export function joinTrip(slug: string): Promise<JoinTripResponse> {
  return callFunction<JoinTripResponse>("join-trip", { slug })
}

export interface UploadRequestResponse {
  upload_url: string
  upload_token: string
  storage_path: string
  media_item_id: string
}

export function requestUpload(params: {
  sessionToken: string
  fileName: string
  contentType: string
  fileSize: number
}): Promise<UploadRequestResponse> {
  return callFunction<UploadRequestResponse>("contributor-upload", {
    session_token: params.sessionToken,
    file_name: params.fileName,
    content_type: params.contentType,
    file_size: params.fileSize,
  })
}
```

- [ ] **Step 6: Write the join page**

```tsx
// apps/contributor-web/app/join/[slug]/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { joinTrip, requestUpload, type JoinTripResponse } from "../../../lib/api"
import { supabase } from "../../../lib/supabase"

type UploadState = "idle" | "uploading" | "done" | "error"

export default function JoinTripPage() {
  const { slug } = useParams<{ slug: string }>()
  const [session, setSession] = useState<JoinTripResponse | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    const storageKey = `scenr_session_${slug}`
    const cached = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null
    if (cached) {
      setSession(JSON.parse(cached))
      return
    }
    joinTrip(slug)
      .then((result) => {
        setSession(result)
        localStorage.setItem(storageKey, JSON.stringify(result))
      })
      .catch((error) => setJoinError(error.message))
  }, [slug])

  async function handleFileSelected(file: File) {
    if (!session) return
    setUploadState("uploading")
    setUploadError(null)
    try {
      const uploadRequest = await requestUpload({
        sessionToken: session.session_token,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      })
      const { error } = await supabase.storage
        .from("trip-media")
        .uploadToSignedUrl(uploadRequest.storage_path, uploadRequest.upload_token, file)
      if (error) throw new Error(error.message)
      setUploadState("done")
    } catch (error) {
      setUploadState("error")
      setUploadError(error instanceof Error ? error.message : "upload_failed")
    }
  }

  if (joinError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-red-600">This invite link isn&apos;t valid: {joinError}</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p>Loading invite…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-bold">You&apos;re invited to {session.trip.name}</h1>
      <p className="text-gray-600">Add your photos and videos — no download needed.</p>
      <label className="cursor-pointer rounded-full bg-blue-700 px-8 py-3 font-semibold text-white">
        {uploadState === "uploading" ? "Uploading…" : "Choose photo or video"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/heic,image/webp,video/mp4,video/quicktime"
          className="hidden"
          disabled={uploadState === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) handleFileSelected(file)
          }}
        />
      </label>
      {uploadState === "done" ? <p className="text-green-700">Uploaded! Thank you.</p> : null}
      {uploadState === "error" ? <p className="text-red-600">Upload failed: {uploadError}</p> : null}
    </main>
  )
}
```

- [ ] **Step 7: Run the dev server**

```bash
npm run dev
```
Expected: server starts on `http://localhost:3000`.

- [ ] **Step 8: End-to-end manual verification**

Using the trip id/slug from Task 6's SQL check, open `http://localhost:3000/join/<slug>` in a browser. Expected: page shows "You're invited to <trip name>"; tapping "Choose photo or video" and selecting a real image file shows "Uploading…" then "Uploaded! Thank you." with no error.

Then use the Supabase `execute_sql` MCP tool with `project_id="alawnboscurigspqinlx"`:
```sql
select id, trip_id, contributor_id, type, storage_path, created_at
from media_items order by created_at desc limit 1;
```
Expected: one row with `type = 'photo'` (or `'video'`), a `storage_path` starting with the trip's id, and a non-null `contributor_id`.

- [ ] **Step 9: Commit**

```bash
git add apps/contributor-web
git commit -m "feat: add contributor-web join and upload flow"
```

---

## Self-Review Notes (for the plan author, not a task)

**Spec coverage:** PRD §6.1 appless flow (invite link, browser upload, no account, live pool update) is covered end-to-end except live-pool UI (explicitly deferred to Days 4-6 per `docs/plan.md` — there's no organizer-facing pool screen yet to update live). Contributor display-name capture (§6.1 "optional name") and drag-and-drop (§6.1 "drag-and-drop") are named trims — flagged in Global Constraints, not silently dropped.

**Placeholder scan:** no TBD/TODO markers; every code step is complete, runnable code.

**Type consistency:** `JoinTripResponse` (contributor-web `lib/api.ts`) matches `join-trip`'s response body shape exactly (`trip.id/name/cover_image_url`, `session_token`, `contributor_id`). `UploadRequestResponse` matches `contributor-upload`'s response body (`upload_url`, `upload_token`, `storage_path`, `media_item_id`). `ContributorUploadDeps.createMediaItem`'s `type` param (`"photo" | "video"`) matches the Postgres `media_type` enum from `supabase/migrations/0001_init.sql`.
