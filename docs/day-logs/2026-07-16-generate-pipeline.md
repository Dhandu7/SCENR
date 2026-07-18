# Day 4 Report — Carousel Generate Pipeline

**Plan:** [docs/superpowers/plans/2026-07-16-day4-generate.md](../superpowers/plans/2026-07-16-day4-generate.md)
**Commits:** `e5815cb..8a64924` (Day 4 feature commits `3931aff..8a64924`, 8 commits) + post-report HEIC follow-up `e3584f6` and EOD correction `db3a58e`
**Flow followed:** `/grill-me` (feature reframe) → `/writing-plans` → `/subagent-driven-development` → `/simplify` → `/run` → `/security-review` → HEIC follow-up fix

## Completed

The "naive generate" walking-skeleton slice from the plan's Days 4-6 milestone, **led by the multi-photo carousel** (the hero format decided in the 2026-07-16 grilling; a single "Post" is just the slide slider at 1). Organizer picks a theme + slide count → photos are scored and selected → per-slide swap before render → each slide rendered to a clean square → swipeable carousel on Reveal.

- **`generations` Realtime** (`0005_generations_realtime.sql`) — table added to the `supabase_realtime` publication so the Generating screen can watch a generation flip to `complete`. Verified live in the publication.
- **render-worker** (`services/render-worker/`) — a standalone Node + `sharp` compositing service: `POST /render {source_url, upload_url}` crops a photo to a **1080×1080 square (content-aware "attention" crop), no watermark**, and PUTs it. Stateless, zero Supabase credentials — only fetches signed URLs. 8 tests.
- **`rank-media`** edge function — scores each trip photo with Claude Haiku (`quality_score` + `content_category`, concurrent with a rate-limit-aware cap of 5, cached on `media_items`), then returns an **ordered N-slot bounded-hybrid selection** (`_shared/select-slides.ts`: reserve ≤2 favourites regardless of category, fill the rest by top quality) plus a `bench` of unused candidates for swaps. Deployed live (v3).
- **`generate`** edge function — takes the chosen ordered `media_item_id`s, creates a `generations` row, responds immediately, and renders each slide via render-worker into `${trip_id}/${generation_id}/${i}.jpg`, flipping the row to `complete`/`failed`. `type` derived (`post` at N=1, else `carousel`). Deployed live (v3).
- **Mobile screens** — Generate Setup (theme chips from `theme_fingerprints` + a 1–20 slide slider, 7–12 recommended, honest "fewer slides = weaker theming" note) → Preview filmstrip with **per-slide swap** (★ favourite-reserved slides not swappable; non-reserved pull the next-best from the bench) → Generating (Realtime-driven) → swipeable Reveal carousel with a slide counter. Plus a "Generate ✦" CTA on the pool screen.
- **`/simplify` pass** — 4 parallel cleanup agents; fixed 3 high-consensus items: both new `index.ts` now reuse the shared `serveJson` envelope (extended backward-compatibly to pass `req`) instead of hand-rolling it; `processGeneration`'s 3 duplicated "set failed + return" blocks collapsed to throws handled by the single existing catch, and its two independent signed-URL calls now sign concurrently; corrected the `compose.js` "center-crop" comment to describe the actual attention crop.
- **`/security-review`** — no HIGH/MEDIUM findings met the confidence bar. RLS-scoped ownership gates verified correct end-to-end, no injection surface, no secret logging. One below-threshold pre-hosting note (render-worker auth) recorded in gaps.
- **Follow-up fix (post-report, `e3584f6`)** — closed the HEIC scoring gap `/run` surfaced (the day's #1 real-world limitation) by transcoding HEIC/HEIF→JPEG **client-side at upload** in contributor-web (`lib/heic.ts`, `heic2any`, lazy-imported). Storage now only ever holds JPEG/PNG/etc., so scoring *and* rendering are protected, and it also resolves the Day 2 "HEIC won't render in a browser" gap. Verified live: a real Toronto HEIC transcoded to JPEG scores `75/group` where the raw HEIC 400s. The mobile app has no uploader, so no change there. This also uncovered — and corrected in this report — that the env's `sharp` build has no HEIF decoder (so HEIC broke rendering too, not just scoring).

## Fixed

| Finding | Where caught | Resolution |
|---|---|---|
| **HEIC photos fail Anthropic scoring** — `rank-media`'s `scorePhoto` passes the image by URL; Anthropic rejects HEIC ("file format invalid or unsupported"), the iPhone default. A HEIC-only trip → all photos dropped → `422 no_media` → can't generate. | **`/run`** live check (mocked unit tests couldn't catch it) | **Fixed in follow-up commit `e3584f6`** (transcode HEIC→JPEG at upload in contributor-web). Confirmed live: JPEG scores fine (`quality_score 45, candid_funny`); all 3 HEIC photos fail. **Correction:** an earlier draft of this report claimed render-worker's `sharp` decodes HEIC — it does **not** in this environment's build (no HEIF decoder: "No decoding plugin installed for this compression format"), so HEIC broke *rendering* too. The transcode-at-ingestion fix means storage never holds HEIC, protecting both scoring and rendering. |
| Generating + Reveal screens discarded the `error` half of their initial Supabase queries → silent infinite spinner with no escape on any transient failure | Task 6 task-review (same bug class fixed twice before in Media Pool) | Both screens now inspect the error and route into their existing error view (`b8a7474`); re-review confirmed resolved, no regression. |
| `generations.watermark` defaulted `true` but the render pipeline produces no watermark — every row misdescribed its asset | Final whole-branch review | `generate` now inserts `watermark: false` to match reality (`8c6c67e`). |
| `rank-media` `createSignedUrl` was awaited outside the per-item try/catch — a throw (vs null) would fail the whole ranking request instead of dropping one photo | Final whole-branch review | Moved inside the per-item try so one bad photo is dropped, not the batch (`8c6c67e`). |
| Unused `useMemo` import in the generate screen | Final review / simplify | Removed (`8c6c67e`). |

## Verified live (`/run`)

Ran without Docker/Supabase-CLI by driving the actual services directly against real infra (keys read from `--env-file`, never handled in plaintext):

- **render-worker: fully working** — a real trip **JPEG** photo → render-worker → a real **1080×1080 JPEG** (7.2 KB) landed in the `renders` bucket; dimensions parsed and confirmed. This is the service that determines whether output "looks right," and it's uncovered by the synthetic-buffer unit tests. (Note: this env's `sharp` build has no HEIF decoder, so render-worker can't process HEIC either — moot once HEIC is transcoded at upload, `e3584f6`.)
- **Anthropic scoring: works for standard formats, fails on HEIC** (see Fixed table) — the key gap `/run` surfaced.
- **Generate Setup screen** — rendered in the browser exactly to spec: all 5 real theme chips, slider default 9 with "✓ RECOMMENDED" in the 7–12 band, honesty note, "Find my best shots →".
- **Both edge functions** deployed and ACTIVE (v3, matching post-`/simplify` source).

## Assumptions / gaps (accepted or deferred, not fixed)

- ~~**HEIC scoring gap**~~ — **RESOLVED** in follow-up `e3584f6` (see the Completed "Follow-up fix" note and the Fixed table). Transcode HEIC→JPEG at upload in contributor-web; the mobile app has no uploader yet, so when one is built it must transcode there too (`expo-image-manipulator`).
- **render-worker not hosted** — the deployed `generate` has no reachable `RENDER_WORKER_URL`, so prod renders fail until render-worker is deployed to a host (Fly.io/Render.com — an account-level action). Verified locally instead.
- **render-worker has no auth (pre-hosting hardening)** — safe today (unhosted, single trusted caller), but before it's network-reachable it needs a shared-secret/bearer check between `generate` and render-worker and/or a Supabase-storage host allowlist, or it's an open SSRF/exfil proxy. Below the security-review confidence bar precisely because it isn't reachable yet; must be closed as part of hosting it.
- **`ANTHROPIC_API_KEY` not set as a Supabase edge secret** — the deployed `rank-media` can't score until the user sets this secret on the project (a credential action reserved for the user). Local `/run` used the repo `.env`.
- **Naive fill** — Day 4 carousels differ by *which* photos, not yet by a theme-correct *mix* or color grade; the real `composition_template` slot-fill + LUT are Days 7-9. The K=2 favourite reservation carries forward.
- **Per-user favourite precedence** (each registered user's own favourite when they generate) — post-MVP, tied to inviting other registered users to a trip.
- **Free-tier limits** (generation/theme/trip caps — the actual monetization now that the watermark is gone) — master-plan Days 10-12; `generate` has no limit gate yet.
- **Deferred `/simplify`/review minors** — `serveJson` still leaves per-function `buildDeps` wiring; a `loadSignedUrls` shared helper could dedupe pool/generate signed-URL logic (differing shapes, deferred); a video-only trip shows a generic "couldn't build a selection" error; the Generating screen has no timeout/back escape for the narrow fetch-vs-subscribe race.
