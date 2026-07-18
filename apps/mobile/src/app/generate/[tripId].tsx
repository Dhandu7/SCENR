import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import Slider from "@react-native-community/slider"
import { supabase } from "../../lib/supabase"

interface ThemeOption { theme_id: string; display_name: string }
interface ScoredMedia {
  media_item_id: string
  storage_path: string
  quality_score: number
  is_favourite: boolean
  content_category: string
  theme_fit: number | null
}
interface Slot extends ScoredMedia { reserved: boolean }
interface RankResult { slots: Slot[]; bench: ScoredMedia[]; slide_count: number }

const MIN_SLIDES = 1
const MAX_SLIDES = 20
const DEFAULT_SLIDES = 9

export default function GenerateScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const router = useRouter()
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [bench, setBench] = useState<ScoredMedia[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.from("theme_fingerprints").select("theme_id, display_name").order("theme_id").then(({ data }) => {
      if (mounted && data) setThemes(data as ThemeOption[])
    })
    return () => { mounted = false }
  }, [])

  // Lazily resolve signed thumbnail URLs for whatever storage paths are on screen.
  async function ensureUrls(items: { media_item_id: string; storage_path: string }[]) {
    const missing = items.filter((i) => !urls[i.media_item_id])
    if (missing.length === 0) return
    const { data } = await supabase.storage.from("trip-media").createSignedUrls(missing.map((i) => i.storage_path), 3600)
    if (!data) return
    const pathToId = new Map(missing.map((i) => [i.storage_path, i.media_item_id]))
    setUrls((cur) => {
      const next = { ...cur }
      for (const entry of data) {
        const id = pathToId.get(entry.path ?? "")
        if (id && entry.signedUrl) next[id] = entry.signedUrl
      }
      return next
    })
  }

  useEffect(() => {
    if (slots) ensureUrls([...slots, ...bench])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bench])

  const recommended = slideCount >= 7 && slideCount <= 12

  async function handleFindShots() {
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<RankResult>("rank-media", {
      body: { trip_id: tripId, slide_count: slideCount, theme_id: selectedThemeId },
    })
    setBusy(false)
    if (error || !data) { setErrorMessage(error?.message ?? "Couldn't build a selection."); return }
    setSlots(data.slots)
    setBench(data.bench)
  }

  function handleSwap(index: number) {
    if (!slots || bench.length === 0) return
    const incoming = bench[0]
    const outgoing = slots[index]
    const nextSlots = [...slots]
    nextSlots[index] = { ...incoming, reserved: false }
    setSlots(nextSlots)
    // Cycle the swapped-out photo to the back of the bench so it stays reachable.
    setBench([...bench.slice(1), { ...outgoing }])
  }

  async function handleGenerate() {
    if (!slots) return
    setBusy(true)
    setErrorMessage(null)
    const { data, error } = await supabase.functions.invoke<{ generation_id: string }>("generate", {
      body: { trip_id: tripId, theme_id: selectedThemeId, media_item_ids: slots.map((s) => s.media_item_id) },
    })
    if (error || !data) { setErrorMessage(error?.message ?? "Could not start generation."); setBusy(false); return }
    router.replace(`/generating/${data.generation_id}`)
  }

  // Preview phase
  if (slots) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your {slots.length === 1 ? "post" : "carousel"}</Text>
        <Text style={styles.hint}>{slots.length} slide{slots.length === 1 ? "" : "s"} · tap a slide to swap it</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstrip}>
          {slots.map((slot, index) => (
            <View key={`${slot.media_item_id}-${index}`} style={styles.slideWrap}>
              {urls[slot.media_item_id] ? (
                <Image source={{ uri: urls[slot.media_item_id] }} style={styles.slide} />
              ) : (
                <View style={[styles.slide, styles.slidePlaceholder]}><ActivityIndicator /></View>
              )}
              {slot.reserved ? (
                <Text style={styles.reservedBadge}>★</Text>
              ) : (
                <Pressable style={styles.swapBadge} onPress={() => handleSwap(index)} disabled={bench.length === 0}>
                  <Text style={styles.swapBadgeText}>{bench.length === 0 ? "—" : "swap"}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={handleGenerate} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Generate ✦</Text>}
        </Pressable>
      </View>
    )
  }

  // Setup phase
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create something</Text>

      <Text style={styles.sectionLabel}>Theme</Text>
      <View style={styles.row}>
        {themes.map((theme) => (
          <Pressable
            key={theme.theme_id}
            style={[styles.chip, selectedThemeId === theme.theme_id && styles.chipActive]}
            onPress={() => setSelectedThemeId(theme.theme_id)}
          >
            <Text style={[styles.chipText, selectedThemeId === theme.theme_id && styles.chipTextActive]}>
              {theme.display_name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Slides: {slideCount}{recommended ? "  ✓ recommended" : ""}</Text>
      <Slider
        minimumValue={MIN_SLIDES}
        maximumValue={MAX_SLIDES}
        step={1}
        value={slideCount}
        onValueChange={setSlideCount}
        minimumTrackTintColor="#1D4ED8"
      />
      <Text style={styles.note}>
        {slideCount <= 2
          ? "Fewer slides means the theme has less to work with — 7–12 shows it off best."
          : "7–12 slides gives the theme the most to work with."}
      </Text>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleFindShots} disabled={busy}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Find my best shots →</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  hint: { fontSize: 13, color: "#51596A" },
  sectionLabel: { fontSize: 12, color: "#8892A6", fontWeight: "700", textTransform: "uppercase", marginTop: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: "#C3D0E8" },
  chipActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  chipText: { color: "#1D4ED8", fontWeight: "600" },
  chipTextActive: { color: "white" },
  note: { fontSize: 12, color: "#8892A6" },
  filmstrip: { gap: 10, paddingVertical: 8 },
  slideWrap: { width: 160, height: 160, borderRadius: 12, overflow: "hidden", backgroundColor: "#EEF2FB" },
  slide: { width: "100%", height: "100%" },
  slidePlaceholder: { alignItems: "center", justifyContent: "center" },
  reservedBadge: { position: "absolute", top: 6, right: 8, fontSize: 20, color: "#FBBF24" },
  swapBadge: { position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(29,78,216,0.9)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  swapBadgeText: { color: "white", fontSize: 11, fontWeight: "700" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 16, borderRadius: 999, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
