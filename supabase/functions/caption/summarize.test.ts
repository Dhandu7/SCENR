import { assertEquals } from "jsr:@std/assert@1"
import { summarizeCategories } from "./summarize.ts"

Deno.test("empty -> generic phrase", () => {
  assertEquals(summarizeCategories([]), "a mix of moments")
})
Deno.test("single category -> its readable phrase", () => {
  assertEquals(summarizeCategories(["scenery", "scenery"]), "mostly scenery")
})
Deno.test("dominant + secondary", () => {
  assertEquals(
    summarizeCategories(["group", "group", "group", "scenery"]),
    "mostly group shots, with some scenery",
  )
})
Deno.test("maps every category to a human phrase (no raw enum leaks)", () => {
  const phrase = summarizeCategories(["solo_portrait", "action_fit", "candid_funny", "food"])
  for (const raw of ["solo_portrait", "action_fit", "candid_funny"]) {
    assertEquals(phrase.includes(raw), false)
  }
})
