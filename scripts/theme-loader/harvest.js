const APIFY_RUN_URL =
  "https://api.apify.com/v2/actors/epctex~pinterest-scraper/run-sync-get-dataset-items"

export function pickLargestImageUrl(images) {
  if (!images || typeof images !== "object") return null
  const entries = Object.entries(images)
  if (entries.length === 0) return null
  entries.sort((a, b) => (parseInt(b[0], 10) || 0) - (parseInt(a[0], 10) || 0))
  return entries[0][1]?.url ?? null
}

export async function harvestTheme(deps, query, maxItems) {
  const rawPins = await deps.runApifyActor(query, maxItems)
  const seen = new Set()
  const pins = []
  for (const raw of rawPins) {
    if (!raw.id || seen.has(raw.id)) continue
    const imageUrl = pickLargestImageUrl(raw.images)
    if (!imageUrl) continue
    seen.add(raw.id)
    pins.push({ id: raw.id, imageUrl, description: raw.description ?? "" })
  }
  return pins
}

export async function runApifyActor(query, maxItems) {
  const response = await fetch(APIFY_RUN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ search: query, maxItems, proxy: { useApifyProxy: true } }),
  })
  if (!response.ok) {
    throw new Error(`Apify request failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}
