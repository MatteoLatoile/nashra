-- NASHRA 016 — commercial limits enforced in PostgreSQL (after 015).
-- No changes to existing published messages, Stripe payment mode or stored sessions.
-- Use a database backup before applying. The user confirms migration 015 is installed.
BEGIN;

DO $check$
BEGIN
  IF to_regclass('public.nashra_plans') IS NULL
     OR to_regclass('public.nashra_usage_monthly') IS NULL
     OR to_regclass('public.delivery_queue') IS NULL
     OR to_regclass('public.workspaces') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_016_REQUIRES_015';
  END IF;
END;
$check$;

-- Both triggers use the same user-scoped lock as the reservation RPC (015).
-- SECURITY DEFINER is required so users cannot see or forge subscription records.
-- Rights are computed from the current subscription, not the cached entitlements.
CREATE OR REPLACE FUNCTION public.nashra_plan_limit_internal(p_user_id uuid, p_metric text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_plan text := 'free'; v_value integer;
BEGIN
  IF p_user_id IS NULL OR p_metric NOT IN ('groups','pending') THEN
    RAISE EXCEPTION 'NASHRA_INVALID_LIMIT';
  END IF;
  -- Never trust the client-chosen user_id.
  IF auth.role() = 'authenticated' AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_OWNERSHIP';
  END IF;
  IF auth.role() NOT IN ('authenticated','service_role') THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_UNAUTHORIZED';
  END IF;
  SELECT CASE WHEN s.status IN ('active','trialing')
        AND s.current_period_end > now()
        AND COALESCE(s.plan_slug,e.tier) IN ('pro','business')
       THEN COALESCE(s.plan_slug,e.tier) ELSE 'free' END
    INTO v_plan
  FROM public.nashra_subscriptions s
  LEFT JOIN public.nashra_entitlements e ON e.user_id = s.user_id
  WHERE s.user_id = p_user_id;
  SELECT CASE WHEN p_metric = 'groups' THEN p.max_active_groups ELSE p.max_pending_schedules END
    INTO v_value FROM public.nashra_plans p
  WHERE p.slug = COALESCE(v_plan,'free') AND p.is_active;
  IF v_value IS NULL THEN RAISE EXCEPTION 'NASHRA_PLAN_NOT_FOUND'; END IF;
  RETURN v_value;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_plan_limit_internal(uuid,text) FROM PUBLIC,anon,authenticated;
-- Invoked only by SECURITY DEFINER trigger functions; no API access needed.

-- Workspaces are JSON and directly writable by the logged-in user. A UI-only
-- check would be bypassable via PostgREST, so enforce the authorized groups here.
CREATE OR REPLACE FUNCTION public.nashra_workspace_groups_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_old integer := 0; v_new integer := 0; v_limit integer;
BEGIN
  IF auth.role() = 'authenticated' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_OWNERSHIP';
  END IF;
  IF auth.role() NOT IN ('authenticated','service_role') THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_UNAUTHORIZED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.user_id::text),4151);
  IF jsonb_typeof(NEW.data->'destinations') = 'array' THEN
    SELECT count(*) INTO v_new FROM jsonb_array_elements(NEW.data->'destinations') d
      WHERE d->>'authorized' = 'true';
  END IF;
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'destinations') = 'array' THEN
    SELECT count(*) INTO v_old FROM jsonb_array_elements(OLD.data->'destinations') d
      WHERE d->>'authorized' = 'true';
  END IF;
  v_limit := public.nashra_plan_limit_internal(NEW.user_id,'groups');
  -- Downgrade preserves every group: prevent INCREASES until back under cap.
  IF v_new > v_limit AND (TG_OP = 'INSERT' OR v_new > v_old) THEN
    RAISE EXCEPTION 'NASHRA_ACTIVE_GROUP_QUOTA_EXCEEDED (% of %)',v_new,v_limit;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS nashra_016_workspace_groups ON public.workspaces;
CREATE TRIGGER nashra_016_workspace_groups BEFORE INSERT OR UPDATE OF data ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.nashra_workspace_groups_guard();

-- Guard pending schedules even for server service-role routes. Does not count
-- individual manual sends, and never deletes historical schedules on downgrade.
CREATE OR REPLACE FUNCTION public.nashra_queue_pending_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_used integer; v_limit integer; v_old_active boolean := false;
BEGIN
  IF auth.role() = 'authenticated' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_OWNERSHIP';
  END IF;
  IF auth.role() NOT IN ('authenticated','service_role') THEN
    RAISE EXCEPTION 'NASHRA_QUOTA_UNAUTHORIZED';
  END IF;
  -- Manual send is counted in monthly sends, not pending schedules.
  IF NEW.job_key LIKE 'manual:%' THEN
    -- Only server-side nashra_manual_claim may create or alter manual jobs.
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'NASHRA_MANUAL_JOB_SERVICE_ONLY';
    END IF;
    IF TG_OP = 'INSERT' AND (NEW.status <> 'processing' OR NEW.campaign_id <> 'manual') THEN
      RAISE EXCEPTION 'NASHRA_INVALID_MANUAL_JOB';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('held','approved','processing','telegram_scheduled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old_active := OLD.status IN ('held','approved','processing','telegram_scheduled');
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.job_key IS DISTINCT FROM OLD.job_key THEN
      RAISE EXCEPTION 'NASHRA_QUEUE_IMMUTABLE_IDENTITY';
    END IF;
  END IF;
  IF v_old_active THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.user_id::text),4151);
  v_limit := public.nashra_plan_limit_internal(NEW.user_id,'pending');
  SELECT count(*) INTO v_used FROM public.delivery_queue q WHERE q.user_id = NEW.user_id
    AND q.job_key NOT LIKE 'manual:%'
    AND q.status IN ('held','approved','processing','telegram_scheduled');
  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'NASHRA_PENDING_SCHEDULE_QUOTA_EXCEEDED (% of %)',v_used,v_limit;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS nashra_016_queue_pending ON public.delivery_queue;
CREATE TRIGGER nashra_016_queue_pending BEFORE INSERT OR UPDATE OF status ON public.delivery_queue
  FOR EACH ROW EXECUTE FUNCTION public.nashra_queue_pending_guard();

-- Return whether a booking was newly created, under the SAME per-user lock.
-- Safe cleanup must never release an older, potentially attempted booking.
CREATE OR REPLACE FUNCTION public.nashra_reserve_send_with_origin(
  p_user_id uuid, p_idempotency_key text, p_announcement_id text,
  p_destination_id text, p_scheduled_at timestamptz
) RETURNS TABLE(reservation_id uuid, newly_created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_existing uuid; v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text),4151);
  SELECT r.id INTO v_existing FROM public.nashra_send_reservations r
    WHERE r.user_id=p_user_id AND r.idempotency_key=p_idempotency_key;
  SELECT public.nashra_reserve_one_send(p_user_id,p_idempotency_key,
    p_announcement_id,p_destination_id,p_scheduled_at) INTO v_id;
  RETURN QUERY SELECT v_id, (v_existing IS NULL);
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_reserve_send_with_origin(uuid,text,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_reserve_send_with_origin(uuid,text,text,text,timestamptz)
  TO service_role;

COMMIT;
