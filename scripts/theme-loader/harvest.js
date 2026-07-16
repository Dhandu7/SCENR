const ACTOR_ID = "epctex~pinterest-scraper"
const APIFY_RUNS_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`
const POLL_INTERVAL_MS = 5000
const MAX_POLL_MS = 35 * 60 * 1000 // 35 minutes; observed range is ~17-20 min for most themes, but one run exceeded the prior 20-min cap

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

// The `run-sync-get-dataset-items` endpoint enforces a hard 300s limit on the
// synchronous HTTP connection (Apify returns 408 past that, or the connection
// can stall without a clean response). This actor takes ~15-20 min to harvest
// 80 pins, well past that ceiling, so we use the async run+poll pattern instead:
// start the run, poll its status, then fetch the dataset once it succeeds.
export async function runApifyActor(query, maxItems) {
  const startResponse = await fetch(APIFY_RUNS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ search: query, maxItems, proxy: { useApifyProxy: true } }),
  })
  if (!startResponse.ok) {
    throw new Error(`Apify run start failed: ${startResponse.status} ${await startResponse.text()}`)
  }
  const { data: startedRun } = await startResponse.json()
  const runId = startedRun.id

  const deadline = Date.now() + MAX_POLL_MS
  let status = startedRun.status
  let datasetId = startedRun.defaultDatasetId
  while (status === "READY" || status === "RUNNING") {
    if (Date.now() > deadline) {
      throw new Error(`Apify run ${runId} did not finish within ${MAX_POLL_MS / 1000}s`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const pollResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
    })
    if (!pollResponse.ok) {
      throw new Error(`Apify run poll failed: ${pollResponse.status} ${await pollResponse.text()}`)
    }
    const polled = (await pollResponse.json()).data
    status = polled.status
    datasetId = polled.defaultDatasetId
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ${runId} ended with status ${status}`)
  }

  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`, {
    headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
  })
  if (!itemsResponse.ok) {
    throw new Error(`Apify dataset fetch failed: ${itemsResponse.status} ${await itemsResponse.text()}`)
  }
  return itemsResponse.json()
}
