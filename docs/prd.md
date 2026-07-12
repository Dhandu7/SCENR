# SCENR — Product Requirements Document

Group-trip photos & video → shareable social content, in two minutes, by AI

Version 1.0 · Draft for review
Author: Aaryan Dhand · July 7, 2026

> Extracted from `SCENR_PRD.docx`. Reference `docs/figma-export/` for the 17 prototype screens and `docs/plan.md` for the MVP implementation plan (which scopes this PRD down to Post/Carousel/Story, defers Reel and music, and adds a mood-based composition engine on top of §4.1).

## 1. Overview & Vision

SCENR turns the messy, scattered camera rolls of a group trip into polished, platform-ready social content without anyone having to edit a thing. A trip organizer creates a trip, invites everyone to contribute photos and videos (no app install required), and SCENR's AI generates themed Reels, Posts, Carousels, and Stories from the shared media pool in roughly two minutes.

The core insight is that the best trip content is trapped across multiple phones and never gets made. Editing is the bottleneck. SCENR removes the bottleneck by (1) pooling everyone's media into one place through a frictionless appless upload flow, and (2) doing all creative and technical editing — selection, trimming, beat-syncing, transitions, theming, and captioning — automatically.

**North star**: Every group trip ends with content everyone is proud to post — created in the time it takes to order a coffee, with zero editing skill required.

### What this PRD adds to the existing prototype

The Figma prototype already defines the core create-and-reveal loop. This document specifies that existing surface, then details five new capability areas requested for the next build:

- **Pinterest Theme Intelligence Engine** — mines Pinterest for the best on-theme photography to build a rich visual context that drives smarter photo selection and matching.
- **Automated Reel Edit Pipeline** — a deterministic sequence: collect the best clips → aggressively trim → sync to a song → apply transitions.
- **Music system** — user-uploaded MP3 sync, waveform/beat detection to place cuts on key moments, and an AI song-suggestion engine.
- **Captions system** — write-your-own, AI-generated-from-content, or theme preset captions.
- **Free vs Premium tiers** — trip- and upload-based limits on free, unlimited on premium.
- **Appless trip + trip insights** — the no-download web contribution experience and the analytics layer around it.

## 2. Existing Product (Extracted From Figma)

The prototype defines a single primary loop — Start a Trip → Pool media → Generate → Reveal → Share — plus a trips archive and paywall.

| Screen | Surface | Feature established |
|---|---|---|
| 01–02 | Splash / value demo | Full-bleed sample reel with the promise "Made in 2 minutes. By AI. From group photos." Primary CTA "Start a Trip", secondary "See how it works." |
| 03 | Sign up | Account creation / auth to own trips and sync across devices. |
| 04 | Create trip | Name the trip; optional "+ Add dates" and "+ Destination" metadata chips. Metadata later feeds theming and insights. |
| 05 | Invite | QR code + short link (scenr.app/join/your-trip-7x) shareable via Messages, WhatsApp, or Copy Link. "They can upload photos and videos — no app needed." Also "upload your own photos first." |
| 06–07 | Media pool | Shared grid of all contributors' media. Header shows item count + contributor count and a Live indicator. Filters: All / Photos / Videos / ★ Favourites. Per-item contributor avatar and video duration badge. Primary CTA "Generate ✦." |
| 08 | Generate setup | Bottom sheet: Type (Reel / Post / Carousel / Story), Theme (Golden Hour, Neon Nights, Film Grain, Coastal… 15 total), Length (15s / 30s / 60s), and a music row ("Golden Light — Aeris · Beat-synced · tap to change", marked PRO). Footer shows usage: "Uses 1 of 2 free generations this month." |
| 09 | Generating | Processing state while the pipeline runs (~2 min target). |
| 10–13 | Reveal | Output preview per format. Reel shows song, theme, clip count ("0:30 · Golden Hour · 18 clips"), a SCENR watermark, "Remove watermark with Pro," and an "Also made from this trip" strip (Carousel / Post / Story). Carousel mirrors an Instagram post with slide counter and a generated caption. Primary CTA "Export & Share." |
| 14–15 | Paywall (A/B) | SCENR Pro: no watermark, 30 reels/month, beat-synced music, Instagram aesthetic matching, all 15 themes. Pricing $12.99/mo or $99.99/yr (save 36%). Two design variants for testing. |
| 16 | Contributor web | The appless join page rendered in a mobile browser: "Alex invited you to Untitled trip," a tap-to-choose / drag-and-drop uploader, and an optional "What should we call you?" name field. |
| 17 | Trips archive | "Your Trips" list with cover, title, photo + friend counts, reel-count badge, and ARCHIVED state. FAB to start a new trip. |

