import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { handleConfirmUpload, type ConfirmUploadDeps } from "./handler.ts"

function buildDeps(): ConfirmUploadDeps {
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
  const result = await handleConfirmUpload(buildDeps(), body)

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
