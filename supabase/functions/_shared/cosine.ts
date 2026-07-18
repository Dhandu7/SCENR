// A pgvector column comes back from PostgREST as the string "[0.1,0.2,…]" (and may
// already be a number[] when we just computed it). Normalize both to number[].
export function parseVector(value: unknown): number[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value as number[]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as number[]) : null
    } catch {
      return null
    }
  }
  return null
}

// Cosine similarity of two equal-length vectors. Returns 0 for a length mismatch or
// a zero-norm vector (both meaningless rather than on-theme).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

// Rank a photo within a category slot: theme-fit (how close its look is to the
// theme's Pinterest centroid, ~[0,1]) dominates at 0.7; quality (0-100) supports at
// 0.3. A photo with no embedding passes themeFit = 0 and is ranked purely on quality,
// below any on-theme photo.
export function combinedScore(themeFit: number, quality: number): number {
  return 0.7 * clamp01(themeFit) + 0.3 * clamp01(quality / 100)
}
