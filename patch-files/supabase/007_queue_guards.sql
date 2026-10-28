-- Nashra V3.1 — run AFTER 004_delivery_queue.sql and 005_delivery_worker.sql.
-- Tightens user-level status changes even for direct authenticated PostgREST calls.
-- No job is created, approved or sent by this migration.

create or replace function public.nashra_v31_queue_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    -- Prevent unexpected field changes, regardless of future GRANT mistakes.
    if (to_jsonb(new) - 'status' - 'updated_at')
        is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'A queued job is immutable except its status';
    end if;
    if old.status = 'held' and new.status = 'approved' and
       old.scheduled_at > now() + interval '1 minute' then
      return new;
    end if;
    if old.status in ('held','approved') and new.status = 'cancelled' then
      return new;
    end if;
    raise exception 'Invalid user-level delivery transition';
  end if;
  -- Only the server service_role is allowed to mark processing/sent/review.
  if auth.role() = 'service_role' then return new; end if;
  raise exception 'Queue update role is not permitted';
end;
$$;

revoke all on function public.nashra_v31_queue_guard() from public, anon, authenticated;
drop trigger if exists nashra_v31_queue_transition on public.delivery_queue;
create trigger nashra_v31_queue_transition
before update on public.delivery_queue
for each row execute function public.nashra_v31_queue_guard();

-- Read-only check for the authenticated user's diagnostics page.
create or replace function public.nashra_v31_guard_version()
returns boolean
language sql stable security invoker
set search_path = public
as $$ select true; $$;
revoke all on function public.nashra_v31_guard_version() from public, anon;
grant execute on function public.nashra_v31_guard_version() to authenticated, service_role;

-- Defense in depth: only status/updated_at may be changed by authenticated users.
revoke update on public.delivery_queue from authenticated;
grant update (status, updated_at) on public.delivery_queue to authenticated;
