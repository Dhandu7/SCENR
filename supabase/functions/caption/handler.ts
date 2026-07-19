import { summarizeCategories } from "./summarize.ts"
import type { CaptionInput } from "./caption-writer.ts"

export interface OwnedGeneration {
  trip_id: string
  theme_id: string | null
  selection: { media_item_id: string }[]
}

export interface CaptionDeps {
  // RLS-scoped read: returns the generation only if the caller owns its trip, else null.
  getOwnedGeneration(generationId: string): Promise<OwnedGeneration | null>
  getTripName(tripId: string): Promise<string | null>
  getThemeDisplayName(themeId: string | null): Promise<string | null>
  getSelectionCategories(mediaItemIds: string[]): Promise<string[]>
  writeCaption(input: CaptionInput): Promise<string>
  saveCaption(generationId: string, caption: string, mode: "generated" | "custom"): Promise<void>
}

export interface CaptionRequest {
  generation_id?: string
  custom_text?: string
}

export interface CaptionResult {
  status: number
  body: Record<string, unknown>
}

export async function handleCaption(deps: CaptionDeps, req: CaptionRequest): Promise<CaptionResult> {
  const { generation_id, custom_text } = req
  if (!generation_id) return { status: 400, body: { error: "missing_generation_id" } }

  const generation = await deps.getOwnedGeneration(generation_id)
  if (!generation) return { status: 403, body: { error: "not_generation_owner" } }

  // Write-your-own: persist the user's text verbatim, no model call.
  if (typeof custom_text === "string") {
    const text = custom_text.trim()
    if (!text) return { status: 400, body: { error: "empty_caption" } }
    await deps.saveCaption(generation_id, text, "custom")
    return { status: 200, body: { caption: text, caption_mode: "custom" } }
  }

  // Generate from content.
  const mediaItemIds = generation.selection?.map((s) => s.media_item_id) ?? []
  const [tripName, themeName, categories] = await Promise.all([
    deps.getTripName(generation.trip_id),
    deps.getThemeDisplayName(generation.theme_id),
    deps.getSelectionCategories(mediaItemIds),
  ])

  const caption = await deps.writeCaption({
    tripName: tripName ?? "our trip",
    themeName,
    categorySummary: summarizeCategories(categories),
    slideCount: mediaItemIds.length,
  })
  await deps.saveCaption(generation_id, caption, "generated")
  return { status: 200, body: { caption, caption_mode: "generated" } }
}
