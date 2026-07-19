import { useRouter } from "expo-router"
import { StyleSheet, Text, View, Pressable } from "react-native"
import { useAuth } from "../lib/auth-context"

export default function LandingScreen() {
  const router = useRouter()
  const { session, isLoading } = useAuth()

  function handleStartTrip() {
    router.push(session ? "/create-trip" : "/sign-up")
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.brand}>SCENR</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>SCENR</Text>
      <Text style={styles.tagline}>Made in 2 minutes. By AI. From group photos.</Text>
      <Pressable style={styles.primaryButton} onPress={handleStartTrip}>
        <Text style={styles.primaryButtonText}>Start a Trip</Text>
      </Pressable>
      {session ? (
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/trips")}>
          <Text style={styles.secondaryButtonText}>My Trips</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  brand: { fontSize: 40, fontWeight: "800" },
  tagline: { fontSize: 16, textAlign: "center", color: "#51596A" },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999, marginTop: 16 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  secondaryButton: { borderWidth: 1, borderColor: "#1D4ED8", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999 },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
})
