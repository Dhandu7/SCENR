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
