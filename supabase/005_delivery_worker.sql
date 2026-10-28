-- NASHRA V2.4: execution opt-in. Run AFTER 004_delivery_queue.sql.
-- Every row starts held. User must explicitly approve it BEFORE scheduled_at.
-- In-progress/uncertain executions are never retried automatically.

alter table public.delivery_queue
  add column if not exists attempted_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists telegram_message_id bigint,
  add column if not exists last_error text;

alter table public.delivery_queue drop constraint if exists delivery_queue_status_check;
alter table public.delivery_queue add constraint delivery_queue_status_check
  check (status in ('held','approved','processing','sent','needs_review','blocked','cancelled'));

-- A signed-in user can approve/cancel a held job, but never alter the ownership,
-- destination, schedule, result or other execution attributes through PostgREST.
revoke update on public.delivery_queue from authenticated;
grant update (status, updated_at) on public.delivery_queue to authenticated;
drop policy if exists delivery_queue_update_own on public.delivery_queue;
create policy delivery_queue_update_own on public.delivery_queue for update to authenticated
  using (auth.uid() = user_id and status in ('held','approved'))
  with check (auth.uid() = user_id and status in ('held','approved','cancelled'));

create index if not exists delivery_queue_pending_v24_idx
  on public.delivery_queue(scheduled_at,created_at)
  where status = 'approved';
create index if not exists delivery_queue_attempts_v24_idx
  on public.delivery_queue(user_id,attempted_at desc)
  where attempted_at is not null;

-- SECURITY DEFINER RPC called EXCLUSIVELY with server-side service role.
-- Advisory transaction lock serializes claims across workers, preventing
-- multiple simultaneous attempts from the same account during cooldown.
create or replace function public.nashra_v24_claim_one()
returns setof public.delivery_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only server service_role may claim deliveries';
  end if;
  perform pg_advisory_xact_lock(7294, 24);
  return query
  with candidate as (
    select q.id
    from public.delivery_queue q
    where q.status = 'approved'
      and q.scheduled_at <= now()
      and q.scheduled_at > now() - interval '24 hours'
      -- Minimum 10 minutes between attempts for one personal account.
      and not exists (
        select 1 from public.delivery_queue p
        where p.user_id = q.user_id
          and p.attempted_at > now() - interval '10 minutes'
      )
      -- Minimum 60 minutes between attempts to the same destination.
      and not exists (
        select 1 from public.delivery_queue p
        where p.user_id = q.user_id and p.destination_id = q.destination_id
          and p.attempted_at > now() - interval '60 minutes'
      )
    order by q.scheduled_at, q.created_at, q.id
    for update skip locked
    limit 1
  )
  update public.delivery_queue q
     set status = 'processing', attempted_at = now(), updated_at = now()
   where q.id in (select id from candidate)
   returning q.*;
end;
$$;
revoke all on function public.nashra_v24_claim_one() from public, anon, authenticated;
grant execute on function public.nashra_v24_claim_one() to service_role;

-- Authorization policy changes are not automated. This migration does not enable
-- publishing, schedule jobs, modify personal sessions or install a cron trigger.
