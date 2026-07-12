# SCENR — 2-Week MVP Implementation Plan

## Context

SCENR turns a group trip's scattered camera-roll media into polished, platform-ready social content automatically: an organizer creates a trip, invites contributors via a no-install web link, everyone's photos/videos land in one shared live pool, and AI generates themed output in ~2 minutes. A Figma prototype (17 screens, extracted from `Scenr markdown file.zip` on the Desktop, now in `docs/figma-export/`) already defines the full loop, and a PRD (`docs/prd.md`) specifies five new capability areas for the next build: Pinterest Theme Intelligence, the Reel edit pipeline, music/beat-sync, captions, and free/premium tiers. An aspirational architecture doc sketches a full microservice topology (Kong, Apollo Federation, Kafka, Temporal, GPU pools) — appropriate for the eventual product, not for a 2-week build.

The goal is a **functional, demoable prototype by end of July 2026** (plan written 2026-07-12), scoped to **Post, Carousel, and Story only — Reel and music/beat-sync are explicitly deferred** (Reel requires beat-synced video editing, the single most complex subsystem in the PRD, and cutting it is what makes a 2-week timeline realistic). The builder is solo, working with Claude Code agents run in parallel, which is why this plan is structured into independent workstreams against a shared schema contract rather than one linear task list.

Decisions locked in before this plan was written:
- **Client**: React Native (Expo) mobile app for the organizer flow + a separate lightweight web page for the appless contributor uploader.
- **Theme engine**: the Pinterest Theme Intelligence Engine (PRD §4.1) **is in scope**, but scoped to match the PRD's own §4.1.6 framing of Phase A as "a one-time offline research burst, not production infrastructure" — built as a manually-run script producing stored fingerprints, not a live/scheduled pipeline.
- **Music**: deferred entirely (PRD §4.3) — it mainly serves Reel, which is out of scope.
- **AI/ML**: hosted APIs only (Claude for vision/captions/scoring, a hosted embeddings API for the theme engine) — no self-hosted models or GPU infra.

## Approach

