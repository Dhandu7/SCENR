# Day 5 Report — Theme Composition Engine + Theme-Fit + Color Grade

**Plan:** [docs/superpowers/plans/2026-07-18-day5-theme-composition.md](../superpowers/plans/2026-07-18-day5-theme-composition.md)
**Commits:** `731df97..f6e9843` (9 implementation commits `c8d8038..f6e9843` + the plan doc)
**Flow followed:** `/writing-plans` (revised mid-plan to add embeddings, at the user's request) → `/subagent-driven-development` (7 tasks) → `/simplify` → `/run` → `/security-review`

## Completed

The Day 5 goal — **make theme choice actually change the output** — delivered on all three axes the plan set out. Previously (Day 4) selection was naive top-quality and every theme rendered identically; now:

- **Photo MIX by theme** — `rank-media` takes an optional `theme_id`, loads that theme's `composition_template` from `theme_fingerprints`, and allocates the non-favourite-reserved slots across `content_category`s proportional to the template (`allocateSlots`, largest-remainder with missing-category renormalization + per-category caps), keeping the K=2 bounded-hybrid favourite reservation.
- **WHICH photo per slot, by theme-fit** — a new `media_items.embedding vector(1024)` column (migration `0006`) caches each photo's Voyage `voyage-multimodal-3` embedding (same space as the theme centroids the theme-loader built). Theme-fit = cosine(photo embedding, theme `centroid_vec`); each category slot is filled by `combinedScore(theme_fit, quality) = 0.7·fit + 0.3·quality` (favourite breaks an exact tie). **Purpose, in one line:** the photo whose *look* is closest to the theme's Pinterest exemplars wins its slot — not just the technically-sharpest one.
- **Color GRADE by theme** — a curated per-theme grade map (`_shared/theme-grades.ts`) is threaded from `generate` to the generic, credential-free render-worker, which applies a `sharp` brightness/saturation modulate + a low-alpha color wash. render-worker still knows nothing about theme names.
- **Graceful degradation throughout** — no `theme_id` / no fingerprint / template with no category overlap → falls back to Day 4's naive quality selection; a photo whose Voyage embedding fails stays selectable (theme-fit null); an embed is only attempted when a theme centroid exists (no-theme generation never touches Voyage); unknown theme → no grade. **Never 500s on missing theme or failed embedding.**
- **Supporting pieces** — `_shared/cosine.ts` (parseVector/cosineSimilarity/combinedScore, math hand-verified); `rank-media/embed-photo.ts` (Voyage, mirrors the theme-loader's call); mobile `generate` screen now sends `theme_id` to `rank-media` (the wiring that activates the whole feature end-to-end).
- **`/simplify` pass** — collapsed `allocateSlots`'s dead defensive outer loop to a single pass; extracted shared `reserveFavourites`/`assembleSelection` helpers between `selectSlides` and `selectSlidesByComposition`; made the per-photo Haiku-score + Voyage-embed run **concurrently** (`Promise.all`, ~halving per-photo latency on the user-facing path) while preserving exact failure isolation; synced the mobile local `ScoredMedia` type. Suite stayed green (deno 68/68, render-worker 11/11).
- **`/security-review`** — no HIGH/MEDIUM findings met the confidence bar (see below).

Every task passed a task-scoped spec+quality review; the final whole-branch review (opus) returned **ready-to-merge, no Critical/Important**, with the full seam (mobile → rank-media → generate → render-worker) traced and every degradation path confirmed to return a valid selection.

## Fixed

| Finding | Where caught | Resolution |
|---|---|---|
| `rank-media` dropped an **already-scored** photo entirely when only its *embedding* signed-URL fetch failed — contradicting the "embedding failure keeps the photo" principle | Task 4 task-review (Minor, in the scrutinized area) | Signed-URL failure is now fatal only when scoring is actually needed (`return null` gated on `needsScore`); an embed-only failure keeps the photo with `theme_fit: null`. Fix + covering test, commit `eec1052`. |
| Task 4 implementer's **report falsely claimed** the mobile app already sent `theme_id` to `rank-media` (it didn't) — the feature would have been dead code | Task 4 task-review (Important) | Not a code defect — the wiring was **Task 7** (planned), which landed it (`8756c0d`). Record corrected; `/run` confirmed the end-to-end path works. |
| `allocateSlots` carried an unreachable defensive outer loop; `selectSlides`/`selectSlidesByComposition` duplicated setup + assembly; per-photo score/embed ran sequentially | `/simplify` (4 parallel cleanup agents) | Single-pass allocation, shared helpers, concurrent score+embed — commit `f6e9843`, behavior-preserving (all tests green). |

## Verified live (`/run`)

Drove the **real** Day-5 modules against real infra (keys via `--env-file`, throwaway drivers deleted after; no Docker/Supabase-CLI, matching the Day-4 pattern):

- **MIX (the headline):** using the **live** `composition_template`s, the same pool yields a visibly different 8-slide category mix per theme — `golden_hour` → solo_portrait×4, `coastal` → scenery×4, `neon_nights` → scenery×4, `aesthetic` → group×4/action_fit×2. Theme choice genuinely changes *which kinds* of photos are picked, matching each theme's real fingerprint.
- **Theme-fit:** real Voyage embeddings of the real Toronto JPEGs produce theme-fit that discriminates — the "group" photo scores highest on `aesthetic` (0.296) and lowest on `coastal` (0.012). The cosine mechanism works on real image bytes.
- **GRADE:** the same real photo rendered under three grades gives measurably distinct channel means — `golden_hour` warmest (R +20.8), `coastal` cool/cyan (B lifted), `neon_nights` purple (G suppressed to 95).
- **Fallback:** no-theme naive selection vs. themed selection clearly diverge; no 500s.

## Assumptions / gaps (accepted or deferred, not fixed)

- **Deployed edge functions trail source + need secrets** — the live `rank-media`/`generate` (last deployed at v4 / Task 6) predate `eec1052` and `f6e9843`; and neither can score/embed live until the user sets `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY` as Supabase **edge secrets** (a credential action reserved for the user). `/run` verified locally against `.env`. **Before production use: redeploy both functions + set the two edge secrets.**
- **HEIC still can't be embedded/scored** — `/run` confirmed all 3 existing Toronto HEICs fail Voyage embedding (400) *and* Anthropic scoring, so they're excluded from themed selection. This is exactly what the Day-4 HEIC-transcode fix (`e3584f6`) addresses **for new uploads** (stored as JPEG); the 3 HEICs predate it. No new work — the fix is already in place going forward.
- **Curated grade map, not derived from `palette`** — `theme_fingerprints.palette` holds *textual* tone descriptors ("warm amber"), not RGB, so the 5-theme grade map is hand-tuned. Deriving numeric grades from the palette (or a real LUT) is a later refinement.
- **Theme-fit within a category, not the category allocation** — the mix comes from `composition_template`; theme-fit only orders *within* each category slot. Special-slot narrative rules ("Aesthetic closes on a candid/funny shot") remain a later stretch.
- **render-worker still unhosted + unauthenticated** — carried over from Day 4: the deployed `generate` has no reachable `RENDER_WORKER_URL`, and render-worker has no shared-secret/allowlist. Both must be closed together when it's given a public URL (flagged in the security review as a tracked, currently-unreachable gap).
- **`gradeForTheme` `__proto__` hygiene** (sub-threshold security note) — `GRADES[themeId] ?? null` returns `Object.prototype` for `theme_id: "__proto__"`, but it's harmless (serializes to `{}`, sharp no-ops the missing fields). A one-line `Object.hasOwn` guard would be cheap hygiene; not applied.
- **Mobile local types** — the Generate screen still mirrors `ScoredMedia`/`Slot` locally rather than importing a shared contract; `/simplify` synced the fields, but a real shared-types package needs monorepo plumbing (deferred, disproportionate for MVP).
- **Naive per-category filter/sort in `selectSlidesByComposition`** — O(n×categories), negligible at the ≤50-photos-per-trip scale; left as-is per the efficiency review.
