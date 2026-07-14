import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { supabase } from "../../lib/supabase"
import { computePoolCounts, filterMediaItems, type PoolFilter, type PoolMediaItem } from "../../lib/pool-filters"

type LiveStatus = "connecting" | "live" | "offline"

interface MediaRow extends PoolMediaItem {
  storage_path: string
  duration_seconds: number | null
  created_at: string
}

const FILTERS: { key: PoolFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "favourites", label: "★ Favourites" },
]

export default function PoolScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const [items, setItems] = useState<MediaRow[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting")
  const [filter, setFilter] = useState<PoolFilter>("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadSignedUrl = useCallback(async (storagePath: string) => {
    const { data } = await supabase.storage.from("trip-media").createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }, [])

  const loadSignedUrls = useCallback(async (rows: MediaRow[]) => {
    if (rows.length === 0) return {}
    const { data } = await supabase.storage
      .from("trip-media")
      .createSignedUrls(rows.map((row) => row.storage_path), 3600)
    if (!data) return {}
    const pathToId = new Map(rows.map((row) => [row.storage_path, row.id]))
    const result: Record<string, string> = {}
    for (const entry of data) {
      const id = pathToId.get(entry.path ?? "")
      if (id && entry.signedUrl) result[id] = entry.signedUrl
    }
    return result
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadInitial() {
      const { data, error } = await supabase
        .from("media_items")
        .select("id, type, storage_path, contributor_id, is_favourite, duration_seconds, created_at")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })

      if (!isMounted) return
      if (error || !data) {
        setErrorMessage(error?.message ?? "Could not load this trip's media.")
        setIsLoading(false)
        return
      }
      setItems(data as MediaRow[])
      setIsLoading(false)

      const urls = await loadSignedUrls(data as MediaRow[])
      if (!isMounted) return
      setSignedUrls(urls)
    }

    loadInitial()

    const channel = supabase
      .channel(`media_items:trip_id=eq.${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "media_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const newItem = payload.new as MediaRow
          setItems((current) => (current.some((item) => item.id === newItem.id) ? current : [newItem, ...current]))
          loadSignedUrl(newItem.storage_path).then((url) => {
            if (url) setSignedUrls((current) => ({ ...current, [newItem.id]: url }))
          })
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "media_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const updated = payload.new as MediaRow
          setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live")
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("offline")
        }
      })

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [tripId, loadSignedUrl, loadSignedUrls])

  const { itemCount, contributorCount } = useMemo(() => computePoolCounts(items), [items])
  const filteredItems = useMemo(() => filterMediaItems(items, filter), [items, filter])

  async function handleToggleFavourite(item: MediaRow) {
    const nextValue = !item.is_favourite
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, is_favourite: nextValue } : i)))
    const { error } = await supabase.from("media_items").update({ is_favourite: nextValue }).eq("id", item.id)
    if (error) {
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, is_favourite: item.is_favourite } : i)))
    }
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  let poolContent
  if (items.length === 0) {
    poolContent = (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No photos yet</Text>
        <Text style={styles.emptySubtitle}>Waiting for your group to add photos and videos.</Text>
      </View>
    )
  } else if (filteredItems.length === 0) {
    poolContent = (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptySubtitle}>No items match this filter.</Text>
      </View>
    )
  } else {
    poolContent = renderPoolGrid(filteredItems, signedUrls, handleToggleFavourite)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · {contributorCount} contributor
            {contributorCount === 1 ? "" : "s"}
          </Text>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, LIVE_STATUS_META[liveStatus].dotStyle]} />
            <Text style={styles.liveText}>{LIVE_STATUS_META[liveStatus].label}</Text>
          </View>
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {poolContent}
    </View>
  )
}

function renderPoolGrid(
  filteredItems: MediaRow[],
  signedUrls: Record<string, string>,
  handleToggleFavourite: (item: MediaRow) => void,
) {
  return (
    <FlatList
      data={filteredItems}
      numColumns={3}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => (
        <Pressable style={styles.tile} onPress={() => handleToggleFavourite(item)}>
          {signedUrls[item.id] ? (
            <Image source={{ uri: signedUrls[item.id] }} style={styles.tileImage} />
          ) : (
            <View style={styles.tileImage} />
          )}
          {item.type === "video" ? (
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>
                {item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : "▶"}
              </Text>
            </View>
          ) : null}
          <Text style={styles.favouriteStar}>{item.is_favourite ? "★" : "☆"}</Text>
        </Pressable>
      )}
    />
  )
}

const TILE_SIZE = 110

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  header: { padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerText: { fontSize: 14, color: "#51596A", fontWeight: "600" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveDotOn: { backgroundColor: "#16A34A" },
  liveDotOff: { backgroundColor: "#94A3B8" },
  liveDotOffline: { backgroundColor: "#DC2626" },
  liveText: { fontSize: 12, color: "#51596A" },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C3D0E8",
  },
  filterChipActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  filterChipText: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  filterChipTextActive: { color: "white" },
  grid: { paddingHorizontal: 12, gap: 4 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    margin: 2,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EEF2FB",
  },
  tileImage: { width: "100%", height: "100%" },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(11,18,32,0.7)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  videoBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  favouriteStar: { position: "absolute", top: 4, right: 4, fontSize: 16, color: "#FBBF24" },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
  error: { color: "#DC2626", textAlign: "center" },
})

const LIVE_STATUS_META: Record<LiveStatus, { dotStyle: object; label: string }> = {
  live: { dotStyle: styles.liveDotOn, label: "Live" },
  offline: { dotStyle: styles.liveDotOffline, label: "Offline" },
  connecting: { dotStyle: styles.liveDotOff, label: "Connecting…" },
}
