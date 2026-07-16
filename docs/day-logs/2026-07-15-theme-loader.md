# Day 3 Report — Theme Loader

**Plan:** [docs/superpowers/plans/2026-07-15-theme-loader.md](../superpowers/plans/2026-07-15-theme-loader.md)
**Commits:** `1c2aacf..0053dd2` (10 commits)
**Flow followed:** `/writing-plans` → `/subagent-driven-development` → `/simplify` → `/run` → `/security-review`

## Completed

The one-time offline theme-loader script (PRD/plan workstream W5) — the Pinterest Theme Intelligence Engine's Phase A research burst, not a live pipeline. Harvests real Pinterest pins, extracts embeddings + content-category tags + palette via hosted APIs, aggregates into theme fingerprints, and writes real rows into `theme_fingerprints`.

- **Scaffold + harvest** (`scripts/theme-loader/seed-queries.js`, `harvest.js`) — `SEED_QUERIES` for 5 themes (Golden Hour, Neon Nights, Film Grain, Coastal, Aesthetic), `pickLargestImageUrl`, `harvestTheme` (dedupes by pin id, drops pins with no image), `runApifyActor` (Apify `epctex/pinterest-scraper` actor invocation).
- **Feature extraction** (`extract-features.js`) — `embedImage` (Voyage AI `voyage-multimodal-3`, 1024-dim), `tagImage` (Claude Haiku vision: content category + palette + description), `extractFeatures` combining both with per-pin failure isolation (one bad pin doesn't abort the batch).
- **Aggregation** (`aggregate.js`) — `normalizeVector`, `computeCentroid` (normalize-then-average-then-normalize), `computeCompositionTemplate` (category-frequency distribution), `computePalette`, `aggregateFingerprint`.
- **Orchestration + the real run** (`index.js`) — loops all 5 themes with per-theme try/catch so one failure doesn't abort the run; upserts into `theme_fingerprints` via the Supabase service-role client.
- **`/simplify` pass** — none needed beyond what implementer subagents already produced cleanly; task reviews found no over-engineering to trim.
- **The live run** — real API spend against Apify, Voyage, and Anthropic, producing 5 real, verified, genuinely on-theme fingerprints (confirmed via direct SQL against `theme_fingerprints`, not self-reports): `golden_hour` (95% solo_portrait), `neon_nights` (91% scenery), `film_grain` (58% scenery / varied mix), `coastal` (91% scenery), `aesthetic` (46% group / 20% action_fit / 19% candid_funny — the differentiated mix it was specifically chosen to test).
- **`/security-review`** — scoped to today's full diff (10 commits). One SSRF candidate surfaced in the initial pass (`tagImage`'s unvalidated `fetch(imageUrl)` on Apify-scraped Pinterest image URLs) but failed independent verification: the URL comes from Pinterest's own CDN-shaped image structure, not an attacker-controllable host, so it didn't meet the host/protocol-controllability bar. **No findings survived verification.**

## Fixed