### 2.1 Extracted feature set

- **Trips**: named container with optional dates + destination; live archive with photo/friend/reel counts and archiving.
- **Appless collaborative collection**: QR/link invite, browser upload of photos + videos with optional contributor name, live-updating shared pool.
- **Media pool management**: unified grid, type filters, favourites, per-contributor attribution, video-length metadata.
- **AI generation**: four output formats, 15 visual themes, length presets, one-tap generate with monthly usage accounting.
- **Music**: beat-synced soundtrack attached to output, changeable, gated PRO.
- **Multi-format reveal**: one trip yields reel + post + carousel + story; auto-generated caption on social formats; watermark on free.
- **Export & share**: export to camera roll / share sheet for posting to Instagram, etc.
- **Monetization**: SCENR Pro subscription removing watermark and raising limits; A/B-tested paywall.

## 3. Personas & Core User Stories

| Persona | Goal | Why SCENR |
|---|---|---|
| The Organizer (primary) | Wants great content from the whole group without chasing people for photos or editing anything. | Creates the trip, pools everyone's media in one link, gets postable content in minutes. |
| The Contributor | Was on the trip, has photos/videos, won't install an app. | Taps a link, drops media in the browser, done. Optionally credited by name. |
| The Poster | Cares about how their feed looks; wants an on-aesthetic, non-generic result. | Theme matching + Pinterest-informed selection + custom music make output feel hand-made. |
| Free explorer | Testing the product on one trip. | Two trips/month with capped uploads is enough to feel the magic and hit the upgrade moment. |

Representative user stories:
- As an organizer, I can invite my group with one link so anyone can contribute without downloading anything.
- As a poster, I can upload my own song so the reel is cut to a track that fits my vibe.
- As a poster, I can pick a theme and trust that SCENR selects photos that actually match that aesthetic.
- As a creator, I can generate a caption from the content, write my own, or pick a theme preset.
- As an organizer, I can see who contributed what and how the trip content is performing.

## 4. New Capability Specifications

### 4.1 Pinterest Theme Intelligence Engine

Themes today are essentially color/grade presets (Golden Hour, Neon Nights, Film Grain, Coastal…). The Pinterest engine upgrades a theme from a look-up-table into a learned visual context: a reference distribution of what "great" photography in that theme actually looks like. That context then drives smarter selection and matching of the user's own media.

**4.1.1 Objective**
- Build, per theme, a reference embedding + compositional profile from the best on-theme photography.
- Use that profile to score, rank, and match a trip's raw media so selected shots feel intentionally on-aesthetic, not random.
- Keep it fresh: aesthetics drift, so the reference set is refreshed on a schedule.

**4.1.2 How it works (pipeline)**
1. **Curate seed queries.** Each theme maps to a curated set of Pinterest search terms and board seeds (e.g. Golden Hour → "golden hour portrait," "sunset travel photography," "warm film 35mm").
2. **Harvest candidates.** Collect candidate images per query. Because Pinterest's official API only searches a user's own pins and its ToS forbids storing API data, Pinterest is used as a one-time offline research input only; the shippable production corpus is built from open/licensed image APIs (see §4.1.6).
3. **Quality gate.** Filter for resolution, engagement/save signals, aesthetic-score model, and de-duplicate near-identical pins.
4. **Feature extraction.** For each kept image compute: a CLIP-style embedding, dominant color palette + LUT profile, composition features (rule-of-thirds, horizon, subject scale, symmetry), lighting (warmth, contrast, dynamic range), grain/texture, and subject tags.
5. **Build the theme profile.** Aggregate into a centroid embedding + covariance, a canonical palette/LUT, and target distributions for composition and lighting. This is the "theme fingerprint."
6. **Match user media.** At generation time, embed each trip photo/frame and score it against the fingerprint (cosine similarity to centroid + distance to target distributions). High scorers are preferred; the LUT informs the grade.

