insert into storage.buckets (id, name, public)
values ('trip-media', 'trip-media', false),
       ('renders', 'renders', false)
on conflict (id) do nothing;

create policy "trip_media_owner_select" on storage.objects for select
using (
  bucket_id = 'trip-media'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(name))[1]
    and trips.owner_id = auth.uid()
  )
);

create policy "renders_owner_select" on storage.objects for select
using (
  bucket_id = 'renders'
  and exists (
    select 1 from public.trips
    where trips.id::text = (storage.foldername(name))[1]
    and trips.owner_id = auth.uid()
  )
);
