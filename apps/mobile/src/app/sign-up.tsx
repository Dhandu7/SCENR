import { useState } from "react"
import { useRouter } from "expo-router"
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native"
import { supabase } from "../lib/supabase"

type Stage = "email" | "code"

export default function SignUpScreen() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSendCode() {
    setErrorMessage(null)
    setIsSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setIsSubmitting(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }
    setStage("code")
  }

  async function handleVerifyCode() {
    setErrorMessage(null)
    setIsSubmitting(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    })
    setIsSubmitting(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }
    router.replace("/create-trip")
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up</Text>
      {stage === "email" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.primaryButton} onPress={handleSendCode} disabled={isSubmitting || !email.trim()}>
            {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Send code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter the code we sent to {email}</Text>
          <TextInput
            style={styles.input}
            placeholder="Code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.primaryButton} onPress={handleVerifyCode} disabled={isSubmitting || !code.trim()}>
            {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Verify</Text>}
          </Pressable>
        </>
      )}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#51596A", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#C3D0E8", borderRadius: 10, padding: 14, fontSize: 16 },
  primaryButton: { backgroundColor: "#1D4ED8", paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#DC2626", marginTop: 8 },
})
