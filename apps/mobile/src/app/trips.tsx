import { useEffect, useState } from "react"
import { useRouter } from "expo-router"
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { supabase } from "../lib/supabase"

interface TripRow {
  id: string
  name: string
  destination: string | null
  created_at: string
}

export default function TripsScreen() {
  const router = useRouter()
  const [trips, setTrips] = useState<TripRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      // RLS (trips_owner_all) already scopes this to the signed-in organizer's own
      // trips. Archived trips have their own separate archive view — excluded here.
      const { data, error } = await supabase
        .from("trips")
        .select("id, name, destination, created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
      if (!mounted) return
      if (error) {
        setErrorMessage(error.message)
      } else {
        setTrips(data ?? [])
      }
      setIsLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Trips</Text>
      {trips.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>You haven&apos;t started a trip yet.</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/pool/${item.id}`)}>
              <Text style={styles.rowName}>{item.name}</Text>
              {item.destination ? <Text style={styles.rowDestination}>{item.destination}</Text> : null}
              <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "800" },
  list: { gap: 12 },
  row: { borderWidth: 1, borderColor: "#E2E6F0", borderRadius: 12, padding: 16, gap: 4 },
  rowName: { fontSize: 17, fontWeight: "700" },
  rowDestination: { fontSize: 14, color: "#51596A" },
  rowDate: { fontSize: 12, color: "#8892A6" },
  emptyText: { fontSize: 15, color: "#51596A", textAlign: "center" },
  error: { color: "#DC2626", textAlign: "center" },
})
