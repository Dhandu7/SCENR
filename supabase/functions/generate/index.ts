import { createClient } from "npm:@supabase/supabase-js@2"
import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { handleGenerate, type GenerateDeps, type GenerateRequest } from "./handler.ts"

const RENDER_WORKER_URL = Deno.env.get("RENDER_WORKER_URL") ?? "http://localhost:8787"

function buildDeps(authHeader: string): GenerateDeps {
  const supabase = getServiceClient()
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  return {
    async verifyMediaBelongToTrip(mediaItemIds, tripId) {
      // RLS scopes media_items SELECT to trips the caller owns. A row count equal
      // to the id count means every id exists AND is in a trip the caller owns.
      const { data } = await userClient
        .from("media_items")
        .select("id")
        .eq("trip_id", tripId)
        .in("id", mediaItemIds)
      return (data?.length ?? 0) === mediaItemIds.length
    },
    async createGeneration(tripId, themeId, type) {
      const { data } = await supabase
        .from("generations")
        .insert({ trip_id: tripId, type, theme_id: themeId, watermark: false })
        .select("id")
        .single()
      return data ?? null
    },
    async updateGeneration(id, patch) {
      await supabase.from("generations").update(patch).eq("id", id)
    },
    async getMediaStoragePath(mediaItemId) {
      const { data } = await supabase.from("media_items").select("storage_path").eq("id", mediaItemId).maybeSingle()
      return data?.storage_path ?? null
    },
    async createSignedUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },
    async createSignedUploadUrl(path) {
      const { data } = await supabase.storage.from("renders").createSignedUploadUrl(path)
      return data?.signedUrl ?? null
    },
    async renderPost(sourceUrl, uploadUrl) {
      const response = await fetch(`${RENDER_WORKER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, upload_url: uploadUrl }),
      })
      if (!response.ok) return false
      const body = await response.json().catch(() => ({ success: false }))
      return body.success === true
    },
    waitUntil(promise) {
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<void>): void } }).EdgeRuntime
      if (runtime) runtime.waitUntil(promise)
      else promise.catch(() => {})
    },
  }
}

serveJson<GenerateRequest>((body, req) => {
  const authHeader = req.headers.get("authorization") ?? ""
  return handleGenerate(buildDeps(authHeader), body)
})
