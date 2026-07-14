export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude === 0) return vector.map(() => 0)
  return vector.map((v) => v / magnitude)
}

export function computeCentroid(embeddings) {
  const dimension = embeddings[0].length
  const sum = new Array(dimension).fill(0)
  for (const embedding of embeddings) {
    const normalized = normalizeVector(embedding)
    for (let i = 0; i < dimension; i++) {
      sum[i] += normalized[i]
    }
  }
  return normalizeVector(sum.map((v) => v / embeddings.length))
}

export function computeCompositionTemplate(categories) {
  const counts = {}
  for (const category of categories) {
    counts[category] = (counts[category] ?? 0) + 1
  }
  const total = categories.length
  const distribution = {}
  for (const [category, count] of Object.entries(counts)) {
    distribution[category] = Math.round((count / total) * 1000) / 1000
  }
  return distribution
}

export function computePalette(paletteArrays) {
  const counts = new Map()
  for (const terms of paletteArrays) {
    for (const term of terms) {
      const key = term.toLowerCase().trim()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term)
}

export function aggregateFingerprint(themeId, displayName, features) {
  if (features.length === 0) {
    throw new Error(`cannot aggregate fingerprint for "${themeId}" with zero features`)
  }
  const centroidVec = computeCentroid(features.map((f) => f.embedding))
  const compositionTemplate = computeCompositionTemplate(features.map((f) => f.category))
  const palette = computePalette(features.map((f) => f.palette)).slice(0, 5)
  const notes = features
    .map((f) => f.description)
    .filter(Boolean)
    .slice(0, 10)
    .join(" | ")

  return {
    theme_id: themeId,
    display_name: displayName,
    centroid_vec: centroidVec,
    palette,
    notes,
    composition_template: compositionTemplate,
    sample_count: features.length,
  }
}
