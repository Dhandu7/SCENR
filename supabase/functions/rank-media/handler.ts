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
