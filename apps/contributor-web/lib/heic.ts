// iPhones default to HEIC, which browsers (except Safari) can't render and which
// Anthropic's vision API rejects outright ("file format invalid or unsupported").
// That silently drops HEIC uploads from carousel scoring/selection downstream, so
// we transcode HEIC/HEIF -> JPEG at ingestion — the one place every consumer
// benefits — before the file ever reaches storage.
//
// Decoder note: the original heic2any@0.0.4 build shipped an old libheif that throws
// "ERR_LIBHEIF format not supported" on real modern iPhone HEICs (HEVC-coded) — proven
// against a real device file in a browser. We use heic-to (maintained, current libheif),
// which decodes the same file to a valid JPEG.

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

type HeicConverter = (opts: { blob: Blob; type: string; quality: number }) => Promise<Blob>

// Return a JPEG File for HEIC/HEIF input; pass anything else through untouched.
// heic-to bundles a ~1.5MB libheif WASM, so it is dynamically imported only when a
// HEIC is actually selected — normal JPEG/PNG uploads never pay that cost. The
// converter is injectable so the conversion branch can be exercised without the WASM.
export async function normalizeForUpload(
  file: File,
  convert?: HeicConverter,
): Promise<File> {
  if (!isHeic(file)) return file
  const heicTo = convert ?? ((await import("heic-to")).heicTo as unknown as HeicConverter)
  const jpegBlob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 })
  return new File([jpegBlob], toJpegName(file.name), { type: "image/jpeg" })
}
