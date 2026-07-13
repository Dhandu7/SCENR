import { getServiceClient } from "../_shared/supabase-client.ts"
import { serveJson } from "../_shared/serve-json.ts"
import { findContributorByToken } from "../_shared/contributors.ts"
import {
  handleConfirmUpload,
  type ConfirmUploadDeps,
  type ConfirmUploadRequest,
} from "./handler.ts"

function buildDeps(): ConfirmUploadDeps {
  const supabase = getServiceClient()

  return {
    findContributorByToken: (sessionToken) => findContributorByToken(supabase, sessionToken),
    async createMediaItem(row) {
      const { data } = await supabase.from("media_items").insert(row).select("id").single()
      return data ?? null
    },
  }
}

serveJson<ConfirmUploadRequest>((body) => handleConfirmUpload(buildDeps(), body))
