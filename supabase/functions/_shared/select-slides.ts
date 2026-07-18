import { combinedScore } from "./cosine.ts"

export interface ScoredMedia {
  media_item_id: string
  storage_path: string
  quality_score: number
  is_favourite: boolean
  content_category: string
  theme_fit: number | null
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
