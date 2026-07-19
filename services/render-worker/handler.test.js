import { test } from "node:test"
import assert from "node:assert/strict"
import { handleRender } from "./handler.js"

function baseDeps(overrides = {}) {
  return {
    fetchImage: async () => Buffer.from("fake"),
    compose: async (buf) => Buffer.concat([buf, Buffer.from("-c")]),
    uploadImage: async () => true,
    ...overrides,
  }
}

test("400 when source_url/upload_url missing", async () => {
  assert.equal((await handleRender(baseDeps(), {})).status, 400)
})
test("502 when source fetch fails", async () => {
  const d = baseDeps({ fetchImage: async () => { throw new Error("404") } })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 502)
})
test("500 when compositing fails", async () => {
  const d = baseDeps({ compose: async () => { throw new Error("bad") } })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 500)
})
test("502 when upload fails", async () => {
  const d = baseDeps({ uploadImage: async () => false })
  assert.equal((await handleRender(d, { source_url: "a", upload_url: "b" })).status, 502)
})
test("200 on the happy path", async () => {
  const r = await handleRender(baseDeps(), { source_url: "a", upload_url: "b" })
  assert.equal(r.status, 200)
  assert.equal(r.body.success, true)
})
test("forwards the grade from the request to compose", async () => {
  let received
  const deps = baseDeps({ compose: async (buf, grade) => { received = grade; return buf } })
  await handleRender(deps, { source_url: "a", upload_url: "b", grade: { brightness: 1.1, saturation: 1.2 } })
  assert.deepEqual(received, { brightness: 1.1, saturation: 1.2 })
})

test("no auth check when no secret is configured (local dev stays unauthenticated)", async () => {
  const d = baseDeps({ expectedSecret: undefined })
  const r = await handleRender(d, { source_url: "a", upload_url: "b" }, undefined)
  assert.equal(r.status, 200)
})
test("401 when a secret is configured and the request provides none", async () => {
  const d = baseDeps({ expectedSecret: "s3cret" })
  const r = await handleRender(d, { source_url: "a", upload_url: "b" }, undefined)
  assert.equal(r.status, 401)
  assert.equal(r.body.success, false)
})
test("401 when a secret is configured and the provided one doesn't match", async () => {
  const d = baseDeps({ expectedSecret: "s3cret" })
  const r = await handleRender(d, { source_url: "a", upload_url: "b" }, "wrong")
  assert.equal(r.status, 401)
})
test("200 when a secret is configured and the provided one matches", async () => {
  const d = baseDeps({ expectedSecret: "s3cret" })
  const r = await handleRender(d, { source_url: "a", upload_url: "b" }, "s3cret")
  assert.equal(r.status, 200)
})
