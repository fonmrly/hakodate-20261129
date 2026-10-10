-- Hakodate trip shared data. Deliberately isolated from sts.
create schema if not exists hakodate_trip_202611;

create table if not exists hakodate_trip_202611.trip_state (
  singleton boolean primary key default true check (singleton),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into hakodate_trip_202611.trip_state(singleton, data)
values (true, '{}'::jsonb)
on conflict (singleton) do nothing;

create table if not exists hakodate_trip_202611.photos (
  id text primary key,
  day_id text not null check (day_id in ('1128','1129','1130')),
  caption text not null default '',
  path text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.hakodate_trip_202611_get_state()
returns table(data jsonb, updated_at timestamptz)
language sql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
  select s.data, s.updated_at
  from trip_state s
  where s.singleton = true;
$$;

create or replace function public.hakodate_trip_202611_save_state(p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
declare v_now timestamptz := now();
begin
  update trip_state
  set data = coalesce(p_data, '{}'::jsonb), updated_at = v_now
  where singleton = true;
  return v_now;
end;
$$;

create or replace function public.hakodate_trip_202611_list_photos()
returns jsonb
language sql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'day', p.day_id,
        'caption', p.caption,
        'path', p.path,
        'created_at', p.created_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from photos p;
$$;

create or replace function public.hakodate_trip_202611_add_photo(
  p_id text, p_day_id text, p_caption text, p_path text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
begin
  insert into photos(id, day_id, caption, path)
  values (p_id, p_day_id, coalesce(p_caption,''), p_path)
  on conflict (id) do update set
    day_id = excluded.day_id,
    caption = excluded.caption,
    path = excluded.path;
end;
$$;

create or replace function public.hakodate_trip_202611_update_photo_caption(
  p_id text, p_caption text
)
returns void
language sql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
  update photos set caption = coalesce(p_caption,'') where id = p_id;
$$;

create or replace function public.hakodate_trip_202611_delete_photo(p_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, hakodate_trip_202611
as $$
declare v_path text;
begin
  delete from photos where id = p_id returning path into v_path;
  return v_path;
end;
$$;

revoke all on schema hakodate_trip_202611 from public, anon, authenticated;
grant usage on schema hakodate_trip_202611 to service_role;
grant all on all tables in schema hakodate_trip_202611 to service_role;
alter default privileges in schema hakodate_trip_202611 grant all on tables to service_role;

revoke all on function public.hakodate_trip_202611_get_state() from public, anon, authenticated;
revoke all on function public.hakodate_trip_202611_save_state(jsonb) from public, anon, authenticated;
revoke all on function public.hakodate_trip_202611_list_photos() from public, anon, authenticated;
revoke all on function public.hakodate_trip_202611_add_photo(text,text,text,text) from public, anon, authenticated;
revoke all on function public.hakodate_trip_202611_update_photo_caption(text,text) from public, anon, authenticated;
revoke all on function public.hakodate_trip_202611_delete_photo(text) from public, anon, authenticated;

grant execute on function public.hakodate_trip_202611_get_state() to service_role;
grant execute on function public.hakodate_trip_202611_save_state(jsonb) to service_role;
grant execute on function public.hakodate_trip_202611_list_photos() to service_role;
grant execute on function public.hakodate_trip_202611_add_photo(text,text,text,text) to service_role;
grant execute on function public.hakodate_trip_202611_update_photo_caption(text,text) to service_role;
grant execute on function public.hakodate_trip_202611_delete_photo(text) to service_role;

-- Storage bucket is created separately:
-- id/name: hakodate-trip-202611
-- private, 5 MiB/image, JPEG/PNG/WebP only.
