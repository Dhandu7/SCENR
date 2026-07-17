import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

const { width } = Dimensions.get("window")

export default function RevealScreen() {
  const { generationId } = useLocalSearchParams<{ generationId: string }>()
  const router = useRouter()
  const [urls, setUrls] = useState<string[]>([])
  const [tripId, setTripId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data, error } = await supabase
        .from("generations")
        .select("trip_id, output_url, selection")
        .eq("id", generationId)
        .single()
      if (!mounted) return
      if (error || !data?.output_url || !Array.isArray(data.selection)) {
        setErrorMessage(error?.message ?? "This carousel isn't ready.")
        return
      }
      setTripId(data.trip_id)
      const paths = data.selection.map((_: unknown, i: number) => `${data.output_url}${i}.jpg`)
      const { data: signed } = await supabase.storage.from("renders").createSignedUrls(paths, 3600)
      if (!mounted || !signed) return
      setUrls(signed.map((s) => s.signedUrl).filter((u): u is string => !!u))
    }
    load()
    return () => { mounted = false }
  }, [generationId])

  if (errorMessage) {
    return <View style={styles.centered}><Text style={styles.error}>{errorMessage}</Text></View>
  }
  if (urls.length === 0) {
    return <View style={styles.centered}><ActivityIndicator /></View>
  }
  return (
    <View style={styles.container}>
      <FlatList
        data={urls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${i}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height: width }} />}
      />
      <Text style={styles.counter}>{index + 1} / {urls.length}</Text>
      <Text style={styles.label}>Your {urls.length === 1 ? "Post" : "Carousel"}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => tripId && router.replace(`/pool/${tripId}`)}>
        <Text style={styles.secondaryButtonText}>Back to pool</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  counter: { fontSize: 13, color: "#51596A", fontWeight: "600" },
  label: { fontSize: 18, fontWeight: "800" },
  secondaryButton: { borderWidth: 1, borderColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999 },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "center" },
})
