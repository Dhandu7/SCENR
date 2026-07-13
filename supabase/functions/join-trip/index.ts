import { createClient } from "npm:@supabase/supabase-js@2"
import { handleJoinTrip, type JoinTripDeps, type TripSummary } from "./handler.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function buildDeps(): JoinTripDeps {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  return {
    async findTripBySlug(slug) {
      const { data } = await supabase
        .from("trips")
        .select("id, name, cover_image_url, archived_at")
        .eq("slug", slug)
        .maybeSingle()
      return (data as TripSummary) ?? null
    },
    async createContributor(tripId, sessionToken) {
      const { data } = await supabase
        .from("contributors")
        .insert({ trip_id: tripId, session_token: sessionToken })
        .select("id, session_token")
        .single()
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
  const sessionToken = crypto.randomUUID()
  const result = await handleJoinTrip(buildDeps(), body.slug, sessionToken)

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
