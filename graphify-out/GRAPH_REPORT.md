# Graph Report - .  (2026-07-18)

## Corpus Check
- 38 files · ~128,298 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 553 nodes · 758 edges · 65 communities (27 shown, 38 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.78)
- Token cost: 136,849 input · 8,000 output

## Community Hubs (Navigation)
- Upload Confirm/Ingest
- Mobile Trip/Generate Screens
- Contributor Web Deps
- rank-media Handler
- Theme Loader Aggregation
- Theme Composition Docs
- Expo App Config
- Contributor Web TSConfig
- SCENR Architecture Concepts
- Mobile Package Meta
- generate Edge Function
- Mobile TSConfig
- render-worker Service
- Auth & Contributor Design
- rank-media Score/Embed
- Theme Loader Package
- render-worker Package
- Mobile Reset Script
- Shared DB Types
- HEIC Upload Transcode
- Contributor Web API Client
- Mobile QR/Supabase Deps
- Mobile Pool Screen
- Pool Filter Utils
- Contributor Web Layout
- Contributor Web ESLint
- Contributor Web Supabase Client
- Contributor Web Next Config
- Contributor Web PostCSS
- Expo Core Dep
- Expo Device Dep
- Expo Font Dep
- Expo Glass Effect Dep
- Expo Image Dep
- Expo Linking Dep
- Expo Router Dep
- Expo Splash Screen Dep
- Expo Status Bar Dep
- Expo Symbols Dep
- Expo System UI Dep
- Expo UI Dep
- Expo Web Browser Dep
- React Dep
- React DOM Dep
- React Native Dep
- RN Async Storage Dep
- RN Community Slider Dep
- RN Gesture Handler Dep
- RN Reanimated Dep
- RN Safe Area Dep
- RN Screens Dep
- RN URL Polyfill Dep
- RN Web Dep
- RN Worklets Dep
- Shared CORS Helper
- Appless Contribution Feature
- Caption System Feature
- Architecture Doc
- PRD Document
- Free/Premium Tier System
- Media Ingestion Component
- SCENR Logo Design
- SCENR Product Concept

## God Nodes (most connected - your core abstractions)
1. `expo` - 17 edges
2. `compilerOptions` - 16 edges
3. `handleRankMedia()` - 16 edges
4. `Day 5: Theme Composition Engine + Theme-Fit + Color Grade Implementation Plan` - 14 edges
5. `Day 4: Naive Carousel Generate Pipeline Implementation Plan` - 12 edges
6. `GenerateDeps` - 11 edges
7. `SCENR 2-Week MVP Implementation Plan` - 11 edges
8. `rank-media Edge Function` - 11 edges
9. `expo-router` - 10 edges
10. `RankMediaDeps` - 10 edges

## Surprising Connections (you probably didn't know these)
- `API Gateway / BFF (Kong + GraphQL)` --references--> `expo`  [EXTRACTED]
  docs/architecture.html → apps/mobile/app.json
- `expo` --references--> `SCENR App Icon (Checkmark 'A')`  [INFERRED]
  apps/mobile/app.json → apps/mobile/assets/images/icon.png
- `Explore Tab Icon (Compass)` --references--> `expo`  [INFERRED]
  apps/mobile/assets/images/tabIcons/explore.png → apps/mobile/app.json
- `Home Tab Icon (House)` --references--> `expo`  [INFERRED]
  apps/mobile/assets/images/tabIcons/home.png → apps/mobile/app.json
- `Favourite Reservation (Bounded Hybrid) & Pre-Generation Swap` --semantically_similar_to--> `Graceful Degradation Everywhere (never 500 on missing theme/failed embedding)`  [INFERRED] [semantically similar]
  docs/plan.md → docs/superpowers/plans/2026-07-18-day5-theme-composition.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Organizer Generate → rank-media → generate → render-worker Flow** — mobile_generate_screen, rank_media_function, generate_function, render_worker_service [INFERRED 0.85]
