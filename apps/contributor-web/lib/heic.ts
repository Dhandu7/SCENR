// iPhones default to HEIC, which browsers (except Safari) can't render and which
// Anthropic's vision API rejects outright ("file format invalid or unsupported").
// That silently drops HEIC uploads from carousel scoring/selection downstream, so
// we transcode HEIC/HEIF -> JPEG at ingestion — the one place every consumer
// benefits — before the file ever reaches storage.

// Browsers frequently report an empty `type` for a HEIC file, so fall back to the
// filename extension.
export function isHeic(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase()
  if (type === "image/heic" || type === "image/heif") return true
  if (type) return false
  const lower = file.name.toLowerCase()
  return lower.endsWith(".heic") || lower.endsWith(".heif")
}

// Swap a .heic/.heif extension for .jpg (and give an extensionless name one).
export function toJpegName(name: string): string {
  if (/\.(heic|heif)$/i.test(name)) return name.replace(/\.(heic|heif)$/i, ".jpg")
  return name.includes(".") ? name : `${name}.jpg`
}

type HeicConverter = (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>

// Return a JPEG File for HEIC/HEIF input; pass anything else through untouched.
// heic2any is a ~1.5MB WASM bundle, so it is dynamically imported only when a HEIC
// is actually selected — normal JPEG/PNG uploads never pay that cost. The converter
// is injectable so the conversion branch can be exercised without the real WASM.
export async function normalizeForUpload(
  file: File,
  convert?: HeicConverter,
): Promise<File> {
  if (!isHeic(file)) return file
  const heic2any = convert ?? ((await import("heic2any")).default as unknown as HeicConverter)
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })
  const blob = Array.isArray(converted) ? converted[0] : converted
  return new File([blob], toJpegName(file.name), { type: "image/jpeg" })
}
