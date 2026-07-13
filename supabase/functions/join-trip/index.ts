import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { handleJoinTrip, type JoinTripDeps, type TripSummary } from "./handler.ts"

function buildDeps(): JoinTripDeps {
  const supabase = getServiceClient()

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

serveJson<{ slug?: string }>((body) =>
  handleJoinTrip(buildDeps(), body.slug, crypto.randomUUID())
)
