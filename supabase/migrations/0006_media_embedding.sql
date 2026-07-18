-- Caches each trip photo's Voyage multimodal embedding (same 1024-dim space as
-- theme_fingerprints.centroid_vec) so rank-media can score theme-fit = cosine
-- similarity(photo, theme centroid) without re-embedding on every generation.
alter table media_items add column embedding vector (1024);
