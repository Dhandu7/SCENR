import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

let client: SupabaseClient | null = null

// Lazily construct a single service-role client per isolate. The edge
// functions all use the static service-role key (never a per-request JWT),
// so one client can be shared across every request the warm isolate serves,
// rather than rebuilding the client graph on each invocation.
export function getServiceClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
  }
  return client
}
