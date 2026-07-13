import { ALLOWED_CONTENT_TYPES } from "../_shared/content-types.ts"

export interface ContributorSummary {
  id: string
  trip_id: string
}

export interface ConfirmUploadDeps {
  findContributorByToken(sessionToken: string): Promise<ContributorSummary | null>
  createMediaItem(row: {
    trip_id: string
    contributor_id: string
    type: "photo" | "video"
    storage_path: string
  }): Promise<{ id: string } | null>
}

export interface ConfirmUploadRequest {
  session_token?: string
  storage_path?: string
  content_type?: string
}

export interface ConfirmUploadResult {
  status: number
  body: Record<string, unknown>
}

export async function handleConfirmUpload(
  deps: ConfirmUploadDeps,
  req: ConfirmUploadRequest,
): Promise<ConfirmUploadResult> {
  const { session_token, storage_path, content_type } = req

  if (!session_token || !storage_path || !content_type) {
    return { status: 400, body: { error: "missing_fields" } }
  }

  const mediaType = ALLOWED_CONTENT_TYPES[content_type]
  if (!mediaType) {
    return { status: 400, body: { error: "unsupported_content_type" } }
  }

  const contributor = await deps.findContributorByToken(session_token)
  if (!contributor) {
    return { status: 401, body: { error: "invalid_session_token" } }
  }

  if (!storage_path.startsWith(`${contributor.trip_id}/`)) {
    return { status: 403, body: { error: "storage_path_mismatch" } }
  }

  const mediaItem = await deps.createMediaItem({
    trip_id: contributor.trip_id,
    contributor_id: contributor.id,
    type: mediaType,
    storage_path,
  })
  if (!mediaItem) {
    return { status: 500, body: { error: "media_item_create_failed" } }
  }

  return { status: 200, body: { media_item_id: mediaItem.id } }
}
