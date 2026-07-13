export const MAX_UPLOADS_PER_TRIP = 50
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export const ALLOWED_CONTENT_TYPES: Record<string, "photo" | "video"> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/heic": "photo",
  "image/webp": "photo",
  "video/mp4": "video",
  "video/quicktime": "video",
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "file"
}

export interface ContributorSummary {
  id: string
  trip_id: string
}

export interface SignedUpload {
  signedUrl: string
  token: string
}

export interface ContributorUploadDeps {
  findContributorByToken(sessionToken: string): Promise<ContributorSummary | null>
  countMediaItems(tripId: string): Promise<number>
  createSignedUploadUrl(path: string): Promise<SignedUpload | null>
  createMediaItem(row: {
    trip_id: string
    contributor_id: string
    type: "photo" | "video"
    storage_path: string
  }): Promise<{ id: string } | null>
}

export interface UploadRequest {
  session_token?: string
  file_name?: string
  content_type?: string
  file_size?: number
}

export interface UploadResult {
  status: number
  body: Record<string, unknown>
}

export async function handleContributorUpload(
  deps: ContributorUploadDeps,
  req: UploadRequest,
  generateId: () => string,
): Promise<UploadResult> {
  const { session_token, file_name, content_type, file_size } = req

  if (!session_token || !file_name || !content_type || typeof file_size !== "number") {
    return { status: 400, body: { error: "missing_fields" } }
  }

  const mediaType = ALLOWED_CONTENT_TYPES[content_type]
  if (!mediaType) {
    return { status: 400, body: { error: "unsupported_content_type" } }
  }
  if (file_size > MAX_FILE_SIZE_BYTES) {
    return { status: 400, body: { error: "file_too_large" } }
  }

  const contributor = await deps.findContributorByToken(session_token)
  if (!contributor) {
    return { status: 401, body: { error: "invalid_session_token" } }
  }

  const existingCount = await deps.countMediaItems(contributor.trip_id)
  if (existingCount >= MAX_UPLOADS_PER_TRIP) {
    return { status: 403, body: { error: "upload_cap_reached" } }
  }

  const storagePath = `${contributor.trip_id}/${generateId()}-${sanitizeFileName(file_name)}`
  const signedUpload = await deps.createSignedUploadUrl(storagePath)
  if (!signedUpload) {
    return { status: 500, body: { error: "storage_signing_failed" } }
  }

  const mediaItem = await deps.createMediaItem({
    trip_id: contributor.trip_id,
    contributor_id: contributor.id,
    type: mediaType,
    storage_path: storagePath,
  })
  if (!mediaItem) {
    return { status: 500, body: { error: "media_item_create_failed" } }
  }

  return {
    status: 200,
    body: {
      upload_url: signedUpload.signedUrl,
      upload_token: signedUpload.token,
      storage_path: storagePath,
      media_item_id: mediaItem.id,
    },
  }
}
