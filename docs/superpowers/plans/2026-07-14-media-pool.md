# Media Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (this project's established workflow — see the `scenr-feature-workflow` project memory. Do not use executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking. Work directly on `main`, no git worktree (explicit project-wide decision).

**Goal:** The organizer's trip screen shows a live, Realtime-updating grid of everyone's uploaded photos/videos — the "feels alive" moment where an upload from a contributor's browser appears in the app without a refresh.

**Architecture:** A Postgres-Changes subscription on `media_items` (filtered by `trip_id`, RLS-authorized via the existing owner-scoped SELECT policy) drives a live grid; per-item thumbnails are fetched as signed URLs against the private `trip-media` bucket (RLS already permits the owner). Filter/count logic is pure and unit-tested; the screen itself is manually verified per this project's established pattern for RN UI (see `docs/day-logs/2026-07-13-day-1.md`).

**Tech Stack:** Same as Day 1 — Supabase (Postgres Realtime, Storage), Expo Router (mobile), no new services.

## Global Constraints

- Supabase project ref: `alawnboscurigspqinlx`.
- No git worktree; commit directly to `main` after each task.
- `apps/mobile/src/app/` is the Expo Router routes directory; `apps/mobile/src/lib/` holds shared code — both siblings under `src/`.
- **Out of scope for this plan** (later days per `docs/plan.md`): the "Generate ✦" CTA (no `generate` function exists yet — do not add a button that does nothing), the trips archive/list screen, video thumbnailing (no render pipeline exists — video tiles show a placeholder/duration badge, not a real frame), and capturing `duration_seconds` on upload (not in scope for this slice; the pool conditionally renders the badge only if the column happens to be populated, which today it never is — this is an accepted, explicitly noted gap, not a bug to chase).
- Four real trips already exist in the live database from Day 1 testing, including one (`Toronto 2026`, id `95aaeecd-85db-430d-b373-7fc4c666bc55`) with one real `media_items` row — use this trip for manual verification so the grid isn't empty on first load.

---

## Task 1: Add `media_items` to the Realtime publication

**Files:**
- Create: `supabase/migrations/0003_realtime.sql`

