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
