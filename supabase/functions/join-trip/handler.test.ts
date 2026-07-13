import { assertEquals } from "jsr:@std/assert@1"
import { handleJoinTrip, type JoinTripDeps, type TripSummary } from "./handler.ts"

Deno.test("returns 400 when slug is missing", async () => {
  const deps: JoinTripDeps = {
    findTripBySlug: () => { throw new Error("should not be called") },
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, undefined, "token-1")
  assertEquals(result.status, 400)
  assertEquals(result.body.error, "missing_slug")
})

Deno.test("returns 404 when trip does not exist", async () => {
  const deps: JoinTripDeps = {
    findTripBySlug: async () => null,
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 404)
  assertEquals(result.body.error, "trip_not_found")
})

Deno.test("returns 404 when trip is archived", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: null, archived_at: "2026-01-01T00:00:00Z" }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: () => { throw new Error("should not be called") },
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 404)
})

Deno.test("creates a contributor and returns trip info on success", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: "https://x/y.jpg", archived_at: null }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: async (_tripId, token) => ({ id: "c1", session_token: token }),
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 200)
  assertEquals(result.body, {
    trip: { id: "t1", name: "Bali", cover_image_url: "https://x/y.jpg" },
    session_token: "token-1",
    contributor_id: "c1",
  })
})

Deno.test("returns 500 when contributor insert fails", async () => {
  const trip: TripSummary = { id: "t1", name: "Bali", cover_image_url: null, archived_at: null }
  const deps: JoinTripDeps = {
    findTripBySlug: async () => trip,
    createContributor: async () => null,
  }
  const result = await handleJoinTrip(deps, "bali-trip-7x", "token-1")
  assertEquals(result.status, 500)
  assertEquals(result.body.error, "contributor_create_failed")
})
