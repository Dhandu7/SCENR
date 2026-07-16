import { test } from "node:test"
import assert from "node:assert/strict"
import { harvestTheme, pickLargestImageUrl, runApifyActor } from "./harvest.js"

test("pickLargestImageUrl picks the largest width entry", () => {
  const url = pickLargestImageUrl({ "236x": { url: "small.jpg" }, "736x": { url: "big.jpg" } })
  assert.equal(url, "big.jpg")
})

test("pickLargestImageUrl returns null for missing images", () => {
  assert.equal(pickLargestImageUrl(undefined), null)
  assert.equal(pickLargestImageUrl({}), null)
})

test("harvestTheme dedupes by id and drops pins with no image", async () => {
  const deps = {
    runApifyActor: async () => [
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "1", images: { "736x": { url: "a.jpg" } }, description: "a" },
      { id: "2", images: {}, description: "no image" },
      { id: "3", images: { "236x": { url: "c.jpg" } }, description: "c" },
    ],
  }
  const pins = await harvestTheme(deps, "test query", 80)
  assert.deepEqual(pins.map((p) => p.id), ["1", "3"])
})

test("harvestTheme passes query and maxItems through to runApifyActor", async () => {
  let capturedArgs
  const deps = {
    runApifyActor: async (query, maxItems) => {
      capturedArgs = { query, maxItems }
      return []
    },
  }
  await harvestTheme(deps, "golden hour", 80)
  assert.deepEqual(capturedArgs, { query: "golden hour", maxItems: 80 })
})

test("runApifyActor fetches the dataset immediately when the run starts SUCCEEDED", async () => {
  const deps = {
    startRun: async () => ({ id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1" }),
    pollRunStatus: async () => {
      throw new Error("should not poll when the run is already terminal")
    },
    fetchDatasetItems: async (datasetId) => {
      assert.equal(datasetId, "ds1")
      return [{ id: "p1" }]
    },
    sleep: async () => {
      throw new Error("should not sleep when the run is already terminal")
    },
    now: () => 0,
  }
  const items = await runApifyActor("query", 80, deps)
  assert.deepEqual(items, [{ id: "p1" }])
})

test("runApifyActor polls while RUNNING/READY, then fetches the dataset once SUCCEEDED", async () => {
  let pollCount = 0
  const deps = {
    startRun: async () => ({ id: "run1", status: "READY", defaultDatasetId: null }),
    pollRunStatus: async () => {
      pollCount += 1
      if (pollCount < 3) return { status: "RUNNING", defaultDatasetId: null }
      return { status: "SUCCEEDED", defaultDatasetId: "ds1" }
    },
    fetchDatasetItems: async (datasetId) => {
      assert.equal(datasetId, "ds1")
      return [{ id: "p1" }, { id: "p2" }]
    },
    sleep: async () => {},
    now: () => 0,
  }
  const items = await runApifyActor("query", 80, deps)
  assert.equal(pollCount, 3)
  assert.deepEqual(items, [{ id: "p1" }, { id: "p2" }])
})

test("runApifyActor throws when the run ends with a non-SUCCEEDED terminal status", async () => {
  const deps = {
    startRun: async () => ({ id: "run1", status: "RUNNING", defaultDatasetId: null }),
    pollRunStatus: async () => ({ status: "FAILED", defaultDatasetId: null }),
    fetchDatasetItems: async () => {
      throw new Error("should not fetch the dataset for a failed run")
    },
    sleep: async () => {},
    now: () => 0,
  }
  await assert.rejects(() => runApifyActor("query", 80, deps), /ended with status FAILED/)
})

test("runApifyActor throws when the deadline is exceeded before the run finishes", async () => {
  let time = 0
  const deps = {
    startRun: async () => ({ id: "run1", status: "RUNNING", defaultDatasetId: null }),
    pollRunStatus: async () => {
      time += 10 * 60 * 1000
      return { status: "RUNNING", defaultDatasetId: null }
    },
    fetchDatasetItems: async () => {
      throw new Error("should not fetch the dataset when the deadline is exceeded")
    },
    sleep: async () => {},
    now: () => time,
  }
  await assert.rejects(() => runApifyActor("query", 80, deps), /did not finish within/)
})
