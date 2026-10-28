-- Nashra V2.3: non-executing approval queue. Run in Supabase SQL Editor.
create table if not exists public.delivery_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null,
  campaign_id text not null,
  announcement_id text not null,
  destination_id text not null,
  scheduled_at timestamptz not null,
  method text not null check (method in ('forward','repost')),
  status text not null default 'held' check (status in ('held','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,job_key)
);
create index if not exists delivery_queue_owner_date_idx on public.delivery_queue(user_id,scheduled_at);
alter table public.delivery_queue enable row level security;
revoke all on public.delivery_queue from anon;
grant select, insert, update on public.delivery_queue to authenticated;
drop policy if exists delivery_queue_select_own on public.delivery_queue;
create policy delivery_queue_select_own on public.delivery_queue for select to authenticated using (auth.uid() = user_id);
drop policy if exists delivery_queue_insert_own on public.delivery_queue;
create policy delivery_queue_insert_own on public.delivery_queue for insert to authenticated with check (auth.uid() = user_id and status = 'held');
drop policy if exists delivery_queue_update_own on public.delivery_queue;
-- Updates are restricted further by the API to cancellation. There is NO publishing worker in V2.3.
create policy delivery_queue_update_own on public.delivery_queue for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and status in ('held','cancelled'));
