// apps/mobile/src/app/create-trip.tsx
import { useState } from "react"
import { useRouter } from "expo-router"
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native"
import { supabase } from "../lib/supabase"
import { makeTripSlug } from "../lib/slug"

export default function CreateTripScreen() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [destination, setDestination] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleCreateTrip() {
    setErrorMessage(null)
    setIsSubmitting(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setIsSubmitting(false)
      setErrorMessage("You must be signed in to create a trip.")
      return
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = makeTripSlug(name)
      const { data, error } = await supabase
        .from("trips")
        .insert({
          owner_id: userData.user.id,
          name: name.trim(),
          destination: destination.trim() || null,
          slug,
        })
        .select("id")
        .single()

      if (!error && data) {
        setIsSubmitting(false)
        router.replace(`/invite/${data.id}`)
        return
      }

      lastError = error?.message ?? "Unknown error"
      if (error?.code !== "23505") {
        break
      }
    }

    setIsSubmitting(false)
    setErrorMessage(lastError ?? "Could not create trip.")
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create trip</Text>
      <TextInput style={styles.input} placeholder="Trip name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="+ Add destination" value={destination} onChangeText={setDestination} />
      <Pressable style={styles.primaryButton} onPress={handleCreateTrip} disabled={isSubmitting || !name.trim()}>
        {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Create trip</Text>}
      </Pressable>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#C3D0E8", borderRadius: 10, padding: 14, fontSize: 16 },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", marginTop: 8 },
})