### Stack
- **Backend**: Supabase (Postgres + pgvector, Auth, Storage, Realtime, Edge Functions) — the PRD itself repeatedly points at this shape ("realtime channel (websocket / Supabase realtime)" in §6.1.1), and it collapses the aspirational microservice topology into one managed platform a solo builder can stand up fast. Fresh Supabase project (the user's existing one is unrelated/inactive).
- **Mobile**: Expo (managed + dev-client), not bare RN — no custom native modules needed for this scope; EAS internal distribution gets a real device build without App Store review.
- **Contributor web uploader**: a small Next.js page (`/join/[slug]`) deployed to Vercel, no login, hitting Supabase Edge Functions for a session token + presigned upload.
- **Render pipeline**: a small always-on Node service (Fly.io/Render.com) using `sharp` for image compositing (crop, LUT/color-grade, caption + watermark overlay) and `ffmpeg` only for Story's optional multi-image crossfade. Not a Supabase Edge Function — Deno can't reliably run `sharp`'s native binary. This is deliberately lightweight because Post/Carousel/Story are image/short-slideshow formats, not beat-synced video.
- **Vision/scoring/captions**: Claude (Haiku for cheap per-photo quality scoring, Sonnet for caption generation from content).
- **Embeddings**: a hosted multimodal embedding API (e.g. Voyage AI `voyage-multimodal-3`) — used identically by the offline theme-loader script and the live generation pipeline so cosine similarity is meaningful.
- **Theme harvesting**: Apify's Pinterest search-scraper actor, run manually, capped to ~4–5 themes × ~60–80 pins per theme — per PRD §4.1.6 Phase A.

### Repo layout (monorepo)
```
SCENR/
  apps/mobile/              # Expo app (organizer flow)
  apps/contributor-web/     # Next.js appless uploader
  services/render-worker/   # sharp + ffmpeg compositing service
  supabase/migrations/      # SQL schema
  supabase/functions/       # Edge Functions: join-trip, contributor-upload, generate, generation-status
  scripts/theme-loader/     # one-time Apify -> embeddings -> Claude -> theme_fingerprints script
  packages/shared-types/    # generated Supabase types + shared DTOs
  docs/                     # prd.md, plan.md, figma-export/, architecture.html
```

### Data model (Postgres, tied to PRD §8)
Core tables: `profiles` (tier, generations_used stub), `trips` (name, slug, owner), `contributors` (per-trip, session_token, no auth.users row), `media_items` (type, storage_path, quality_score, **content_category**, theme_fit_scores jsonb, is_favourite), `theme_fingerprints` (theme_id, centroid_vec vector(1024), palette jsonb, notes, **composition_template jsonb**), `generations` (type: post/carousel/story, theme_id, status, selection jsonb as an EDL-lite, output_url, caption, caption_mode, seed). RLS scopes trips/media/generations to `owner_id = auth.uid()`; contributor writes go through a service-role Edge Function keyed off `session_token` rather than anonymous RLS policies. Realtime (Postgres Changes) enabled on `media_items` and `generations` filtered by `trip_id`, driving the pool's Live indicator and the generating→reveal transition.

### Dynamic composition engine (mood-based selection, not a filter)
A theme is a *mood recipe*, not a color grade: "Elegant" should mix stunning solo, group, scenery, and food shots; "Aesthetic" should lean toward fit/candid shots and place a suggested funny picture on the last slide. This mix is derived from the Pinterest exemplars themselves, not hand-authored:
- **Content taxonomy**: a small fixed set of categories (solo_portrait, group, scenery, food, action_fit, candid_funny) — kept small deliberately so classification stays cheap and the slot-fill logic stays simple.
- **Theme loader (W5) additions**: when Claude vision describes each harvested Pinterest pin (already planned), it also tags the pin's `content_category`. Aggregating category frequencies across a theme's exemplar pins produces that theme's `composition_template` — a target category-mix distribution plus any observed structural patterns (e.g. "closing slide is usually candid/funny" for Aesthetic) — stored on `theme_fingerprints.composition_template`.
- **Live scoring**: the same per-photo Claude/Haiku pass that produces `quality_score` for trip media also tags `content_category`, so no extra API calls are needed.
- **Selection algorithm (`generate` function, W6)**: instead of "top-N by theme_fit," it's a **slot-fill**: given the output length/slide count and the theme's `composition_template`, allocate slots proportionally across categories, fill each slot with the trip's best theme_fit-scored photo in that category, apply special-slot rules (e.g. last carousel slide = best candid_funny pick if the template calls for one and the pool has one), and gracefully redistribute weight to other categories when the trip's pool is missing a category (e.g. no food photos on a hiking trip).

### Parallel workstreams (for Claude Code agent dispatch)
| Workstream | Owns | Depends on |
|---|---|---|
| W1 — Mobile App | All Expo screens: auth, create trip, invite (QR+link), media pool, generate setup, generating, reveal (post/carousel/story + sibling strip), export/share, archive, static paywall | shared-types, Supabase project |
| W2 — Backend | Migrations, RLS, Storage buckets, Realtime config, Edge Functions | Supabase project created (Day 0) |
| W3 — Render Worker | Compositing service, LUT application, caption/watermark overlay, ffmpeg slideshow stretch | W2 schema shape |
| W4 — Contributor Web | Uploader page, presigned upload flow | W2 Edge Functions |
| W5 — Theme Loader | Apify harvest → embeddings → Claude descriptions/category tags → fingerprint + composition_template aggregation | Only `theme_fingerprints` table existing (trivial) |
| W6 — Integration (human-directed) | `generate` function's selection algorithm end-to-end, cross-workstream wiring, demo rehearsal | All others, ongoing |

W1–W5 can run genuinely in parallel from Day 1 against the shared schema contract; W6 is the integration glue that dominates week 2.

### Day-by-day schedule
- **Day 0 — setup**: Create Supabase project, enable pgvector; get Apify/Anthropic/Voyage API keys; init monorepo skeleton; paste PRD into `docs/prd.md`; confirm stack choices before agents start building.
- **Days 1–3 — Walking skeleton**: W2 applies full schema (unblocks W5 immediately) + `join-trip`/`contributor-upload` functions + Storage buckets + Auth. W1 scaffolds Expo nav shell + Auth/Create Trip/Invite (real QR+link). W4 scaffolds contributor-web hitting the real upload function. W3 scaffolds render worker with a stub `/render` (crop+watermark only). W5 kicks off the Apify harvest (longest-pole external dependency — start Day 1 morning) and begins embedding/description extraction. **Checkpoint**: organizer can create a trip and get an invite link; a contributor can upload a photo from a phone browser into Storage + a `media_items` row.
- **Days 4–6 — Live pool → naive generate → first real reveal**: W1 wires Media Pool to Realtime (grid, filters, Live indicator) + Generate Setup sheet. W2/W6 build the `generate` function with a **naive fallback**: a single Haiku pass per trip photo that tags both `quality_score` and `content_category`, selection picks top-N by quality_score only, ignoring category/embeddings for now — so nothing blocks on the theme loader landing. W3 completes `/render` (real crop/watermark/caption placeholder, uploads output, flips status). W1 builds Generating + Reveal (Post first, then Carousel, then Story single-image). W5 targets `theme_fingerprints` (including `composition_template`) fully populated by end of Day 6. **Checkpoint**: full walking skeleton — create trip → invite → appless upload → live pool → generate → real rendered Post/Carousel/Story on Reveal.
- **Days 7–9 — Theme engine, composition engine + captions integration**: W6 swaps naive top-N for the real **slot-fill composition algorithm** — allocate slots per the theme's `composition_template`, fill each with the best theme_fit-scored (pgvector cosine similarity against `theme_fingerprints.centroid_vec`, weighted with quality_score) photo in that category, apply special-slot rules like a candid/funny closer. W3 applies the theme's actual LUT/palette as a color transform. W1/W6 wire captions (generate-from-content via Claude Sonnet + write-your-own, persisted `caption_mode`) and the "also made from this trip" sibling-format strip. **Checkpoint**: different themes visibly produce different color grades *and* different kinds of photo mixes; an Aesthetic-themed carousel actually closes on a candid/funny shot when one exists in the pool.
- **Days 10–12 — Export, archive, polish, stretch**: W1 builds export/share (`expo-sharing`, camera roll save), Trips Archive, static Paywall A/B (no real IAP). W6 adds abuse-control stubs on contributor-web and the hardcoded usage counter. W3 stretch: Story as a 3–5 image ffmpeg crossfade instead of single image, only if on schedule. Polish pass matching Figma spacing/type/color; handle empty/loading/error states. **Checkpoint**: all in-scope Figma screens have a real implementation, no dead ends.
- **Days 13–14 — Bug bash + demo prep**: multi-device test (organizer on a real EAS dev-client build + a real phone browser as a second contributor, to make the live-pool moment land), seed a real demo trip with genuine photos, rehearse the demo script twice and time the generate step, freeze scope — cut anything unfinished rather than half-finishing it.
- **Buffer**: reserved for slippage on the theme-loader (Apify is the least controllable dependency) or render-worker LUT quality. No new features scheduled here.

### Top risks
1. **Apify/Pinterest harvest reliability** — mitigated by starting Day 1, keeping scope tight (4–5 themes, ~60–80 pins each, re-runnable same-day), and decoupling the live pipeline via the naive-fallback scoring function so a stalled harvest never blocks app work. Fallback: hand-curate ~15–20 images/theme manually by Day 3 if the actor isn't producing usable data.
2. **Hosted vision/embedding API latency and cost** threatening the ~2-min feel — mitigated by cheap local pre-filtering (resolution/blur) before spending API calls, using Haiku (not Sonnet) for per-photo scoring, caching scores/embeddings on `media_items`, and showing real progress state on the Generating screen.
3. **RN build/store friction** — explicitly scoped to EAS dev-client / simulator for the demo, no App Store/Play Store submission in this plan; flagged as a deliberate cut, not an oversight.
4. **Composition engine producing an unconvincing or degenerate mix** (e.g. a trip's pool genuinely has no food or candid shots, or classification is noisy enough that slot-fill picks the wrong category for a photo). *Mitigation*: keep the content taxonomy small (5–6 categories) so classification accuracy stays high; build graceful weight-redistribution into the slot-fill algorithm from day one; spot-check a handful of trips manually against each theme's `composition_template` rather than trusting it blind.

### Explicitly deferred / stubbed (do not build)
Reel and beat-sync editing; music (§4.3); a live/scheduled Pinterest pipeline (only the one-time Phase A script — Phase C's open-license production corpus is post-MVP); all 15 themes (only 4–5); the literal 5-term theme_fit formula from PRD §4.1.3 (cosine + quality only — the *composition/mood-mix* idea is explicitly in scope per user feedback, just not the exact weighted-term math); real billing/paywall infra (static screens only); Trip Insights; post-share performance tracking; a real QuotaLedger (hardcoded counter); resumable/chunked uploads (single PUT with a size cap); NSFW/malware scanning on uploads (flagged gap).

### Critical files
- `supabase/migrations/0001_init.sql` — the full data model; every workstream builds against this contract.
- `supabase/functions/generate/index.ts` — orchestration tying pool query, scoring, selection, and render-worker invocation together; highest-risk integration point.
- `services/render-worker/src/server.ts` — the compositing engine that determines whether Post/Carousel/Story actually look good.
- `scripts/theme-loader/index.ts` — the one-time Apify → embeddings → Claude → `theme_fingerprints` pipeline; its output quality determines whether "theme-aware generation" is convincing.
- `apps/mobile/app/(trip)/[id]/pool.tsx` (or equivalent) — the Realtime-wired live pool view, the centerpiece "feels alive" demo moment.

## Verification
- **End-to-end walking skeleton**: from a real device/simulator, create a trip, open the generated invite link in an actual phone browser, upload a photo, and confirm it appears in Supabase (Storage + `media_items` row) and in the organizer's pool view.
- **Generation pipeline**: trigger Generate for Post/Carousel/Story on a seeded trip and confirm each produces a real rendered output reachable at `output_url`, with the Reveal screen showing it (not a placeholder).
- **Theme-awareness**: generate the same trip's media under two different themes and confirm both a visibly different color grade *and* a different category mix of photos — spot-check `content_category` tags and `theme_fingerprints.composition_template` against the actual `selection` on a `generations` row via a Supabase SQL query.
- **Multi-contributor live pool**: two physical devices/browsers contributing to the same trip simultaneously, confirming Realtime updates the organizer's pool without a manual refresh.
- **Full demo rehearsal**: run the entire flow — create trip → invite → multi-contributor upload → generate all three formats → caption → export/share — timed, on the actual EAS dev-client build, at least twice before presenting.
