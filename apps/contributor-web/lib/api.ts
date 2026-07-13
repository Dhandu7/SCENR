const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error ?? "request_failed")
  }
  return data as T
}

export interface JoinTripResponse {
  trip: { id: string; name: string; cover_image_url: string | null }
  session_token: string
  contributor_id: string
}

export function joinTrip(slug: string): Promise<JoinTripResponse> {
  return callFunction<JoinTripResponse>("join-trip", { slug })
}

export interface UploadRequestResponse {
  upload_url: string
  upload_token: string
  storage_path: string
  media_item_id: string
}

export function requestUpload(params: {
  sessionToken: string
  fileName: string
  contentType: string
  fileSize: number
}): Promise<UploadRequestResponse> {
  return callFunction<UploadRequestResponse>("contributor-upload", {
    session_token: params.sessionToken,
    file_name: params.fileName,
    content_type: params.contentType,
    file_size: params.fileSize,
  })
}
