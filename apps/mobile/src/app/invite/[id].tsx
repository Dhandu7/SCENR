import { useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { StyleSheet, Text, View, Pressable, Share, ActivityIndicator } from "react-native"
import QRCode from "react-native-qrcode-svg"
import { supabase } from "../../lib/supabase"

const CONTRIBUTOR_WEB_URL = process.env.EXPO_PUBLIC_CONTRIBUTOR_WEB_URL ?? "http://localhost:3000"

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [tripName, setTripName] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    supabase
      .from("trips")
      .select("name, slug")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (!isMounted || !data) return
        setTripName(data.name)
        setSlug(data.slug)
        setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [id])

  if (isLoading || !slug) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    )
  }

  const inviteUrl = `${CONTRIBUTOR_WEB_URL}/join/${slug}`

  async function handleShare() {
    await Share.share({ message: `Join "${tripName}" on SCENR: ${inviteUrl}` })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite your group</Text>
      <Text style={styles.subtitle}>They can upload photos and videos — no app needed.</Text>
      <View style={styles.qrWrapper}>
        <QRCode value={inviteUrl} size={200} />
      </View>
      <Text style={styles.link}>{inviteUrl}</Text>
      <Pressable style={styles.primaryButton} onPress={handleShare}>
        <Text style={styles.primaryButtonText}>Share invite</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 14, color: "#51596A", textAlign: "center" },
  qrWrapper: { marginVertical: 16, padding: 16, backgroundColor: "white", borderRadius: 16 },
  link: { fontSize: 14, color: "#1D4ED8" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999, marginTop: 16 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
})
