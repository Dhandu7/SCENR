import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { handleRankMedia, type RankMediaDeps, type RankMediaRequest } from "./handler.ts"
import { scorePhoto } from "./score-photo.ts"
import { embedPhoto } from "./embed-photo.ts"

function buildDeps(authHeader: string): RankMediaDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async verifyTripOwnership(tripId) {
      const { data } = await userClient.from("trips").select("id").eq("id", tripId).maybeSingle()
      return !!data
    },
    async listTripMedia(tripId) {
      const { data } = await supabase
        .from("media_items")
        .select("id, storage_path, quality_score, content_category, is_favourite, embedding")
        .eq("trip_id", tripId)
        .eq("type", "photo")
      return data ?? []
    },
    async createSignedUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },
    scoreMedia: (imageUrl) => scorePhoto(imageUrl),
    embedMedia: (imageUrl) => embedPhoto(imageUrl),
    async updateMediaCache(mediaItemId, patch) {
      await supabase.from("media_items").update(patch).eq("id", mediaItemId)
    },
    async getTheme(themeId) {
      const { data } = await supabase
        .from("theme_fingerprints")
        .select("composition_template, centroid_vec")
        .eq("theme_id", themeId)
        .maybeSingle()
      return data ?? null
    },
  }
}

serveJson<RankMediaRequest>((body, req) => {
  const authHeader = req.headers.get("authorization") ?? ""
  return handleRankMedia(buildDeps(authHeader), body)
})
