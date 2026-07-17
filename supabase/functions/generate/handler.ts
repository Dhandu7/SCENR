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
      if (!storagePath) throw new Error(`no storage path for media ${mediaItemIds[i]}`)

      // Source and destination URLs are independent — sign them concurrently.
      const [sourceUrl, uploadUrl] = await Promise.all([
        deps.createSignedUrl(storagePath),
        deps.createSignedUploadUrl(`${tripId}/${generationId}/${i}.jpg`),
      ])
      if (!sourceUrl || !uploadUrl) throw new Error(`could not sign urls for slide ${i}`)

      const rendered = await deps.renderPost(sourceUrl, uploadUrl)
      if (!rendered) throw new Error(`render failed for slide ${i}`)
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
