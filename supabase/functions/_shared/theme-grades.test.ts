import { assert, assertEquals } from "jsr:@std/assert@1"
import { gradeForTheme } from "./theme-grades.ts"

Deno.test("null for no/unknown theme", () => {
  assertEquals(gradeForTheme(null), null)
  assertEquals(gradeForTheme(undefined), null)
  assertEquals(gradeForTheme("nope"), null)
})

Deno.test("a distinct grade for each of the 5 seeded themes", () => {
  const grades = ["golden_hour", "neon_nights", "film_grain", "coastal", "aesthetic"].map(gradeForTheme)
  for (const g of grades) {
    assert(g !== null)
    assert(typeof g!.brightness === "number" && typeof g!.saturation === "number")
  }
  assertEquals(new Set(grades.map((g) => JSON.stringify(g))).size, 5)
})
