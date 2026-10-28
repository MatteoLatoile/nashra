-- NASHRA V3.2 -- Safe queue reconciliation and bounded pending workload.
-- Requires migrations 004, 005 and 007. DOES NOT create a Cron job or publish messages.
-- Idempotent: safe to run again. Operates only with the server-side service_role.

create index if not exists delivery_queue_processing_age_v32
  on public.delivery_queue (attempted_at)
  where status = 'processing';
create index if not exists delivery_queue_approved_age_v32
  on public.delivery_queue (scheduled_at)
  where status = 'approved';

-- Return counts; never change a job back to approved or held.
-- A stuck processing job could already have reached Telegram: ALWAYS require manual verification.
create or replace function public.nashra_v32_reconcile_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stalled_count integer := 0;
  expired_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  with affected as (
    select q.id from public.delivery_queue q
    where q.status = 'processing' and q.attempted_at < now() - interval '15 minutes'
    order by q.attempted_at, q.id
    limit 100
    for update skip locked
  ), updated as (
    update public.delivery_queue q
       set status = 'needs_review',
           last_error = 'Tentative interrompue ou non confirmée : vérifiez manuellement Telegram avant toute action.',
           finished_at = now(), updated_at = now()
     where q.id in (select a.id from affected) and q.status = 'processing'
     returning q.id
  ) select count(*)::integer into stalled_count from updated;

  with affected as (
    select q.id from public.delivery_queue q
    where q.status = 'approved' and q.scheduled_at < now() - interval '24 hours'
    order by q.scheduled_at, q.id
    limit 100
    for update skip locked
  ), updated as (
    update public.delivery_queue q
       set status = 'blocked',
           last_error = 'Créneau expiré depuis plus de 24 heures : aucun envoi effectué.',
           finished_at = now(), updated_at = now()
     where q.id in (select a.id from affected) and q.status = 'approved'
     returning q.id
  ) select count(*)::integer into expired_count from updated;

  return jsonb_build_object('stalledFlagged', stalled_count, 'expiredFlagged', expired_count);
end;
$$;
revoke all on function public.nashra_v32_reconcile_queue() from public, anon, authenticated;
grant execute on function public.nashra_v32_reconcile_queue() to service_role;

-- Read-only migration marker exposed only to signed-in users.
create or replace function public.nashra_v32_migration_ready()
returns boolean language sql stable security invoker
set search_path = public
as $$ select true; $$;
revoke all on function public.nashra_v32_migration_ready() from public, anon;
grant execute on function public.nashra_v32_migration_ready() to authenticated, service_role;

-- Bound QUEUED jobs to reduce accidental excessive workload. Does not change existing jobs.
-- Serializes inserts for an individual owner to avoid concurrent over-capacity inserts.
create or replace function public.nashra_v32_queue_insert_guard()
returns trigger language plpgsql security invoker
set search_path = public
as $$
declare pending_count integer;
begin
  if auth.role() = 'authenticated' then
    if new.status <> 'held' then raise exception 'New tasks must be held'; end if;
    if new.scheduled_at < now() + interval '1 minute' or
       new.scheduled_at > now() + interval '90 days' then
       raise exception 'Task must be scheduled between 1 minute and 90 days ahead';
    end if;
    perform pg_advisory_xact_lock(hashtext(new.user_id::text), 3292);
    select count(*) into pending_count from public.delivery_queue q
      where q.user_id = new.user_id and q.status in ('held','approved','processing');
    if pending_count >= 500 then raise exception 'Maximum 500 pending operations'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists nashra_v32_queue_insert on public.delivery_queue;
create trigger nashra_v32_queue_insert
before insert on public.delivery_queue
for each row execute function public.nashra_v32_queue_insert_guard();
