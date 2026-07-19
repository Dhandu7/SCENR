// Turn the selected photos' content_category counts into a short natural phrase
// for the caption prompt — the "from content" input, with no raw enum values
// leaking into the model prompt.
const PHRASE: Record<string, string> = {
  solo_portrait: "portraits",
  group: "group shots",
  scenery: "scenery",
  food: "food",
  action_fit: "active shots",
  candid_funny: "candid moments",
}

export function summarizeCategories(categories: string[]): string {
  if (categories.length === 0) return "a mix of moments"
  const counts: Record<string, number> = {}
  for (const c of categories) counts[c] = (counts[c] ?? 0) + 1
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => PHRASE[c] ?? "moments")
  if (ranked.length === 1) return `mostly ${ranked[0]}`
  return `mostly ${ranked[0]}, with some ${ranked[1]}`
}