**4.1.3 Matching & scoring model**

Each candidate item gets a composite theme-fit score:

```
theme_fit = w1·cos(embedding, theme_centroid) + w2·palette_match + w3·composition_fit + w4·lighting_fit − w5·redundancy_penalty
```

Weights are theme-tuned. `redundancy_penalty` demotes shots too similar to already-selected media so the final set stays varied.

**4.1.4 Data & refresh**
- **Storage**: vector store (e.g. pgvector / a managed vector DB) keyed by theme_id → centroid, palette, distribution params, plus a small set of exemplar thumbnails for QA.
- **Refresh cadence**: themes re-harvested periodically from open/licensed sources (not live Pinterest) so fingerprints track current aesthetics without any external runtime dependency.
- **Cold start**: ship v1 fingerprints built offline so there is no live third-party dependency at request time.

**4.1.5 Compliance & risk**
- Store derived features only (embeddings, palettes, LUTs, distribution statistics) — never persist or redistribute third-party source images.
- The production corpus is built from sources whose licenses explicitly permit downloading, analysis, and storage; per-source attribution requirements are honored.
- Pinterest is not a runtime dependency and is not scraped continuously; any Pinterest use is a one-time, offline research step (§4.1.6).

**4.1.6 Theme Fingerprint — data sourcing & processing**

The official Pinterest API only searches a user's own pins (no platform-wide discovery), and its Developer ToS forbids storing data pulled from the API. Both facts rule out Pinterest as a production data pipe. The resolution is a two-phase strategy: use Pinterest once, offline, purely to learn taste; then build and refresh the shippable corpus from open/licensed image APIs that permit analysis and storage.

*Phase A — One-time Pinterest research harvest (Apify)*. Run once, offline, as a research burst — not production infrastructure.
1. **Seed.** For each theme, define starter Pinterest queries + board URLs.
2. **Harvest via Apify.** Use a Pinterest search-scraper actor (pay-per-result, ~$30 / 10k pins) in a single capped burst; write image URLs + metadata to a temporary bucket.
3. **Quality gate (local).** Resolution filter, perceptual-hash de-dup, aesthetic-score model, drop off-theme.
4. **Feature extraction (local model).** Run a local CLIP / aesthetic model on your own GPU to compute embeddings, palettes, lighting, and composition features — nothing leaves your infra.
5. **Cluster & analyze.** Cluster the derived features per theme to surface the recurring visual patterns that define each aesthetic.
6. **Delete source images.** Purge the temporary bucket. Only derived statistics remain.

Control — **delete-source-images**: Source images are deleted immediately after feature extraction. Only derived statistics (embeddings, palettes, LUTs) persist. This converts a "scraping + storing copyrighted images" problem into a bounded, one-time research act, and leaves nothing redistributable on our infrastructure.

*Phase B — Derive portable seed queries.* Translate the clusters from Phase A into a source-agnostic seed dictionary: keyword sets, tag lists, and color/lighting/composition descriptors that can be replayed against any image API. Output: a per-theme seed-query dictionary `{ theme_id: { keywords[], tags[], palette_hints[], lighting_terms[] } }`. Benefit: queries are validated against real trending aesthetics, but carry no Pinterest data or dependency forward.

*Phase C — Build the production corpus from open/licensed APIs.* Replay the Phase-B seed queries against image APIs whose licenses permit download, analysis, and storage. Rebuild the theme fingerprints from these results — this is the corpus you actually ship and refresh.

