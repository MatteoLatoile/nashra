-- Nashra 064: add a per-account in-progress gate to the established 037 claim functions.
-- Apply only after migration 024; no Telegram requests or queued-job updates.
-- This changes ONLY claim eligibility, keeps the existing 30s/2min cooldowns.
-- Jobs left processing must be reconciled (SQL 008) and verified manually.
-- Nashra 037: shorter yet bounded personal-account send intervals.
-- Apply ONCE in LIVE after deploying the matching application code.
-- Does not send messages, reset pending tasks, change quotas, or install cron.
-- Requires SQL 005 and SQL 012.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.delivery_queue') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_064_REQUIRES_DELIVERY_QUEUE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'nashra_manual_claim' AND pronamespace = 'public'::regnamespace)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'nashra_v24_claim_one' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'NASHRA_064_REQUIRES_MIGRATION_024';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.nashra_manual_claim(
  p_user_id uuid, p_request_id uuid, p_announcement_id text, p_destination_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim a manual delivery';
  END IF;
  PERFORM pg_advisory_xact_lock(7294, 24);
  -- Do not claim a second delivery while any first attempt remains in progress.
  -- The 30-second cooldown alone cannot guarantee mutual exclusion.
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue p
    WHERE p.user_id = p_user_id AND p.status = 'processing'
  ) THEN
    RAISE EXCEPTION 'NASHRA_ACCOUNT_PROCESSING';
  END IF;
  -- Keep the existing 30-second cooldown for completed attempts.
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue q
    WHERE q.user_id = p_user_id
      AND q.attempted_at > now() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'NASHRA_MANUAL_COOLDOWN_ACCOUNT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue q
    WHERE q.user_id = p_user_id AND q.destination_id = p_destination_id
      AND q.attempted_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'NASHRA_MANUAL_COOLDOWN_DESTINATION';
  END IF;
  INSERT INTO public.delivery_queue (
    user_id,job_key,campaign_id,announcement_id,destination_id,
    scheduled_at,method,status,attempted_at
  ) VALUES (
    p_user_id,'manual:' || p_request_id::text,'manual',
    p_announcement_id,p_destination_id,now(),'repost','processing',now()
  ) RETURNING id INTO out_id;
  RETURN out_id;
END;
$$;
REVOKE ALL ON FUNCTION public.nashra_manual_claim(uuid,uuid,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_manual_claim(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.nashra_v24_claim_one()
RETURNS SETOF public.delivery_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only server service_role may claim deliveries';
  END IF;
  PERFORM pg_advisory_xact_lock(7294, 24);
  RETURN QUERY
  WITH candidate AS (
    SELECT q.id FROM public.delivery_queue q
    WHERE q.status = 'approved'
      AND q.scheduled_at <= now()
      AND q.scheduled_at > now() - interval '24 hours'
      -- A claim cannot overlap another still-processing attempt for this user.
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_queue p
        WHERE p.user_id = q.user_id AND p.status = 'processing'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_queue p
        WHERE p.user_id = q.user_id
          AND p.attempted_at > now() - interval '30 seconds'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_queue p
        WHERE p.user_id = q.user_id AND p.destination_id = q.destination_id
          AND p.attempted_at > now() - interval '2 minutes'
      )
    ORDER BY q.scheduled_at, q.created_at, q.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.delivery_queue q
     SET status = 'processing', attempted_at = now(), updated_at = now()
   WHERE q.id IN (SELECT id FROM candidate)
   RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.nashra_v24_claim_one() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_v24_claim_one() TO service_role;
COMMIT;
