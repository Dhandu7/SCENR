import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { supabase } from "../../lib/supabase"

type GenerationStatus = "pending" | "processing" | "complete" | "failed"

export default function GeneratingScreen() {
  const { generationId } = useLocalSearchParams<{ generationId: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<GenerationStatus>("pending")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.from("generations").select("status").eq("id", generationId).single().then(({ data, error }) => {
      if (!mounted) return
      if (error || !data) {
        setErrorMessage(error?.message ?? "Couldn't load this generation.")
        return
      }
      setStatus(data.status as GenerationStatus)
    })
    const channel = supabase
      .channel(`generations:id=eq.${generationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generations", filter: `id=eq.${generationId}` },
        (payload) => setStatus(payload.new.status as GenerationStatus),
      )
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [generationId])

  useEffect(() => {
    if (status === "complete") router.replace(`/reveal/${generationId}`)
  }, [status, generationId, router])

  if (status === "failed" || errorMessage) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Couldn&apos;t make this one</Text>
        <Text style={styles.subtitle}>Try again from the pool.</Text>
      </View>
    )
  }
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.title}>Creating your carousel…</Text>
      <Text style={styles.subtitle}>Styling your best shots.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", marginTop: 16 },
  subtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
  errorTitle: { fontSize: 18, fontWeight: "700" },
})
