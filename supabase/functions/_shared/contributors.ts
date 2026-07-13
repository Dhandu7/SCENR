import { type SupabaseClient } from "npm:@supabase/supabase-js@2"

export interface ContributorSummary {
  id: string
  trip_id: string
}

// Look up an appless contributor by their session token. Shared by
// contributor-upload and confirm-upload, which both key their write path off
// the token minted by join-trip.
export async function findContributorByToken(
  supabase: SupabaseClient,
  sessionToken: string,
): Promise<ContributorSummary | null> {
  const { data } = await supabase
    .from("contributors")
    .select("id, trip_id")
    .eq("session_token", sessionToken)
    .maybeSingle()
  return (data as ContributorSummary) ?? null
}
