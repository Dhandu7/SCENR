import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { findContributorByToken } from "../_shared/contributors.ts"
import {
  handleContributorUpload,
  type ContributorUploadDeps,
  type UploadRequest,
} from "./handler.ts"

function buildDeps(): ContributorUploadDeps {
  const supabase = getServiceClient()

  return {
    findContributorByToken: (sessionToken) => findContributorByToken(supabase, sessionToken),
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
  }
}

serveJson<UploadRequest>((body) =>
  handleContributorUpload(buildDeps(), body, () => crypto.randomUUID())
)
