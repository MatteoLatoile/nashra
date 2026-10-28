-- NASHRA V3.3. No payment or publication is activated by this migration.
-- Requires 004_delivery_queue.sql, 005_delivery_worker.sql, 006_billing_ops.sql
-- and 008_queue_reliability.sql; 007 is also required by the application.
-- This migration is repeatable and preserves all existing jobs and subscriptions.
DO $$ BEGIN
  IF to_regclass('public.delivery_queue') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_SQL_009: missing delivery_queue; apply SQL 004.';
  END IF;
  IF to_regclass('public.nashra_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_SQL_009: missing nashra_subscriptions; apply SQL 006.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='delivery_queue' AND column_name='attempted_at'
  ) THEN
    RAISE EXCEPTION 'NASHRA_SQL_009: attempted_at absent; apply SQL 005 before SQL 008 and 009.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.delivery_queue'::regclass AND tgname='nashra_v32_queue_insert' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'NASHRA_SQL_009: trigger V3.2 absent; apply SQL 008 before SQL 009.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nashra_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','business')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nashra_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_entitlements TO authenticated;
DROP POLICY IF EXISTS nashra_entitlements_read_own ON public.nashra_entitlements;
CREATE POLICY nashra_entitlements_read_own ON public.nashra_entitlements
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- INSERT/UPDATE/DELETE only via service_role, AFTER Stripe webhook signature verification.

-- The existing V3.2 trigger remains attached; replace only its implementation.
CREATE OR REPLACE FUNCTION public.nashra_v32_queue_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $$
DECLARE
  pending_count integer;
  account_tier text := 'free';
  max_pending integer := 100;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.status <> 'held' THEN
      RAISE EXCEPTION 'NASHRA_OWNERSHIP: tasks must belong to the signed-in user and start held';
    END IF;
    IF NEW.scheduled_at < now() + interval '1 minute' OR
       NEW.scheduled_at > now() + interval '90 days' THEN
      RAISE EXCEPTION 'NASHRA_SCHEDULE: schedule between 1 minute and 90 days ahead';
    END IF;
    -- The advisory transaction lock is per-user: concurrent inserts share one count.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text), 3292);
    SELECT tier INTO account_tier FROM public.nashra_entitlements
      WHERE user_id = NEW.user_id;
    max_pending := CASE COALESCE(account_tier, 'free')
      WHEN 'business' THEN 500 WHEN 'pro' THEN 300 ELSE 100 END;
    SELECT count(*) INTO pending_count FROM public.delivery_queue
      WHERE user_id = NEW.user_id AND status IN ('held','approved','processing');
    IF pending_count >= max_pending THEN
      RAISE EXCEPTION 'NASHRA_QUOTA_EXCEEDED: pending operation limit (%) reached', max_pending;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- No UPDATE trigger needed: existing V3.1 policies still control approvals/cancellation.
-- An existing account above the new limit remains intact; new inserts are blocked.
