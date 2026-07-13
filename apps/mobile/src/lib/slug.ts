export function makeTripSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "trip"

  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}
