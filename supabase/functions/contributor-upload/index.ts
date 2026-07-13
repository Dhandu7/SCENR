import { createClient } from "npm:@supabase/supabase-js@2"
import { handleContributorUpload, type ContributorUploadDeps } from "./handler.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function buildDeps(): ContributorUploadDeps {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  return {
    async findContributorByToken(sessionToken) {
      const { data } = await supabase
        .from("contributors")
        .select("id, trip_id")
        .eq("session_token", sessionToken)
        .maybeSingle()
      return data ?? null
    },
    async countMediaItems(tripId) {
      const { count } = await supabase
        .from("media_items")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
      return count ?? 0
    },
    async createSignedUploadUrl(path) {
      const { data } = await supabase.storage.from("trip-media").createSignedUploadUrl(path)
      return data ? { signedUrl: data.signedUrl, token: data.token } : null
    },
    async createMediaItem(row) {
      const { data } = await supabase.from("media_items").insert(row).select("id").single()
      return data ?? null
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const body = await req.json().catch(() => ({}))
  const result = await handleContributorUpload(buildDeps(), body, () => crypto.randomUUID())

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
