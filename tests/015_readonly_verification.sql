-- NASHRA 015 — Verification sans modification de donnees.
-- Coller dans Supabase SQL Editor APRES la migration 015.
DO $tests$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.nashra_plans;
  IF v_count < 3 THEN RAISE EXCEPTION '015: trois forfaits requis'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.nashra_plans
    WHERE slug = 'free' AND monthly_price_usd_cents = 0
      AND max_telegram_accounts = 1 AND max_active_groups = 3
      AND max_monthly_sends = 30 AND max_pending_schedules = 5
  ) THEN RAISE EXCEPTION '015: parametrage Gratuit incorrect'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nashra_plans
    WHERE slug = 'pro' AND monthly_price_usd_cents = 800
      AND annual_price_usd_cents = 8000 AND max_telegram_accounts = 1
      AND max_active_groups = 30 AND max_monthly_sends = 1000
      AND max_pending_schedules = 150
  ) THEN RAISE EXCEPTION '015: parametrage Pro incorrect'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nashra_plans
    WHERE slug = 'business' AND monthly_price_usd_cents = 1900
      AND annual_price_usd_cents = 19000 AND max_telegram_accounts = 3
      AND max_active_groups = 100 AND max_monthly_sends = 5000
      AND max_pending_schedules = 300 AND priority_support
  ) THEN RAISE EXCEPTION '015: parametrage Business incorrect'; END IF;

  IF to_regclass('public.nashra_billing_events') IS NULL
    OR to_regclass('public.nashra_usage_monthly') IS NULL
    OR to_regclass('public.nashra_send_reservations') IS NULL THEN
    RAISE EXCEPTION '015: table manquante';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'nashra_billing_events'
      AND indexdef LIKE '%provider_event_id%'
  ) THEN RAISE EXCEPTION '015: unicite evenements non detectee'; END IF;

  IF to_regprocedure('public.nashra_effective_plan(uuid)') IS NULL
    OR to_regprocedure('public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)') IS NULL
    OR to_regprocedure('public.nashra_finalize_one_send(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '015: fonctions metier manquantes';
  END IF;

  IF has_table_privilege('authenticated', 'public.nashra_subscriptions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.nashra_plans', 'INSERT')
    OR has_table_privilege('authenticated', 'public.nashra_usage_monthly', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.nashra_send_reservations', 'INSERT')
    OR has_table_privilege('authenticated', 'public.nashra_billing_events', 'INSERT') THEN
    RAISE EXCEPTION '015: droits client trop permissifs';
  END IF;

  IF has_function_privilege('authenticated',
       'public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)', 'EXECUTE')
    OR has_function_privilege('authenticated',
       'public.nashra_finalize_one_send(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '015: RPC de quotas accessible aux utilisateurs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN (
      'public.nashra_plans'::regclass,
      'public.nashra_billing_events'::regclass,
      'public.nashra_usage_monthly'::regclass,
      'public.nashra_send_reservations'::regclass
    ) AND NOT relrowsecurity
  ) THEN RAISE EXCEPTION '015: RLS desactive'; END IF;

  RAISE NOTICE 'NASHRA_015_OK : tables, tarifs, RPC, droits et RLS verifies';
END;
$tests$;

SELECT slug, monthly_price_usd_cents, annual_price_usd_cents,
       max_telegram_accounts, max_active_groups, max_monthly_sends,
       max_pending_schedules, priority_support
FROM public.nashra_plans ORDER BY display_order;