| Source | API / license | Fit for fingerprinting |
|---|---|---|
| Unsplash | Free API; Unsplash License permits use + analysis; attribution + hotlinking rules apply. | Strong — large, high-aesthetic travel/lifestyle catalog matching most themes. |
| Pexels | Free API; Pexels License (free use, attribution appreciated not required). | Strong — good video too, useful later for motion references. |
| Pixabay | Free API; Pixabay content license. | Good volume; slightly more generic; useful for breadth. |
| Openverse | API aggregating CC-licensed + public-domain images. | Good for clearly-licensed, storable exemplars with provenance. |
| Wikimedia Commons | Open API; public-domain / CC content. | Reliable public-domain fallback; strong for landmarks/destinations. |
| Flickr (CC filter) | API with license filtering (CC / public domain). | Large, authentic, non-stock look; filter to permissive licenses only. |
| Licensed stock | Paid catalogs with model/property releases. | Cleanest legally; use if a theme needs guaranteed-clear imagery. |

Same local processing: Phase C reuses the exact quality-gate + feature-extraction pipeline from Phase A, so fingerprints from open sources are directly comparable. Refresh: re-run Phase C on a schedule (queries stay fixed; imagery refreshes) to track drift — no Pinterest, no scraping in the loop. Per-source terms: honor each source's attribution, rate-limit, and hotlinking rules; verify current license terms before ingest and maintain an allow-list with a per-source kill-switch.

**Resolved approach + open item**: Decision: Pinterest is a one-time offline research input (Phase A, delete-source control); the production corpus is built and refreshed from open/licensed APIs (Phase C). This removes the ToS storage conflict and the platform-search limitation. Before Phase A becomes standing infrastructure, run the scraping question past counsel — a scraped one-time research build is lower-risk than continuous scraping, but should be signed off for a fundraising-stage company.

### 4.2 Automated Reel Edit Pipeline

*(Out of scope for the MVP — see docs/plan.md. Retained here for reference.)*

The reel is produced by a deterministic, ordered pipeline. The requested sequence is explicit: collect the best videos → trim as much as possible → sync with a song → add transitions. Each stage hands a structured artifact to the next.

| Stage | Name | What happens |
|---|---|---|
| 1 | Collect best clips | Rank all source videos by a quality score (sharpness, exposure, stability, face/subject presence, motion energy, audio quality) combined with the §4.1 theme-fit score. Drop shaky, dark, duplicate, and off-theme clips. Output: an ordered shortlist of candidate segments with in/out hints. |
| 2 | Trim aggressively | Within each kept clip, find the single strongest moment (peak motion/expression/subject) and cut to the shortest compelling segment — typically 0.8–2.5s. Remove dead frames, pans-to-nothing, and handling at clip start/end. Output: tight sub-clips + a target total that matches the chosen length (15/30/60s). |
| 3 | Sync with song | Detect beats/onsets in the selected track (§4.3). Place cut points on beats; assign each trimmed sub-clip to a beat interval; align high-energy shots to musical peaks/drops. Output: a timeline where every cut lands on a beat. |
| 4 | Add transitions | Apply theme-appropriate transitions between beats — hard cut on strong beats, cross-dissolve/whip/zoom on softer ones. Add speed-ramps into drops. Apply the theme LUT/grade and the watermark (free tier). Output: render-ready edit decision list (EDL). |

**4.2.1 Design principles**: ordered & inspectable (each stage emits a JSON artifact so failures are debuggable); length-aware (Stage 2 and Stage 3 negotiate to fit exactly); music-first timing (cuts driven by the song, not vice versa); deterministic + seedable (same inputs + seed → same reel).

**4.2.2 Technical stack**: FFmpeg for decode/trim/concat/encode; lightweight on-frame models for sharpness/exposure/face/aesthetics; motion via optical flow / frame-diff energy; librosa/aubio/Essentia for beat detection; async job queue (worker + GPU pool) producing the EDL, then a render worker; target < ~2 min p50 end-to-end; server-side FFmpeg/ffcuts or a headless compositor for rendering.

