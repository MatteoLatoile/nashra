-- NASHRA 020 — Guard current plan rights at EVERY send reservation,
-- including pre-existing reservations created before a subscription downgrade.
-- Source: additive follow-up to SQL 015/016/019. Does NOT delete groups, jobs,
-- reservations, Telegram schedules or subscription records.
-- Apply only once in the intended Supabase project after backing up.
-- IMPORTANT: messages already scheduled on Telegram's own servers cannot be
-- recalled by PostgreSQL; cancel them explicitly in Telegram if necessary.
BEGIN;

DO $check$
BEGIN
  IF to_regclass('public.nashra_plans') IS NULL
     OR to_regclass('public.nashra_usage_monthly') IS NULL
     OR to_regclass('public.nashra_send_reservations') IS NULL
     OR to_regclass('public.workspaces') IS NULL
     OR to_regclass('public.delivery_queue') IS NULL
     OR to_regprocedure('public.nashra_effective_plan(uuid)') IS NULL
     OR to_regprocedure('public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.nashra_reserve_send_with_origin(uuid,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.nashra_apply_subscription_event_v2(text,text,bigint,uuid,text,text,bigint,text,text,boolean,timestamptz,timestamptz,boolean,text,text)') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_020_REQUIRES_SQL_015_016_019';
  END IF;
END $check$;

-- Business is deliberately ONE connected Telegram account (not three).
UPDATE public.nashra_plans SET max_telegram_accounts = 1, updated_at = now()
WHERE slug = 'business' AND max_telegram_accounts IS DISTINCT FROM 1;

CREATE OR REPLACE FUNCTION public.nashra_reserve_one_send(
  p_user_id uuid,
  p_idempotency_key text,
  p_announcement_id text,
  p_destination_id text,
  p_scheduled_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_month date;
  v_existing public.nashra_send_reservations%ROWTYPE;
  v_limit integer;
  v_reserved uuid;
  v_count integer;
  v_group_limit integer;
  v_pending_limit integer;
  v_group_count integer;
  v_pending_count integer;
  v_existing_allocated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  IF p_user_id IS NULL OR p_scheduled_at IS NULL
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR p_announcement_id IS NULL OR length(p_announcement_id) NOT BETWEEN 1 AND 255
     OR p_destination_id IS NULL OR length(p_destination_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'NASHRA_INVALID_RESERVATION';
  END IF;

  -- Stabilise les operations concurrentes sur un compte, meme avant l'UPSERT.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text), 4151);
  v_month := pg_catalog.date_trunc('month', p_scheduled_at AT TIME ZONE 'UTC')::date;

  -- Re-evaluate CURRENT entitlements even when this send was reserved while
  -- the customer had a higher tier. Existing bookings are not a paid-plan pass.
  SELECT e.max_active_groups, e.max_pending_schedules, e.max_monthly_sends
    INTO v_group_limit, v_pending_limit, v_limit
  FROM public.nashra_effective_plan(p_user_id) e;
  IF v_group_limit IS NULL OR v_pending_limit IS NULL OR v_limit IS NULL THEN
    RAISE EXCEPTION 'NASHRA_PLAN_NOT_FOUND';
  END IF;

  -- Preserve group data on downgrade. Require the owner to disable surplus
  -- authorized groups; Nashra never chooses which groups to keep for them.
  SELECT count(*) INTO v_group_count
  FROM public.workspaces w
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    CASE WHEN pg_catalog.jsonb_typeof(w.data->'destinations') = 'array'
      THEN w.data->'destinations' ELSE '[]'::jsonb END
  ) AS d
  WHERE w.user_id = p_user_id AND d->>'authorized' = 'true';
  IF v_group_count > v_group_limit THEN
    RAISE EXCEPTION 'NASHRA_DOWNGRADE_GROUPS_EXCEEDED (% of %)',
      v_group_count, v_group_limit;
  END IF;

  -- Pending jobs created on a former paid tier are not deleted; new dispatch
  -- and bookings are blocked until the owner reduces the excess. Manual jobs
  -- are excluded, consistently with SQL 016.
  SELECT count(*) INTO v_pending_count
  FROM public.delivery_queue q
  WHERE q.user_id = p_user_id
    AND q.job_key NOT LIKE 'manual:%'
    AND q.status IN ('held','approved','processing','telegram_scheduled');
  IF v_pending_count > v_pending_limit THEN
    RAISE EXCEPTION 'NASHRA_DOWNGRADE_PENDING_EXCEEDED (% of %)',
      v_pending_count, v_pending_limit;
  END IF;

  SELECT * INTO v_existing FROM public.nashra_send_reservations r
  WHERE r.user_id = p_user_id AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.announcement_id <> p_announcement_id
       OR v_existing.destination_id <> p_destination_id
       OR v_existing.scheduled_at <> p_scheduled_at THEN
      RAISE EXCEPTION 'NASHRA_IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_existing.status = 'released' THEN
      RAISE EXCEPTION 'NASHRA_RESERVATION_ALREADY_RELEASED';
    END IF;
    -- Previously allocated paid-plan sends do not bypass the new monthly cap.
    SELECT m.allocated_sends INTO v_existing_allocated
    FROM public.nashra_usage_monthly m
    WHERE m.user_id = p_user_id AND m.usage_month = v_existing.usage_month;
    IF COALESCE(v_existing_allocated, 0) > v_limit THEN
      RAISE EXCEPTION 'NASHRA_DOWNGRADE_MONTHLY_EXCEEDED (% of %)',
        v_existing_allocated, v_limit;
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.nashra_usage_monthly (user_id, usage_month)
    VALUES (p_user_id, v_month)
  ON CONFLICT (user_id, usage_month) DO NOTHING;

  UPDATE public.nashra_usage_monthly m
    SET allocated_sends = m.allocated_sends + 1, updated_at = now()
    WHERE m.user_id = p_user_id AND m.usage_month = v_month
      AND m.allocated_sends < v_limit
    RETURNING m.allocated_sends INTO v_count;
  IF v_count IS NULL THEN
    RAISE EXCEPTION 'NASHRA_MONTHLY_SEND_QUOTA_EXCEEDED';
  END IF;

  INSERT INTO public.nashra_send_reservations (
    user_id, idempotency_key, announcement_id, destination_id,
    scheduled_at, usage_month
  ) VALUES (
    p_user_id, p_idempotency_key, p_announcement_id, p_destination_id,
    p_scheduled_at, v_month
  ) RETURNING id INTO v_reserved;
  RETURN v_reserved;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
