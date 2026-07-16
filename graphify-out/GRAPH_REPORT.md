# Graph Report - .  (2026-07-16)

## Corpus Check
- 120 files · ~103,001 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 430 nodes · 548 edges · 51 communities (20 shown, 31 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 47
- Community 48
- Community 49
- Community 50

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `expo` - 13 edges
3. `AI Generation Pipeline (Post/Carousel/Story)` - 9 edges
4. `scripts` - 8 edges
5. `processTheme()` - 8 edges
6. `Mobile App (Expo)` - 8 edges
7. `Mobile App (React Native + Expo)` - 8 edges
8. `include` - 7 edges
9. `expo-router` - 7 edges
10. `aggregateFingerprint()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `SCENR Logo Glow (Blue Sphere)` --references--> `SCENR MVP Product`  [INFERRED]
  apps/mobile/assets/images/logo-glow.png → docs/plan.md
- `Explore Tab Icon (Compass)` --references--> `Mobile App (React Native + Expo)`  [INFERRED]
  apps/mobile/assets/images/tabIcons/explore.png → docs/plan.md
- `Home Tab Icon (House)` --references--> `Mobile App (React Native + Expo)`  [INFERRED]
  apps/mobile/assets/images/tabIcons/home.png → docs/plan.md
- `Mobile App (React Native + Expo)` --references--> `SCENR App Icon (Checkmark 'A')`  [INFERRED]
  docs/plan.md → apps/mobile/assets/images/icon.png
- `Free vs Premium Tier System` --conceptually_related_to--> `AI Generation Pipeline (Post/Carousel/Story)`  [INFERRED]
  docs/prd.md → docs/plan.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-App Supabase Integration Pattern** — contributor_web_app, mobile_app, supabase_auth, shared_supabase_credentials [INFERRED 0.95]
- **Invite Link Cross-App Flow** — mobile_app, contributor_web_app, invite_link_architecture [INFERRED 0.95]
- **Differentiated Authentication Architecture** — organizer_otp_authentication, contributor_appless_design, supabase_otp [INFERRED 0.85]
- **Days 1-3 Implementation Pipeline** — day1_appless_skeleton, day2_media_pool, day3_theme_loader [EXTRACTED 1.00]
- **Appless Walking Skeleton Tech Stack** — supabase_backend, expo_mobile_app, nextjs_contributor_web, edge_functions [EXTRACTED 1.00]
- **Three Core Edge Functions** — join_trip_function, contributor_upload_function, confirm_upload_function [EXTRACTED 1.00]
- **Realtime Media Pool System** — pool_screen, realtime_subscription, media_items_table [EXTRACTED 1.00]
- **Theme Loader Data Processing** — apify_harvest, voyage_embedding, anthropic_tagging, theme_fingerprints [EXTRACTED 1.00]

## Communities (51 total, 31 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (24): ConfirmUploadDeps, ConfirmUploadRequest, ConfirmUploadResult, handleConfirmUpload(), buildDeps(), ContributorUploadDeps, handleContributorUpload(), sanitizeFileName() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (26): plugins, styles, LandingScreen(), styles, styles, FILTERS, LIVE_STATUS_META, LiveStatus (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (38): AI Generation Pipeline (Post/Carousel/Story), Claude Vision Content Tagging, API Gateway / BFF (Kong + GraphQL), Apify Pinterest Scraper, Apify Pinterest Search-Scraper (Phase A), Appless Contribution Flow, Appless Web Uploader (Next.js), Explore Tab Icon (Compass) (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (20): aggregateFingerprint(), computeCentroid(), computeCompositionTemplate(), computePalette(), normalizeVector(), CONTENT_CATEGORIES, embedImage(), extractFeatures() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (23): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, reactCompiler, typedRoutes (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (23): devDependencies, jest, jest-expo, @types/jest, @types/react, typescript, @types/react, typescript (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): dependencies, next, react, react-dom, @supabase/supabase-js, react, react-dom, @supabase/supabase-js (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (17): Appless Design Pattern (No Download Required), confirm-upload Edge Function, contributor-upload Edge Function, Day 1: Appless Walking Skeleton, Day 2: Media Pool, Dependency Injection for Testability, Supabase Edge Functions, Expo Mobile App (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (10): JoinTripPage(), UploadState, callFunction(), confirmUpload(), ConfirmUploadResponse, joinTrip(), JoinTripResponse, requestUpload() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, **/*.ts, **/*.tsx, @/assets/* (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (12): Appless (No Auth) Contributor Access, Contributor Web App (Next.js), Expo Version Specification Requirement, Invite Link QR Code Architecture, Localhost Resolution Limitation for QR Scanning, Mobile App (Expo), Next.js Breaking Changes Caution, Organizer OTP Authentication Pattern (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (9): dependencies, @supabase/supabase-js, @supabase/supabase-js, name, private, scripts, start, test (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (9): dependencies, react-dom, react-native, react-native-worklets, @supabase/supabase-js, react-dom, @supabase/supabase-js, react-native (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (8): Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables, TablesInsert, TablesUpdate

### Community 17 - "Community 17"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Knowledge Gaps
- **186 isolated node(s):** `UploadState`, `geistSans`, `geistMono`, `metadata`, `eslintConfig` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 14` to `Community 6`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 35`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `expo` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AI Generation Pipeline (Post/Carousel/Story)` (e.g. with `Render Worker Service (Node.js)` and `Free vs Premium Tier System`) actually correct?**
  _`AI Generation Pipeline (Post/Carousel/Story)` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UploadState`, `geistSans`, `geistMono` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08880666049953746 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07781649245063879 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06827880512091039 - nodes in this community are weakly interconnected._