- **Theme Composition Engine (mix + fit + grade) Components** — theme_fit_concept, cosine_module, select_slides_module, theme_grades_module, embed_photo_module [INFERRED 0.85]
- **Bounded-Hybrid Reservation → composition_template → select-slides Implementation Lineage** — docs_plan_bounded_hybrid_reservation, docs_plan_composition_template, select_slides_module [INFERRED 0.80]
- **Multi-App Supabase Integration Pattern** — contributor_web_app, mobile_app, supabase_auth, shared_supabase_credentials [INFERRED 0.95]
- **Invite Link Cross-App Flow** — mobile_app, contributor_web_app, invite_link_architecture [INFERRED 0.95]
- **Differentiated Authentication Architecture** — organizer_otp_authentication, contributor_appless_design, supabase_otp [INFERRED 0.85]
- **Days 1-3 Implementation Pipeline** — day1_appless_skeleton, day2_media_pool, day3_theme_loader [EXTRACTED 1.00]
- **Appless Walking Skeleton Tech Stack** — supabase_backend, expo_mobile_app, nextjs_contributor_web, edge_functions [EXTRACTED 1.00]
- **Three Core Edge Functions** — join_trip_function, contributor_upload_function, confirm_upload_function [EXTRACTED 1.00]
- **Realtime Media Pool System** — pool_screen, realtime_subscription, media_items_table [EXTRACTED 1.00]
- **Theme Loader Data Processing** — apify_harvest, voyage_embedding, anthropic_tagging, theme_fingerprints [EXTRACTED 1.00]

## Communities (65 total, 38 thin omitted)

### Community 0 - "Upload Confirm/Ingest"
Cohesion: 0.09
Nodes (24): ConfirmUploadDeps, ConfirmUploadRequest, ConfirmUploadResult, handleConfirmUpload(), buildDeps(), ContributorUploadDeps, handleContributorUpload(), sanitizeFileName() (+16 more)

### Community 1 - "Mobile Trip/Generate Screens"
Cohesion: 0.06
Nodes (23): plugins, styles, RankResult, ScoredMedia, Slot, styles, ThemeOption, GenerationStatus (+15 more)

### Community 2 - "Contributor Web Deps"
Cohesion: 0.05
Nodes (36): dependencies, heic2any, next, react, react-dom, @supabase/supabase-js, devDependencies, eslint (+28 more)

### Community 3 - "rank-media Handler"
Cohesion: 0.12
Nodes (19): CONTENT_CATEGORIES, handleRankMedia(), mapCapped(), MediaItemRow, RankMediaDeps, RankMediaResult, ThemeRow, clamp01() (+11 more)

### Community 4 - "Theme Loader Aggregation"
Cohesion: 0.14
Nodes (20): aggregateFingerprint(), computeCentroid(), computeCompositionTemplate(), computePalette(), normalizeVector(), CONTENT_CATEGORIES, embedImage(), extractFeatures() (+12 more)

### Community 5 - "Theme Composition Docs"
Cohesion: 0.17
Nodes (30): _shared/cosine.ts (parseVector, cosineSimilarity, combinedScore), Day 4 Report — Carousel Generate Pipeline, Day 5 Report — Theme Composition Engine + Theme-Fit + Color Grade, SCENR 2-Week MVP Implementation Plan, Favourite Reservation (Bounded Hybrid) & Pre-Generation Swap, Carousel Is the Hero Format, composition_template (theme category-mix data structure), Dynamic Composition Engine (mood-based selection, not a filter) (+22 more)

### Community 6 - "Expo App Config"
Cohesion: 0.07
Nodes (28): API Gateway / BFF (Kong + GraphQL), backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, reactCompiler (+20 more)

### Community 7 - "Contributor Web TSConfig"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 8 - "SCENR Architecture Concepts"
Cohesion: 0.09
Nodes (25): Claude Vision Content Tagging, Apify Pinterest Scraper, Appless Design Pattern (No Download Required), Slot-Fill Composition Algorithm, confirm-upload Edge Function, contributor-upload Edge Function, Day 1: Appless Walking Skeleton, Day 2: Media Pool (+17 more)

### Community 9 - "Mobile Package Meta"
Cohesion: 0.08
Nodes (23): devDependencies, jest, jest-expo, @types/jest, @types/react, typescript, @types/react, typescript (+15 more)

### Community 10 - "generate Edge Function"
Cohesion: 0.19
Nodes (7): GenerateDeps, GenerateResult, handleGenerate(), processGeneration(), gradeForTheme(), GRADES, ThemeGrade

