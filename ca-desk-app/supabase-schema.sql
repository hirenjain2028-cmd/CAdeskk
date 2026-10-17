-- CA Desk: run this once in Supabase → SQL Editor → New query → Run.
-- Every row belongs to one signed-in user. Nobody can read anyone else's data.

create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  kind       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.records enable row level security;

drop policy if exists "records: read own"   on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;
create policy "records: read own"   on public.records for select using (auth.uid() = user_id);
create policy "records: insert own" on public.records for insert with check (auth.uid() = user_id);
create policy "records: update own" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records: delete own" on public.records for delete using (auth.uid() = user_id);

-- Private bucket for files sent from the phone, waiting to be filed on the office PC.
-- The app deletes each file once it is saved to the PC, and anything older than 7 days.
insert into storage.buckets (id, name, public) values ('handoff', 'handoff', false)
on conflict (id) do nothing;

drop policy if exists "handoff: read own"   on storage.objects;
drop policy if exists "handoff: upload own" on storage.objects;
drop policy if exists "handoff: delete own" on storage.objects;
create policy "handoff: read own"   on storage.objects for select using (bucket_id = 'handoff' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "handoff: upload own" on storage.objects for insert with check (bucket_id = 'handoff' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "handoff: delete own" on storage.objects for delete using (bucket_id = 'handoff' and (storage.foldername(name))[1] = auth.uid()::text);