Stage artifacts (contract): `shortlist.json → [{clip_id, in, out, quality, theme_fit}]`, `trims.json → [{clip_id, in, out, peak_ts, duration}]`, `beatmap.json → {bpm, beats:[t...], sections:[{drop_ts}]}`, `edl.json → [{src, in, out, at, transition, speed}] + {lut, watermark, captions}`.

### 4.3 Music System

*(Deferred for the MVP — see docs/plan.md. Retained here for reference.)*

Three capabilities: (a) let users upload their own MP3 to sync against a photo, carousel, or video; (b) waveform/beat detection to place cuts on key video moments; (c) an engine that suggests a song for the content.

**4.3.1 User-uploaded track (BYO song)**: Upload an MP3 (also accept M4A/WAV) from the generate sheet's music row; replaces the default beat-synced track. Applies to reels/videos (full beat-sync), carousels (track plays across slides; slide advance can snap to beats), and single photos (track becomes the audio bed of a photo-motion clip). User (or auto) selects the 15/30/60s window of the song to use — default to the detected chorus/hook. Normalize to platform target (~−14 LUFS) and fade in/out.

Legal note: user-uploaded copyrighted tracks can be muted by Instagram/TikTok rights systems on publish. Surface a warning, and prefer the licensed in-app library for guaranteed-safe posting. Confirm the music licensing model — this is a gating legal decision.

**4.3.2 Waveform / beat detection & moment sync**: decode audio to PCM, compute amplitude envelope + mel-spectrogram; estimate BPM and beat grid, detect onsets; segment intro/verse/chorus/drop and compute an energy curve; per clip, find peak moments (motion spike, expression/laugh, jump, reveal); match high-energy video moments to musical peaks/drops, snap all cuts to the beat grid. Tooling: librosa/Essentia/aubio for tempo/onset/structure; WaveSurfer.js (or custom canvas) for client-side waveform + draggable sync markers.

**4.3.3 Song suggestion engine**: given the trip's media + chosen theme, recommend tracks from the licensed library. Signals: theme, media energy, destination/time metadata, output length, and what similar trips used successfully. Approach: map content features + theme to an audio-feature target (tempo, energy, valence, danceability), nearest-neighbor over the tagged music catalog, re-rank by trending + licensing status. UX: one "Suggested for this trip" pick by default plus a ranked list. Learning loop: log which suggestions get exported/kept to fine-tune ranking over time.

### 4.4 Captions System

For videos and posts, captions have three modes; the user can always edit the result before export.

| Mode | How it works | Notes |
|---|---|---|
| Write your own | Free-text editor with character count and hashtag helper. | Always available; becomes the default once edited. |
| Generate from content | A vision-language model reads the selected media + trip metadata (name, destination, dates) and drafts an on-brand caption with optional hashtags and emoji. | Offer a few variants (punchy / heartfelt / funny); one-tap regenerate. |
| Theme preset | Each of the 15 themes ships a small library of on-vibe caption templates with slots (e.g. "{destination} did something to us ✦"). | Fast, zero-typing; slots auto-filled from trip metadata. |

Where: caption editor appears on the reveal screen for Reel / Post / Carousel / Story; carousel already shows a generated caption in the prototype. Safety: generated captions pass a profanity/brand-safety filter; hashtags de-duplicated and capped. Persistence: last-used mode remembered per user; presets and generated variants are editable, never locked.

## 5. Free vs Premium Tiers

Free is deliberately generous enough to reach the "wow" on a real trip, but capped so heavy users convert. The two free levers are uploads per trip and trips per month; premium removes both.

| Capability | Free | Premium (SCENR Pro) |
|---|---|---|
| Photos / videos uploaded per trip | Capped (single cap covering photos + videos in one trip) | Unlimited |
| Trips per month | Max 2 trips / month | Unlimited |
| Generations | Limited (as shown: "1 of 2 free generations this month") | Unlimited (marketed as 30 reels/mo) |
| Watermark | SCENR watermark on outputs | No watermark |
| Upload your own MP3 | — | Yes |
| Beat-synced music + song suggestions | Limited / preview | Full |
| Themes | Subset | All 15 themes |
| Instagram aesthetic matching (Pinterest engine) | Basic | Full theme-fit matching |
| Price | $0 | $12.99 / mo · $99.99 / yr (save 36%) |

