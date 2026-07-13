export interface TripSummary {
  id: string
  name: string
  cover_image_url: string | null
  archived_at: string | null
}

export interface JoinTripDeps {
  findTripBySlug(slug: string): Promise<TripSummary | null>
  createContributor(
    tripId: string,
    sessionToken: string,
  ): Promise<{ id: string; session_token: string } | null>
}

export interface JoinTripResult {
  status: number
  body: Record<string, unknown>
}

export async function handleJoinTrip(
  deps: JoinTripDeps,
  slug: string | undefined,
  sessionToken: string,
): Promise<JoinTripResult> {
  if (!slug || slug.trim() === "") {
    return { status: 400, body: { error: "missing_slug" } }
  }

  const trip = await deps.findTripBySlug(slug)
  if (!trip || trip.archived_at) {
    return { status: 404, body: { error: "trip_not_found" } }
  }

  const contributor = await deps.createContributor(trip.id, sessionToken)
  if (!contributor) {
    return { status: 500, body: { error: "contributor_create_failed" } }
  }

  return {
    status: 200,
    body: {
      trip: { id: trip.id, name: trip.name, cover_image_url: trip.cover_image_url },
      session_token: contributor.session_token,
      contributor_id: contributor.id,
    },
  }
}
