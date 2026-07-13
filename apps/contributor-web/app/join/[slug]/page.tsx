"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { confirmUpload, joinTrip, requestUpload, type JoinTripResponse } from "../../../lib/api"
import { supabase } from "../../../lib/supabase"

type UploadState = "idle" | "uploading" | "done" | "error"

// Browsers often report an empty `file.type` for HEIC/HEIF; fall back to the
// extension so those uploads aren't rejected as missing a content type.
function inferContentType(file: File): string {
  if (file.type) return file.type
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic"
  return ""
}

export default function JoinTripPage() {
  const { slug } = useParams<{ slug: string }>()
  const [session, setSession] = useState<JoinTripResponse | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    const storageKey = `scenr_session_${slug}`
    const cached = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null
    if (cached) {
      try {
        setSession(JSON.parse(cached))
        return
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
    joinTrip(slug)
      .then((result) => {
        setSession(result)
        localStorage.setItem(storageKey, JSON.stringify(result))
      })
      .catch((error) => setJoinError(error.message))
  }, [slug])

  async function handleFileSelected(file: File) {
    if (!session) return
    setUploadState("uploading")
    setUploadError(null)
    try {
      const contentType = inferContentType(file)
      const uploadRequest = await requestUpload({
        sessionToken: session.session_token,
        fileName: file.name,
        contentType,
        fileSize: file.size,
      })
      const { error } = await supabase.storage
        .from("trip-media")
        .uploadToSignedUrl(uploadRequest.storage_path, uploadRequest.upload_token, file)
      if (error) throw new Error(error.message)
      await confirmUpload({
        sessionToken: session.session_token,
        storagePath: uploadRequest.storage_path,
        contentType,
      })
      setUploadState("done")
    } catch (error) {
      setUploadState("error")
      setUploadError(error instanceof Error ? error.message : "upload_failed")
    }
  }

  if (joinError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-red-600">This invite link isn&apos;t valid: {joinError}</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p>Loading invite…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-bold">You&apos;re invited to {session.trip.name}</h1>
      <p className="text-gray-600">Add your photos and videos — no download needed.</p>
      <label className="cursor-pointer rounded-full bg-blue-700 px-8 py-3 font-semibold text-white">
        {uploadState === "uploading" ? "Uploading…" : "Choose photo or video"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/heic,image/webp,video/mp4,video/quicktime"
          className="hidden"
          disabled={uploadState === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) handleFileSelected(file)
          }}
        />
      </label>
      {uploadState === "done" ? <p className="text-green-700">Uploaded! Thank you.</p> : null}
      {uploadState === "error" ? <p className="text-red-600">Upload failed: {uploadError}</p> : null}
    </main>
  )
}