### 5.1 Enforcement logic
- **Upload cap**: counted at the trip level across all contributors' photos + videos combined; the appless uploader and the in-app uploader both check remaining quota before accepting media.
- **Trip cap**: a rolling monthly counter (per owner account); creating a 3rd trip in a calendar month triggers the paywall.
- **Graceful limits**: when a contributor hits the trip's upload cap, show the organizer an upgrade prompt rather than silently dropping media.
- **Server-authoritative**: all counters enforced server-side; client displays remaining quota.

**Needs a decision**: Exact numeric caps: what is the per-trip photo/video cap on free (e.g. 30? 50?), and is the monthly generation cap 2 (per the setup screen) independent of the 2-trip cap? Recommend instrumenting a value that reliably produces the upgrade moment without gutting first-trip magic.

## 6. Appless Trip & Trip Insights

"Appless" is the wedge: contributors participate through a web link with no download.

### 6.1 Appless contribution flow
1. Organizer creates a trip and shares the invite (QR or scenr.app/join/<slug>) via Messages/WhatsApp/copy link.
2. Contributor opens the link in a mobile browser — served the branded join page.
3. They tap-to-choose or drag-and-drop photos + videos; optional "What should we call you?" name for attribution.
4. Media uploads directly to trip storage (resumable, chunked, background); the organizer's pool updates Live.
5. No account required to contribute; the organizer owns the trip and generation.

**6.1.1 Technical notes**
- **Upload**: presigned direct-to-storage uploads (e.g. S3/GCS) with client-side compression; resumable for large videos on mobile networks.
- **Live pool**: realtime channel (websocket / Supabase realtime) pushes new items to the organizer's grid and the Live badge.
- **Abuse controls**: per-link rate limits, file-type/size validation, malware/nsfw scan, and organizer moderation (remove item / block contributor).
- **Identity**: lightweight per-contributor token in the link session for attribution without full auth.

### 6.2 Trip Insights

*(Deferred for the MVP.)*

| Insight | What it surfaces |
|---|---|
| Contribution breakdown | Items per contributor, photos vs videos, first/last upload time, and % of the pool each person supplied. |
| Collection health | Total items, coverage across the trip's dates/locations, and a "ready to generate" signal once enough quality media exists. |
| Best material | Top-scored clips/photos (from §4.1 theme-fit + §4.2 quality) so the organizer sees the highlights that will drive reels. |
| Generation history | Which formats/themes were generated, how many free generations remain, and quick regenerate. |
| Post-share performance (roadmap) | If exported via connected accounts, pull back views/likes/saves to show which SCENR outputs performed — feeding the song-suggestion learning loop. |
| Nudges | Actionable prompts: "3 friends haven't uploaded — resend link," "Add 5+ videos to unlock a 60s reel." |

Access: insights live on the trip screen (organizer-only by default) and in the trips archive card summary. Privacy: contributor-level stats visible to the organizer; contributors see only their own contribution confirmation.

## 7. System Architecture (High Level)

*(The full microservice topology below is the long-term/aspirational architecture — see `docs/plan.md` for the actual MVP stack, which collapses this into Supabase + a small render worker.)*

End-to-end, the system is a mobile client + appless web uploader on top of an API, an async media/AI pipeline, and a set of intelligence engines.

- **Clients**: iOS/Android app (create, pool, generate, reveal, export); appless web uploader (contribute).
- **API + data**: auth, trips, media metadata, quotas/billing; Postgres (+ pgvector for theme/music embeddings); object storage for media; realtime channel for the live pool.
- **Pipeline workers**: scoring → trim → beatmap → EDL → render (GPU pool, async queue), emitting the Stage artifacts from §4.2.
- **Intelligence engines**: Pinterest Theme Engine (§4.1), Beat/Waveform + Song Suggestion (§4.3), Caption generation (VLM/LLM), all called by the pipeline.
- **Billing**: subscription + quota service enforcing tier limits (§5); paywall analytics for the A/B variants.

