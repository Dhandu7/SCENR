-- Fixes a column-ambiguity bug in 0002_storage.sql: the unqualified `name` inside
-- `storage.foldername(name)` resolved to `public.trips.name` (the trip's display name,
-- e.g. "Toronto 2026") rather than `storage.objects.name` (the object's path), because
-- Postgres favors the innermost FROM scope (the `trips` subquery) when a column name is
-- ambiguous. Confirmed via `pg_policies.qual` showing `storage.foldername(trips.name)`.
-- Splitting a slash-free trip name on '/' never matches a trip id, so both SELECT
-- policies granted access to nobody, ever — every createSignedUrl call 404'd, for any
-- user, since the bucket was created. Found while building the Media Pool screen
-- (docs/superpowers/plans/2026-07-14-media-pool.md Task 3), which was the first code to
-- actually read an object back (Day 1 only verified upload, never read/display).

drop policy if exists "trip_media_owner_select" on storage.objects;
create policy "trip_media_owner_select" on storage.objects for select
using (
  bucket_id = 'trip-media'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(storage.objects.name))[1]
    and trips.owner_id = auth.uid()
  )
);

drop policy if exists "renders_owner_select" on storage.objects;
create policy "renders_owner_select" on storage.objects for select
using (
  bucket_id = 'renders'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(storage.objects.name))[1]
    and trips.owner_id = auth.uid()
  )
);
