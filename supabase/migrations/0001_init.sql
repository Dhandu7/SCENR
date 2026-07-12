-- SCENR MVP schema — see docs/plan.md "Data model" and "Dynamic composition engine"

create extension if not exists vector;

create type media_type as enum ('photo', 'video');
create type generation_type as enum ('post', 'carousel', 'story');
create type generation_status as enum ('pending', 'processing', 'complete', 'failed');
create type caption_mode as enum ('generated', 'custom', 'preset');
create type content_category as enum ('solo_portrait', 'group', 'scenery', 'food', 'action_fit', 'candid_funny');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  generations_used int not null default 0,
  created_at timestamptz not null default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  slug text not null unique,
  dates daterange,
  destination text,
  cover_image_url text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index trips_owner_id_idx on trips (owner_id);

create table contributors (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  display_name text,
  session_token text not null unique,
  created_at timestamptz not null default now()
);

create index contributors_trip_id_idx on contributors (trip_id);

create table media_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  contributor_id uuid references contributors (id) on delete set null,
  type media_type not null,
  storage_path text not null,
  thumbnail_path text,
  duration_seconds numeric,
  width int,
  height int,
  quality_score numeric,
  content_category content_category,
  theme_fit_scores jsonb not null default '{}'::jsonb,
  is_favourite boolean not null default false,
  created_at timestamptz not null default now()
);

create index media_items_trip_id_idx on media_items (trip_id);

-- One-time offline theme-loader script (scripts/theme-loader) populates this table;
-- the live app only ever reads it. composition_template holds the mood-mix distribution
-- derived from the theme's Pinterest exemplars (see docs/plan.md "Dynamic composition engine").
create table theme_fingerprints (
  theme_id text primary key,
  display_name text not null,
  centroid_vec vector (1024),
  palette jsonb,
  notes text,
  composition_template jsonb,
  sample_count int,
  refreshed_at timestamptz
);

create table generations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  type generation_type not null,
  theme_id text references theme_fingerprints (theme_id),
  length_preset text,
  status generation_status not null default 'pending',
  selection jsonb,
  output_url text,
  watermark boolean not null default true,
  caption text,
  caption_mode caption_mode,
  seed int,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generations_trip_id_idx on generations (trip_id);

-- Auto-create a profile row on signup
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

-- RLS: organizer app is scoped to owner_id = auth.uid(); contributor writes go through
-- service-role Edge Functions (join-trip, contributor-upload) keyed off session_token,
-- not anonymous RLS policies.
alter table profiles enable row level security;
alter table trips enable row level security;
alter table contributors enable row level security;
alter table media_items enable row level security;
alter table theme_fingerprints enable row level security;
alter table generations enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid () = id);

create policy "profiles_update_own" on profiles for update using (auth.uid () = id);

create policy "trips_owner_all" on trips for all using (auth.uid () = owner_id) with check (auth.uid () = owner_id);

create policy "contributors_owner_select" on contributors for select using (
  exists (
    select 1 from trips
    where trips.id = contributors.trip_id and trips.owner_id = auth.uid ()
  )
);

create policy "media_items_owner_select" on media_items for select using (
  exists (
    select 1 from trips
    where trips.id = media_items.trip_id and trips.owner_id = auth.uid ()
  )
);

create policy "media_items_owner_update" on media_items for update using (
  exists (
    select 1 from trips
    where trips.id = media_items.trip_id and trips.owner_id = auth.uid ()
  )
);

create policy "theme_fingerprints_select_all" on theme_fingerprints for select using (true);

create policy "generations_owner_all" on generations for all using (
  exists (
    select 1 from trips
    where trips.id = generations.trip_id and trips.owner_id = auth.uid ()
  )
) with check (
  exists (
    select 1 from trips
    where trips.id = generations.trip_id and trips.owner_id = auth.uid ()
  )
);