| Finding | Where caught | Resolution |
|---|---|---|
| `run-sync-get-dataset-items` has a hard ~300s synchronous limit; the actor takes ~15-20 min to harvest 80 pins | Live run — `npm run start` hung indefinitely | Switched to async run+poll: start run → poll status every 5s → fetch dataset once `SUCCEEDED` |
| Anthropic's URL-based image fetch respects Pinterest's `robots.txt` and rejected every pin (320/320 across 4 completed themes in the live run — not occasional, total) | Live run — 100% tagging failure rate, caught by reading the run log directly rather than trusting a subagent summary | `tagImage` now fetches image bytes itself and sends base64 inline instead of a URL reference; bytes held only in memory for the one request, never persisted — still satisfies PRD §4.1.5's "never persist third-party source images" via transient fetch-and-discard. Voyage's `embedImage` was unaffected (its own servers do the fetching) and left unchanged. Required explicit user approval as a real architecture change from the plan's original design. |
| Claude sometimes wrapped its JSON tag response in a ` ```json ` markdown fence despite explicit "ONLY a JSON object" instructions — hit ~96% of `golden_hour`'s pins in the run that surfaced it | Live run | Added `stripMarkdownFence`, applied before `JSON.parse`, with a pass-through fallback for already-unfenced text |
| `tagImage`'s JSON-parse error gave no indication of what Claude actually returned | Pre-run hardening, ahead of Task 4 | Error message now includes the raw response text (truncated to 500 chars) |
| `aesthetic` theme's harvest exceeded the original 20-minute poll cap (`did not finish within 1200s`) — not a bug, the safety timeout worked as designed, just too tight a margin for observed actor runtime variance | Live run | Bumped `MAX_POLL_MS` from 20 to 35 minutes; retried just the one affected theme rather than re-running all 5 |
| `.env`'s `APIFY_API_TOKEN` and `VOYAGE_API_KEY` values were swapped, causing `401 user-or-token-not-found` from Apify | Live run startup | Diagnosed via safe prefix/length-only checks (never printing full secret values); user corrected the swap directly |
| Final task reviewer's Important finding: `runApifyActor`'s poll loop had no test coverage — it called global `fetch`/`setTimeout` directly rather than through injectable deps, unlike the rest of the codebase's DI pattern (e.g. `harvestTheme`) | Task 4 final review | User chose "add tests now" over accepting the live-run-only evidence. Refactored `runApifyActor` to accept injectable `startRun`/`pollRunStatus`/`fetchDatasetItems`/`sleep`/`now` (defaulting to the real implementations, so existing callers are unaffected), added 4 tests covering immediate-success, poll-then-success, non-`SUCCEEDED` terminal status, and deadline-exceeded paths. 27/27 tests passing. |

## Assumptions / gaps (accepted, not fixed)

- **`normalizeMediaType` and `stripMarkdownFence` graceful-degradation edge cases** (Minor, final review) — e.g. an unrecognized media type silently falls back to `image/jpeg` rather than erroring, and an unterminated/malformed fence could pass through unstripped into a `JSON.parse` failure. Both fail safely (extraction returns `null` for that pin, isolated from the rest of the batch) rather than corrupting output; accepted as-is given the one-time, manually-supervised nature of this script.
- **No retry/backoff on transient API failures** — a single Voyage/Anthropic/Apify hiccup on one pin just drops that pin from the theme's sample (via `extractFeatures`'s try/catch isolation), rather than retrying. Acceptable at the 60-80-pins-per-theme scale where losing a handful of pins doesn't meaningfully shift the aggregate fingerprint; revisit only if this becomes a recurring/scheduled pipeline (explicitly out of scope per PRD §4.1.6 Phase A).
- **Composition-template rounding drift and degenerate opposite-vector centroid edge cases** (noted in Task 3's review, still unaddressed) — theoretically possible with pathological input distributions, not observed and unlikely with the real 60-80-pin harvests actually run.
- **One-off `retry-aesthetic.js` recovery script** — written, used to retry just the `aesthetic` theme after its timeout, and deleted immediately after success. Not part of the committed deliverables; mentioned here only for the record in case a similar throwaway recovery script is needed for a future re-run.
- **Real spend against three paid hosted APIs** (Apify actor rental, Voyage AI with billing enabled, Anthropic) for one-time theme harvesting — by design per the plan's "hosted APIs only" decision, not a gap, but worth noting as the first day this project has incurred real external cost beyond Supabase.

## Next

Workstream W5 (Theme Loader) is now fully complete. Remaining plan work: W6 (the real slot-fill composition/generation algorithm using these fingerprints), W1's Generate Setup/Generating/Reveal screens, and W3's render worker — all still blocked on the Anthropic API key being wired into the mobile app / edge functions (used so far only by this offline script) plus the render worker service not yet existing.
