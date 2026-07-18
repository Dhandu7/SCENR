export interface ThemeGrade {
  brightness: number
  saturation: number
  overlay?: { r: number; g: number; b: number; alpha: number }
}

// Curated per-theme color grades (hand-tuned sharp params keyed by theme_id). Deriving
// these from theme_fingerprints.palette — which holds textual descriptors like "warm
// amber", not RGB — is a later refinement; a small curated map is the demoable MVP.
const GRADES: Record<string, ThemeGrade> = {
  golden_hour: { brightness: 1.06, saturation: 1.12, overlay: { r: 255, g: 196, b: 120, alpha: 0.1 } },
  neon_nights: { brightness: 0.97, saturation: 1.3, overlay: { r: 150, g: 80, b: 220, alpha: 0.12 } },
  film_grain: { brightness: 1.02, saturation: 0.82, overlay: { r: 120, g: 110, b: 90, alpha: 0.08 } },
  coastal: { brightness: 1.05, saturation: 1.1, overlay: { r: 120, g: 190, b: 220, alpha: 0.1 } },
  aesthetic: { brightness: 1.04, saturation: 1.08, overlay: { r: 230, g: 225, b: 235, alpha: 0.05 } },
}

export function gradeForTheme(themeId: string | null | undefined): ThemeGrade | null {
  if (!themeId) return null
  return GRADES[themeId] ?? null
}