**Interfaces:**
- Produces: `media_items` row-level changes (INSERT/UPDATE) are now replicated to subscribed Realtime clients (subject to each subscriber's RLS as usual for Postgres Changes — no separate authorization config is needed for this event type, unlike Broadcast/Presence). Task 3's pool screen subscribes to this.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_realtime.sql
alter publication supabase_realtime add table media_items;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase `apply_migration` MCP tool with `project_id="alawnboscurigspqinlx"`, `name="0003_realtime"`, and the SQL above as `query`.

- [ ] **Step 3: Verify**

Use the Supabase `execute_sql` MCP tool with `project_id="alawnboscurigspqinlx"`:
```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
```
Expected: `media_items` appears in the result.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_realtime.sql
git commit -m "feat: add media_items to the Realtime publication"
```

---

## Task 2: Pool filter/count utilities

**Files:**
- Create: `apps/mobile/src/lib/pool-filters.ts`
- Create: `apps/mobile/src/lib/pool-filters.test.ts`

**Interfaces:**
- Produces: `PoolFilter` type (`"all" | "photos" | "videos" | "favourites"`), `PoolMediaItem` interface (`{id, type, is_favourite, contributor_id}`), `filterMediaItems<T extends PoolMediaItem>(items: T[], filter: PoolFilter): T[]`, `computePoolCounts(items: PoolMediaItem[]): {itemCount: number, contributorCount: number}` — both consumed by Task 3's screen.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/lib/pool-filters.test.ts
import { filterMediaItems, computePoolCounts, type PoolMediaItem } from "./pool-filters"

const items: PoolMediaItem[] = [
  { id: "1", type: "photo", is_favourite: false, contributor_id: "c1" },
  { id: "2", type: "video", is_favourite: true, contributor_id: "c1" },
  { id: "3", type: "photo", is_favourite: true, contributor_id: "c2" },
]

describe("filterMediaItems", () => {
  it("returns all items for 'all'", () => {
    expect(filterMediaItems(items, "all")).toHaveLength(3)
  })

  it("returns only photos for 'photos'", () => {
    expect(filterMediaItems(items, "photos").map((i) => i.id)).toEqual(["1", "3"])
  })

  it("returns only videos for 'videos'", () => {
    expect(filterMediaItems(items, "videos").map((i) => i.id)).toEqual(["2"])
  })

  it("returns only favourites for 'favourites'", () => {
    expect(filterMediaItems(items, "favourites").map((i) => i.id)).toEqual(["2", "3"])
  })
})

describe("computePoolCounts", () => {
  it("counts items and distinct contributors", () => {
    expect(computePoolCounts(items)).toEqual({ itemCount: 3, contributorCount: 2 })
  })

  it("does not count a null contributor_id as a contributor", () => {
    const withNull: PoolMediaItem[] = [
      ...items,
      { id: "4", type: "photo", is_favourite: false, contributor_id: null },
    ]
    expect(computePoolCounts(withNull)).toEqual({ itemCount: 4, contributorCount: 2 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/mobile && npx jest src/lib/pool-filters.test.ts
```
Expected: FAIL — `pool-filters.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/lib/pool-filters.ts
export type PoolFilter = "all" | "photos" | "videos" | "favourites"

export interface PoolMediaItem {
  id: string
  type: "photo" | "video"
  is_favourite: boolean
  contributor_id: string | null
}

export function filterMediaItems<T extends PoolMediaItem>(items: T[], filter: PoolFilter): T[] {
  switch (filter) {
    case "photos":
      return items.filter((item) => item.type === "photo")
    case "videos":
      return items.filter((item) => item.type === "video")
    case "favourites":
      return items.filter((item) => item.is_favourite)
    case "all":
    default:
      return items
  }
}

export function computePoolCounts(items: PoolMediaItem[]): { itemCount: number; contributorCount: number } {
  const contributorIds = new Set<string>()
  for (const item of items) {
    if (item.contributor_id) contributorIds.add(item.contributor_id)
  }
  return { itemCount: items.length, contributorCount: contributorIds.size }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/mobile && npx jest src/lib/pool-filters.test.ts
```
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/pool-filters.ts apps/mobile/src/lib/pool-filters.test.ts
git commit -m "feat: add pool filter and count utilities"
```

---

## Task 3: Media Pool screen

**Files:**
- Create: `apps/mobile/src/app/pool/[tripId].tsx`

**Interfaces:**
- Consumes: `supabase` (`apps/mobile/src/lib/supabase.ts`), `filterMediaItems`/`computePoolCounts`/`PoolFilter`/`PoolMediaItem` (Task 2).
- Produces: route `/pool/[tripId]` — Task 4's invite screen navigates here.

- [ ] **Step 1: Write the screen**

```tsx
// apps/mobile/src/app/pool/[tripId].tsx
import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { supabase } from "../../lib/supabase"
import { computePoolCounts, filterMediaItems, type PoolFilter, type PoolMediaItem } from "../../lib/pool-filters"

interface MediaRow extends PoolMediaItem {
  storage_path: string
  duration_seconds: number | null
  created_at: string
}

const FILTERS: { key: PoolFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "favourites", label: "★ Favourites" },
]

