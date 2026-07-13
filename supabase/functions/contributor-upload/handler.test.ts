import { assertEquals } from "jsr:@std/assert@1"
import {
  handleContributorUpload,
  MAX_UPLOADS_PER_TRIP,
  type ContributorUploadDeps,
} from "./handler.ts"

function baseDeps(overrides: Partial<ContributorUploadDeps> = {}): ContributorUploadDeps {
  return {
    findContributorByToken: async () => ({ id: "c1", trip_id: "t1" }),
    countMediaItems: async () => 0,
    createSignedUploadUrl: async (path) => ({ signedUrl: `https://signed/${path}`, token: "tok" }),
    createMediaItem: async () => ({ id: "m1" }),
    ...overrides,
  }
}

Deno.test("returns 400 when required fields are missing", async () => {
  const result = await handleContributorUpload(baseDeps(), {}, () => "id1")
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "missing_fields")
})

Deno.test("returns 400 for an unsupported content type", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.gif", content_type: "image/gif", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "unsupported_content_type")
})

Deno.test("returns 400 when the file exceeds the size cap", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 51 * 1024 * 1024 },
    () => "id1",
  )
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "file_too_large")
})

Deno.test("returns 401 for an invalid session token", async () => {
  const result = await handleContributorUpload(
    baseDeps({ findContributorByToken: async () => null }),
    { session_token: "bad", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 401)
  assertEquals(result.body.error, "invalid_session_token")
})

Deno.test("returns 403 when the trip has reached its upload cap", async () => {
  const result = await handleContributorUpload(
    baseDeps({ countMediaItems: async () => MAX_UPLOADS_PER_TRIP }),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 403)
  assertEquals(result.body.error, "upload_cap_reached")
})

Deno.test("returns a signed upload URL and creates a media item on success", async () => {
  const result = await handleContributorUpload(
    baseDeps(),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "generated-id",
  )
  assertEquals(result.status, 200)
  assertEquals(result.body, {
    upload_url: "https://signed/t1/generated-id-a.jpg",
    upload_token: "tok",
    storage_path: "t1/generated-id-a.jpg",
    media_item_id: "m1",
  })
})

Deno.test("returns 500 when signing the upload URL fails", async () => {
  const result = await handleContributorUpload(
    baseDeps({ createSignedUploadUrl: async () => null }),
    { session_token: "s1", file_name: "a.jpg", content_type: "image/jpeg", file_size: 100 },
    () => "id1",
  )
  assertEquals(result.status, 500)
  assertEquals(result.body.error, "storage_signing_failed")
})
