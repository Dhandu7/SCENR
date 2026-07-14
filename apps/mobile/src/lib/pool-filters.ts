export type PoolFilter = "all" | "photos" | "videos" | "favourites"

export interface PoolMediaItem {
  id: string
  type: "photo" | "video"
  is_favourite: boolean
  contributor_id: string | null
}

export function filterMediaItems<T extends PoolMediaItem>(items: T[], filter: PoolFilter): T[] {
  switch (filter) {
    case "photos":
      return items.filter((item) => item.type === "photo")
    case "videos":
      return items.filter((item) => item.type === "video")
    case "favourites":
      return items.filter((item) => item.is_favourite)
    case "all":
    default:
      return items
  }
}

export function computePoolCounts(items: PoolMediaItem[]): { itemCount: number; contributorCount: number } {
  const contributorIds = new Set<string>()
  for (const item of items) {
    if (item.contributor_id) contributorIds.add(item.contributor_id)
  }
  return { itemCount: items.length, contributorCount: contributorIds.size }
}
