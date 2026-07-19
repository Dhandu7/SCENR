import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { handleCaption, type CaptionDeps, type CaptionRequest } from "./handler.ts"
import { writeCaption } from "./caption-writer.ts"

function buildDeps(authHeader: string): CaptionDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async getOwnedGeneration(generationId) {
      // RLS on generations scopes SELECT to the owner, so a hit means the caller owns it.
      const { data } = await userClient
        .from("generations")
        .select("trip_id, theme_id, selection")
        .eq("id", generationId)
        .maybeSingle()
      if (!data) return null
      return {
        trip_id: data.trip_id,
        theme_id: data.theme_id ?? null,
        selection: Array.isArray(data.selection) ? data.selection : [],
      }
    },
    async getTripName(tripId) {
      const { data } = await supabase.from("trips").select("name").eq("id", tripId).maybeSingle()
      return data?.name ?? null
    },
    async getThemeDisplayName(themeId) {
      if (!themeId) return null
      const { data } = await supabase.from("theme_fingerprints").select("display_name").eq("theme_id", themeId).maybeSingle()
      return data?.display_name ?? null
    },
    async getSelectionCategories(mediaItemIds) {
      if (mediaItemIds.length === 0) return []
      const { data } = await supabase.from("media_items").select("content_category").in("id", mediaItemIds)
      return (data ?? []).map((r) => r.content_category).filter((c): c is string => !!c)
    },
    writeCaption: (input) => writeCaption(input),
    async saveCaption(generationId, caption, mode) {
      await supabase.from("generations").update({ caption, caption_mode: mode }).eq("id", generationId)
    },
  }
}

serveJson<CaptionRequest>((body, req) => {
  const authHeader = req.headers.get("authorization") ?? ""
  return handleCaption(buildDeps(authHeader), body)
})