export default function PoolScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const [items, setItems] = useState<MediaRow[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [filter, setFilter] = useState<PoolFilter>("all")

  const loadSignedUrl = useCallback(async (storagePath: string) => {
    const { data } = await supabase.storage.from("trip-media").createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadInitial() {
      const { data } = await supabase
        .from("media_items")
        .select("id, type, storage_path, contributor_id, is_favourite, duration_seconds, created_at")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })

      if (!isMounted || !data) return
      setItems(data as MediaRow[])
      setIsLoading(false)

      const urlEntries = await Promise.all(
        data.map(async (item) => [item.id, await loadSignedUrl(item.storage_path)] as const),
      )
      if (!isMounted) return
      setSignedUrls(Object.fromEntries(urlEntries.filter(([, url]) => url) as [string, string][]))
    }

    loadInitial()

    const channel = supabase
      .channel(`media_items:trip_id=eq.${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "media_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const newItem = payload.new as MediaRow
          setItems((current) => [newItem, ...current])
          loadSignedUrl(newItem.storage_path).then((url) => {
            if (url) setSignedUrls((current) => ({ ...current, [newItem.id]: url }))
          })
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "media_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const updated = payload.new as MediaRow
          setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        },
      )
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"))

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [tripId, loadSignedUrl])

  const { itemCount, contributorCount } = useMemo(() => computePoolCounts(items), [items])
  const filteredItems = useMemo(() => filterMediaItems(items, filter), [items, filter])

  async function handleToggleFavourite(item: MediaRow) {
    const nextValue = !item.is_favourite
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, is_favourite: nextValue } : i)))
    await supabase.from("media_items").update({ is_favourite: nextValue }).eq("id", item.id)
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · {contributorCount} contributor
            {contributorCount === 1 ? "" : "s"}
          </Text>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, isLive ? styles.liveDotOn : styles.liveDotOff]} />
            <Text style={styles.liveText}>{isLive ? "Live" : "Connecting…"}</Text>
          </View>
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No photos yet</Text>
          <Text style={styles.emptySubtitle}>Waiting for your group to add photos and videos.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => handleToggleFavourite(item)}>
              {signedUrls[item.id] ? (
                <Image source={{ uri: signedUrls[item.id] }} style={styles.tileImage} />
              ) : (
                <View style={[styles.tileImage, styles.tilePlaceholder]} />
              )}
              {item.type === "video" ? (
                <View style={styles.videoBadge}>
                  <Text style={styles.videoBadgeText}>
                    {item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : "▶"}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.favouriteStar}>{item.is_favourite ? "★" : "☆"}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const TILE_SIZE = 110

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  header: { padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerText: { fontSize: 14, color: "#51596A", fontWeight: "600" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveDotOn: { backgroundColor: "#16A34A" },
  liveDotOff: { backgroundColor: "#94A3B8" },
  liveText: { fontSize: 12, color: "#51596A" },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C3D0E8",
  },
  filterChipActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  filterChipText: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  filterChipTextActive: { color: "white" },
  grid: { paddingHorizontal: 12, gap: 4 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    margin: 2,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EEF2FB",
  },
  tileImage: { width: "100%", height: "100%" },
  tilePlaceholder: { backgroundColor: "#EEF2FB" },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(11,18,32,0.7)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  videoBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  favouriteStar: { position: "absolute", top: 4, right: 4, fontSize: 16, color: "#FBBF24" },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
})
```

- [ ] **Step 2: Manual verification**

```bash
cd apps/mobile && npx expo start --web
```
Navigate to `http://localhost:8081/pool/95aaeecd-85db-430d-b373-7fc4c666bc55` (the real `Toronto 2026` trip from Day 1 testing). Expected: header shows "1 item · 1 contributor", the Live badge reads "Live" within a second or two of load, the grid shows one tile with the real uploaded test image, tapping the tile toggles the star icon and the change persists (reload the page — `is_favourite` should still be true if you left it toggled on).

Also navigate to a trip with zero media (e.g. any of the other three Day 1 test trips — check `select id, name from trips order by created_at desc;` via the Supabase `execute_sql` MCP tool if you need an id) to confirm the empty state renders instead of a blank/broken grid.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/pool
git commit -m "feat: add Realtime-wired media pool screen"
```

---

## Task 4: Wire "View pool" navigation from the invite screen

**Files:**
- Modify: `apps/mobile/src/app/invite/[id].tsx`

**Interfaces:**
- Consumes: the `/pool/[tripId]` route (Task 3).

- [ ] **Step 1: Add the button and navigation**

In `apps/mobile/src/app/invite/[id].tsx`, add `useRouter` to the existing `expo-router` import and add a router instance plus a second button below the existing "Share invite" button:

```tsx
import { useLocalSearchParams, useRouter } from "expo-router"
```

Inside the component, right after `const { id } = useLocalSearchParams<{ id: string }>()`, add:

```tsx
const router = useRouter()
```

Then, right after the existing `<Pressable style={styles.primaryButton} onPress={handleShare}>...</Pressable>` block (still inside the returned `<View style={styles.container}>`), add:

```tsx
<Pressable style={styles.secondaryButton} onPress={() => router.push(`/pool/${id}`)}>
  <Text style={styles.secondaryButtonText}>View pool</Text>
</Pressable>
```

And add two new entries to the existing `StyleSheet.create({...})` call (alongside `primaryButton`/`primaryButtonText`):

```ts
secondaryButton: {
  borderWidth: 1,
  borderColor: "#1D4ED8",
  paddingVertical: 14,
  paddingHorizontal: 32,
  borderRadius: 999,
  marginTop: 12,
},
secondaryButtonText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
```

- [ ] **Step 2: Manual verification**

```bash
cd apps/mobile && npx expo start --web
```
Navigate to `http://localhost:8081/invite/95aaeecd-85db-430d-b373-7fc4c666bc55`. Expected: below "Share invite" there's a "View pool" button with an outlined (not filled) style; tapping it navigates to `/pool/95aaeecd-85db-430d-b373-7fc4c666bc55` and the pool screen from Task 3 renders correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/invite/[id].tsx
git commit -m "feat: add View pool navigation from the invite screen"
```

---

## Self-Review Notes (for the plan author, not a task)

**Spec coverage:** PRD §2 screens 06-07 and §2.1 "Media pool management" — unified grid ✅, type filters (All/Photos/Videos) ✅, favourites ✅, per-contributor attribution via `contributor_id`-based counting ✅ (individual avatar images are not built — contributors have no display_name/photo captured yet per Day 1's accepted scope trim; the header count is the attribution signal for this slice), video duration badge — conditionally rendered, explicitly noted as unpopulated today (see Global Constraints), Live indicator ✅ via real Postgres Changes subscription. "Generate ✦" CTA is explicitly out of scope (see Global Constraints) since the `generate` function doesn't exist yet — omitting it avoids a dead button rather than a spec gap.

**Placeholder scan:** no TBD/TODO markers; every code step is complete, runnable code.

**Type consistency:** `MediaRow` in the pool screen extends `PoolMediaItem` from Task 2 and matches the actual `media_items` schema columns selected in the query (`id, type, storage_path, contributor_id, is_favourite, duration_seconds, created_at`) against `supabase/migrations/0001_init.sql`'s `media_items` table definition. `filterMediaItems`/`computePoolCounts` signatures match their Task 2 definitions exactly where consumed in Task 3.

**Design decisions made during self-review (replacing a "grilling" pass):**
- **Realtime mechanism**: Postgres Changes, not Broadcast — it's the simpler, RLS-authorized-by-default option for "table changed" events, and Broadcast would need a separate trigger/function to publish messages for no added benefit here.
- **Thumbnails**: signed URLs against the original `storage_path` (no thumbnailing pipeline exists yet) — acceptable for MVP-scale test images; a real render/thumbnail pipeline is a later day's work.
- **Video thumbnails**: placeholder tile + duration/play-icon badge, not a real extracted frame — no video-processing infra exists yet.
- **Favourite toggle**: tap-to-toggle directly on the grid tile (star icon overlay), with local optimistic state update — avoids waiting on the Realtime round-trip for the user's own action, while Realtime still keeps everything consistent for anything triggered elsewhere.
