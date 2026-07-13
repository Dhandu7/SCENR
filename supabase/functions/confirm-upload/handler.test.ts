import { assertEquals } from "jsr:@std/assert@1"
import { handleConfirmUpload, type ConfirmUploadDeps } from "./handler.ts"

function baseDeps(overrides: Partial<ConfirmUploadDeps> = {}): ConfirmUploadDeps {
  return {
    findContributorByToken: async () => ({ id: "c1", trip_id: "t1" }),
    createMediaItem: async () => ({ id: "m1" }),
    ...overrides,
  }
}

Deno.test("returns 400 when required fields are missing", async () => {
  const result = await handleConfirmUpload(baseDeps(), {})
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "missing_fields")
})

Deno.test("returns 400 for an unsupported content type", async () => {
  const result = await handleConfirmUpload(baseDeps(), {
    session_token: "s1",
    storage_path: "t1/x.gif",
    content_type: "image/gif",
  })
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "unsupported_content_type")
})

Deno.test("returns 401 for an invalid session token", async () => {
  const result = await handleConfirmUpload(
    baseDeps({ findContributorByToken: async () => null }),
    { session_token: "bad", storage_path: "t1/x.jpg", content_type: "image/jpeg" },
  )
  assertEquals(result.status, 401)
  assertEquals(result.body.error, "invalid_session_token")
})

Deno.test("returns 403 when storage_path does not belong to the contributor's trip", async () => {
  const result = await handleConfirmUpload(baseDeps(), {
    session_token: "s1",
    storage_path: "other-trip/x.jpg",
    content_type: "image/jpeg",
  })
  assertEquals(result.status, 403)
  assertEquals(result.body.error, "storage_path_mismatch")
})

Deno.test("creates the media item and returns its id on success", async () => {
  const result = await handleConfirmUpload(baseDeps(), {
    session_token: "s1",
    storage_path: "t1/x.jpg",
    content_type: "image/jpeg",
  })
  assertEquals(result.status, 200)
  assertEquals(result.body, { media_item_id: "m1" })
})

Deno.test("returns 500 when media item creation fails", async () => {
  const result = await handleConfirmUpload(
    baseDeps({ createMediaItem: async () => null }),
    { session_token: "s1", storage_path: "t1/x.jpg", content_type: "image/jpeg" },
  )
  assertEquals(result.status, 500)
  assertEquals(result.body.error, "media_item_create_failed")
})