**Request path (generate a reel)**: Client posts generate request (trip, type=Reel, theme, length, track) → Quota service checks tier limits; on fail → paywall → Pipeline pulls pool media, scores + theme-fits (Pinterest engine), builds shortlist → trims → beatmap (music engine) → EDL → Render worker composites LUT + transitions + captions + (free) watermark → Reveal screen streams the result; sibling formats (post/carousel/story) generated from the same selection.

## 8. Core Data Model (Sketch)

| Entity | Key fields |
|---|---|
| User | id, auth, plan (free/pro), trips_this_month, subscription_status |
| Trip | id, owner_id, name, dates?, destination?, status (live/archived), created_at |
| Contributor | id, trip_id, display_name?, session_token (appless) |
| MediaItem | id, trip_id, contributor_id, type (photo/video), storage_url, duration?, quality_score, theme_fit_scores{}, is_favourite |
| ThemeFingerprint | theme_id, centroid_vec, palette/LUT, distribution_params, refreshed_at |
| Track | id, source (library/user_upload), audio_features{tempo,energy,valence}, hook_ts, license_status |
| Generation | id, trip_id, type, theme_id, length, track_id, edl_ref, output_url, watermark, caption, seed |
| QuotaLedger | user_id, period, trips_created, generations_used, uploads_per_trip{} |

See `docs/plan.md` for the actual MVP schema (adds `content_category` on MediaItem and `composition_template` on ThemeFingerprint for the mood-based composition engine; drops Track since music is deferred).

## 9. Success Metrics

- **Activation**: % of new trips that reach a first generated output; median time create→first reveal (target ≤ ~2 min processing).
- **Collaboration**: avg contributors per trip; % trips with ≥1 appless contributor; media items per trip.
- **Output quality**: export rate per generation; regenerate rate (proxy for dissatisfaction); % outputs actually shared.
- **Music**: % generations using suggested song vs uploaded vs default; suggestion accept rate.
- **Monetization**: free→Pro conversion, paywall variant win rate, cap-triggered upgrades (upload cap vs trip cap vs watermark).
- **Retention**: trips per user per month; month-2 retention; archived-trip revisits.

## 10. Phased Roadmap

| Phase | Theme | Scope |
|---|---|---|
| P0 (exists) | Core loop | Trips, appless invite/upload, media pool, AI generate (4 formats, themes, length), reveal, export, paywall, archive. |
| P1 | Music + captions | BYO MP3 upload + trim; waveform/beat detection driving cuts; caption modes (write / generate / preset); tier enforcement (upload + trip caps). |
| P2 | Pinterest theme intelligence | Theme fingerprints, theme-fit scoring in selection, LUT-informed grading; song suggestion engine v1. |
| P3 | Insights + learning | Trip Insights dashboard, contribution nudges, post-share performance pull-back, suggestion/selection learning loops. |
| P4 | Scale & polish | Render performance, more themes, A/B paywall optimization, moderation tooling, internationalization. |

The MVP in `docs/plan.md` pulls a scoped slice of P0 + P2 (theme fingerprints + composition engine, no music) forward into a 2-week build, and defers P1's Reel/music work and P3/P4 entirely.

## 11. Risks & Open Questions

- **Music licensing**: BYO MP3 risks platform muting on publish; need a licensed catalog for guaranteed-safe posting. Decision required. *(Moot for MVP — music deferred.)*
- **Theme-corpus sourcing**: resolved to a two-phase model (one-time Pinterest research + open/licensed production corpus, §4.1.6); residual item is counsel sign-off on the one-time scrape.
- **Processing cost/latency**: GPU render + scoring at scale vs the ≤2-min promise; batching and caching selection artifacts is essential.
- **Free-tier calibration**: exact caps must produce the upgrade moment without starving first-trip magic; instrument and iterate.
- **Appless abuse**: open upload links need rate limiting, malware/NSFW scanning, and organizer moderation.
- **Quality variance**: user media is uneven; the pipeline must fail gracefully (fewer clips, longer holds) rather than produce bad reels.

End of document.