### Community 11 - "Mobile TSConfig"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, **/*.ts, **/*.tsx, @/assets/* (+4 more)

### Community 12 - "render-worker Service"
Cohesion: 0.21
Nodes (4): composePost(), handleRender(), deps, server

### Community 13 - "Auth & Contributor Design"
Cohesion: 0.23
Nodes (12): Appless (No Auth) Contributor Access, Contributor Web App (Next.js), Expo Version Specification Requirement, Invite Link QR Code Architecture, Localhost Resolution Limitation for QR Scanning, Mobile App (Expo), Next.js Breaking Changes Caution, Organizer OTP Authentication Pattern (+4 more)

### Community 14 - "rank-media Score/Embed"
Cohesion: 0.31
Nodes (6): embedPhoto(), RankMediaRequest, buildDeps(), PhotoScore, scorePhoto(), stripMarkdownFence()

### Community 15 - "Theme Loader Package"
Cohesion: 0.20
Nodes (9): dependencies, @supabase/supabase-js, @supabase/supabase-js, name, private, scripts, start, test (+1 more)

### Community 16 - "render-worker Package"
Cohesion: 0.20
Nodes (9): dependencies, sharp, name, private, scripts, start, test, type (+1 more)

### Community 17 - "Mobile Reset Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 18 - "Shared DB Types"
Cohesion: 0.22
Nodes (8): Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables, TablesInsert, TablesUpdate

### Community 19 - "HEIC Upload Transcode"
Cohesion: 0.36
Nodes (5): UploadState, HeicConverter, isHeic(), normalizeForUpload(), toJpegName()

### Community 20 - "Contributor Web API Client"
Cohesion: 0.36
Nodes (7): callFunction(), confirmUpload(), ConfirmUploadResponse, joinTrip(), JoinTripResponse, requestUpload(), UploadRequestResponse

### Community 21 - "Mobile QR/Supabase Deps"
Cohesion: 0.29
Nodes (8): dependencies, expo-constants, react-native-qrcode-svg, react-native-svg, @supabase/supabase-js, @supabase/supabase-js, expo-constants, react-native-svg

### Community 22 - "Mobile Pool Screen"
Cohesion: 0.29
Nodes (7): FILTERS, LIVE_STATUS_META, LiveStatus, MediaRow, PoolScreen(), renderPoolGrid(), styles

### Community 23 - "Pool Filter Utils"
Cohesion: 0.43
Nodes (5): computePoolCounts(), filterMediaItems(), PoolFilter, PoolMediaItem, items

### Community 24 - "Contributor Web Layout"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Knowledge Gaps
- **209 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `eslintConfig`, `JoinTripResponse` (+204 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Mobile QR/Supabase Deps` to `Mobile Package Meta`, `Expo Core Dep`, `Expo Device Dep`, `Expo Font Dep`, `Expo Glass Effect Dep`, `Expo Image Dep`, `Expo Linking Dep`, `Expo Router Dep`, `Expo Splash Screen Dep`, `Expo Status Bar Dep`, `Expo Symbols Dep`, `Expo System UI Dep`, `Expo UI Dep`, `Expo Web Browser Dep`, `React Dep`, `React DOM Dep`, `React Native Dep`, `RN Async Storage Dep`, `RN Community Slider Dep`, `RN Gesture Handler Dep`, `RN Reanimated Dep`, `RN Safe Area Dep`, `RN Screens Dep`, `RN URL Polyfill Dep`, `RN Web Dep`, `RN Worklets Dep`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `expo-router` connect `Mobile Trip/Generate Screens` to `Mobile Pool Screen`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `serveJson()` connect `Upload Confirm/Ingest` to `rank-media Score/Embed`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `expo` (e.g. with `SCENR App Icon (Checkmark 'A')` and `Explore Tab Icon (Compass)`) actually correct?**
  _`expo` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _209 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Upload Confirm/Ingest` be split into smaller, more focused modules?**
  _Cohesion score 0.08599290780141844 - nodes in this community are weakly interconnected._
- **Should `Mobile Trip/Generate Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.06387921022067364 - nodes in this community are weakly interconnected._