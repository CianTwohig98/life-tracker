-- Life Tracker: one private row of data per user. Paste into Supabase > SQL Editor > Run.
create table if not exists public.tracker_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.tracker_state enable row level security;
drop policy if exists "own row" on public.tracker_state;
create policy "own row" on public.tracker_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
