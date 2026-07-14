import { filterMediaItems, computePoolCounts, type PoolMediaItem } from "./pool-filters"

const items: PoolMediaItem[] = [
  { id: "1", type: "photo", is_favourite: false, contributor_id: "c1" },
  { id: "2", type: "video", is_favourite: true, contributor_id: "c1" },
  { id: "3", type: "photo", is_favourite: true, contributor_id: "c2" },
]

describe("filterMediaItems", () => {
  it("returns all items for 'all'", () => {
    expect(filterMediaItems(items, "all")).toHaveLength(3)
  })

  it("returns only photos for 'photos'", () => {
    expect(filterMediaItems(items, "photos").map((i) => i.id)).toEqual(["1", "3"])
  })

  it("returns only videos for 'videos'", () => {
    expect(filterMediaItems(items, "videos").map((i) => i.id)).toEqual(["2"])
  })

  it("returns only favourites for 'favourites'", () => {
    expect(filterMediaItems(items, "favourites").map((i) => i.id)).toEqual(["2", "3"])
  })
})

describe("computePoolCounts", () => {
  it("counts items and distinct contributors", () => {
    expect(computePoolCounts(items)).toEqual({ itemCount: 3, contributorCount: 2 })
  })

  it("does not count a null contributor_id as a contributor", () => {
    const withNull: PoolMediaItem[] = [
      ...items,
      { id: "4", type: "photo", is_favourite: false, contributor_id: null },
    ]
    expect(computePoolCounts(withNull)).toEqual({ itemCount: 4, contributorCount: 2 })
  })
})
