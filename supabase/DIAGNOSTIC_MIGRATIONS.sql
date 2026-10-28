-- Diagnostic read-only. Run in Supabase SQL Editor BEFORE SQL 009.
SELECT
  to_regclass('public.delivery_queue') IS NOT NULL AS migration_004_queue,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='delivery_queue' AND column_name='attempted_at') AS migration_005_attempted_at,
  to_regclass('public.nashra_subscriptions') IS NOT NULL AS migration_006_billing,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.delivery_queue')
    AND tgname='nashra_v32_queue_insert' AND NOT tgisinternal) AS migration_008_guard;
-- All four values must be TRUE before running 009_subscription_limits.sql.
